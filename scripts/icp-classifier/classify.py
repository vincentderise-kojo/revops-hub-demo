"""ICP classifier CLI entry point."""

from __future__ import annotations

import argparse
import concurrent.futures
import logging
import os
import sys
import threading
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from anthropic import Anthropic
from dotenv import load_dotenv
from tqdm import tqdm

from cache import ClassificationCache
from classifier import classify as llm_classify, load_system_prompt, ClassifierOutput
from io_utils import Account, ClassifiedRow, read_accounts, write_classified
from scraper import normalize_url, registered_domain, scrape, ScrapeResult


SCRIPT_DIR = Path(__file__).resolve().parent
PROMPTS_DIR = SCRIPT_DIR / "prompts"
CACHE_PATH = SCRIPT_DIR / "cache.json"
MAX_WORKERS = 16
PER_DOMAIN_DELAY_SEC = 1.5

logger = logging.getLogger("icp-classifier")


@dataclass
class _DomainThrottle:
    """Per-registered-domain lock + last-request timestamp."""
    lock: threading.Lock
    last_request_ts: float = 0.0


class DomainThrottler:
    def __init__(self, delay: float = PER_DOMAIN_DELAY_SEC):
        self.delay = delay
        self._state: dict[str, _DomainThrottle] = {}
        self._state_lock = threading.Lock()

    def wait(self, domain: str) -> None:
        with self._state_lock:
            t = self._state.setdefault(domain, _DomainThrottle(lock=threading.Lock()))
        with t.lock:
            now = time.time()
            elapsed = now - t.last_request_ts
            if elapsed < self.delay:
                time.sleep(self.delay - elapsed)
            t.last_request_ts = time.time()


def _verification_method(scrape_status: str) -> str:
    if scrape_status == "ok":
        return "Website scrape"
    return "Website inaccessible"


def _evidence_for_failure(result: ScrapeResult) -> str:
    if result.status == "dns_failure":
        return "Website unreachable (DNS)"
    if result.status == "timeout":
        return "Website timeout"
    if result.status == "http_error":
        if result.http_status:
            return f"Website returned {result.http_status}"
        return f"Website error: {result.error_detail[:100]}"
    if result.status == "parked":
        return "Parked domain"
    if result.status == "thin":
        return "Thin/empty website"
    return "Website inaccessible"


def process_account(
    account: Account,
    client: Anthropic,
    system_prompt: str,
    cache: ClassificationCache,
    throttler: DomainThrottler,
) -> ClassifiedRow:
    now_iso = datetime.now(timezone.utc).isoformat()

    normalized = normalize_url(account.website) if account.website else None

    # No website → Needs Review
    if not normalized:
        return ClassifiedRow(
            sfdc_id=account.sfdc_id,
            category="Needs Human Review",
            evidence="No website provided",
            verification_method="Website inaccessible",
            scraped_at=now_iso,
        )

    # Cache hit
    cached = cache.get(normalized)
    if cached is not None:
        return ClassifiedRow(
            sfdc_id=account.sfdc_id,
            category=cached["category"],
            evidence=cached["evidence"],
            verification_method=cached["verification_method"],
            scraped_at=cached.get("scraped_at", now_iso),
        )

    # Scrape
    throttler.wait(registered_domain(normalized))
    result = scrape(normalized, per_domain_delay=PER_DOMAIN_DELAY_SEC)

    if result.status != "ok":
        row = ClassifiedRow(
            sfdc_id=account.sfdc_id,
            category="Needs Human Review",
            evidence=_evidence_for_failure(result),
            verification_method="Website inaccessible",
            scraped_at=now_iso,
        )
        cache.set(normalized, {
            "category": row.category,
            "evidence": row.evidence,
            "verification_method": row.verification_method,
            "scraped_at": row.scraped_at,
        })
        return row

    # Classify
    try:
        output: ClassifierOutput = llm_classify(
            client,
            system_prompt,
            account_name=account.name,
            naics=account.naics,
            annual_revenue=account.annual_revenue,
            city=account.city,
            state=account.state,
            website_url=normalized,
            scraped_text=result.text,
        )
    except Exception as e:
        logger.exception("Classifier failed hard for %s: %s", account.name, e)
        row = ClassifiedRow(
            sfdc_id=account.sfdc_id,
            category="Needs Human Review",
            evidence=f"Classifier error: {e}"[:500],
            verification_method="Classifier parse error",
            scraped_at=now_iso,
        )
        return row

    row = ClassifiedRow(
        sfdc_id=account.sfdc_id,
        category=output.category,
        evidence=output.evidence,
        verification_method="Website scrape",
        scraped_at=now_iso,
    )
    cache.set(normalized, {
        "category": row.category,
        "evidence": row.evidence,
        "verification_method": row.verification_method,
        "scraped_at": row.scraped_at,
    })
    return row


def run(args: argparse.Namespace) -> int:
    load_dotenv(SCRIPT_DIR / ".env.local")

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )

    if args.dry_run:
        accounts = read_accounts(Path(args.input))
        print(f"Parsed {len(accounts)} accounts from {args.input}")
        with_url = sum(1 for a in accounts if a.website)
        print(f"  With Website: {with_url}")
        print(f"  Without Website: {len(accounts) - with_url}")
        # Show first 3 for sanity
        for a in accounts[:3]:
            print(f"  - {a.name} | {a.website} | NAICS={a.naics} | Rev={a.annual_revenue}")
        return 0

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ERROR: ANTHROPIC_API_KEY not set. Copy .env.local.example to .env.local.", file=sys.stderr)
        return 2

    input_path = Path(args.input)
    output_path = Path(args.output)

    accounts = read_accounts(input_path)
    cache = ClassificationCache(CACHE_PATH, fresh=args.fresh)
    client = Anthropic()
    system_prompt = load_system_prompt(PROMPTS_DIR)
    throttler = DomainThrottler(delay=PER_DOMAIN_DELAY_SEC)

    print(f"Classifying {len(accounts)} accounts. Cache has {cache.size} entries.")

    results: list[ClassifiedRow] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as pool:
        futures = {
            pool.submit(process_account, a, client, system_prompt, cache, throttler): a
            for a in accounts
        }
        with tqdm(total=len(accounts), desc="Classifying") as bar:
            for fut in concurrent.futures.as_completed(futures):
                account = futures[fut]
                try:
                    row = fut.result()
                except Exception as e:
                    logger.exception("Worker crashed for %s: %s", account.name, e)
                    row = ClassifiedRow(
                        sfdc_id=account.sfdc_id,
                        category="Needs Human Review",
                        evidence=f"Worker error: {e}"[:500],
                        verification_method="Classifier parse error",
                        scraped_at=datetime.now(timezone.utc).isoformat(),
                    )
                results.append(row)
                bar.update(1)
                # Periodic cache save — caps exposure to ~N-1 rows of work if the script crashes mid-run.
                if len(results) % 100 == 0:
                    cache.save()

    cache.save()

    write_classified(input_path, output_path, results)

    # Summary
    counts: dict[str, int] = {}
    for r in results:
        counts[r.category] = counts.get(r.category, 0) + 1
    print("\n=== Classification Summary ===")
    for cat in ("ICP Fit", "Needs Human Review", "Unlikely ICP"):
        print(f"  {cat}: {counts.get(cat, 0)}")
    print(f"Output: {output_path}")
    return 0


def run_validate(args: argparse.Namespace) -> int:
    """Invoke test_validation.run() — defined in Task 11."""
    from test_validation import run as run_validation
    return run_validation()


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="ICP classifier CLI")
    p.add_argument("--input", type=str, help="Path to input xlsx")
    p.add_argument("--output", type=str, help="Path to output xlsx")
    p.add_argument("--dry-run", action="store_true", help="Parse and report counts; no scraping or classification")
    p.add_argument("--fresh", action="store_true", help="Ignore cache")
    p.add_argument("--validate", action="store_true", help="Run against the bundled validation fixture")
    return p


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.validate:
        return run_validate(args)

    if not args.input:
        parser.error("--input is required unless --validate is used")
    if not args.dry_run and not args.output:
        parser.error("--output is required unless --dry-run or --validate")

    return run(args)


if __name__ == "__main__":
    sys.exit(main())
