"""Run the classifier against the validation fixture and report accuracy.

Invoked via `python classify.py --validate` or `python test_validation.py`.
"""

from __future__ import annotations

import os
import sys
from collections import Counter, defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
from anthropic import Anthropic
from dotenv import load_dotenv
from tqdm import tqdm

from cache import ClassificationCache
from classify import DomainThrottler, process_account
from classifier import load_system_prompt
from io_utils import Account


SCRIPT_DIR = Path(__file__).resolve().parent
FIXTURE_PATH = SCRIPT_DIR / "fixtures" / "validation_set.csv"
PROMPTS_DIR = SCRIPT_DIR / "prompts"
CACHE_PATH = SCRIPT_DIR / "validation_cache.json"
PASS_OVERALL = 0.90
PASS_PER_CLASS = 0.85


def _load_fixture() -> list[tuple[Account, str]]:
    df = pd.read_csv(FIXTURE_PATH)
    df = df[df["Skip"] == 0].reset_index(drop=True)

    pairs: list[tuple[Account, str]] = []
    for i, row in df.iterrows():
        rev = row.get("Annual Revenue")
        rev_int: int | None
        if pd.isna(rev) or rev == "":
            rev_int = None
        else:
            try:
                rev_int = int(float(rev))
            except ValueError:
                rev_int = None
        a = Account(
            name=str(row["Account Name"]),
            sfdc_id=f"VALID_{i:04d}",
            website=str(row["Website"]) if not pd.isna(row["Website"]) else "",
            naics="",
            annual_revenue=rev_int,
            city="",
            state=str(row["State"]) if not pd.isna(row["State"]) else "",
            address="",
            account_type="",
            account_owner="",
            sdr_owner="",
        )
        pairs.append((a, str(row["Expected Category"])))
    return pairs


def run() -> int:
    load_dotenv(SCRIPT_DIR / ".env.local")
    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("ERROR: ANTHROPIC_API_KEY not set.", file=sys.stderr)
        return 2

    pairs = _load_fixture()
    print(f"Running validation against {len(pairs)} fixture rows...")

    cache = ClassificationCache(CACHE_PATH)
    client = Anthropic()
    system_prompt = load_system_prompt(PROMPTS_DIR)
    throttler = DomainThrottler()

    results: list[tuple[str, str, str, str]] = []  # (name, expected, actual, evidence)
    with ThreadPoolExecutor(max_workers=5) as pool:
        futures = {pool.submit(process_account, a, client, system_prompt, cache, throttler): (a, exp)
                   for a, exp in pairs}
        with tqdm(total=len(pairs), desc="Validating") as bar:
            for fut in as_completed(futures):
                a, exp = futures[fut]
                row = fut.result()
                results.append((a.name, exp, row.category, row.evidence))
                bar.update(1)

    cache.save()

    # Metrics
    total = len(results)
    correct = sum(1 for _, exp, act, _ in results if exp == act)
    overall = correct / total if total else 0.0

    per_class_total: dict[str, int] = defaultdict(int)
    per_class_correct: dict[str, int] = defaultdict(int)
    for _, exp, act, _ in results:
        per_class_total[exp] += 1
        if exp == act:
            per_class_correct[exp] += 1

    # Confusion matrix
    confusion: dict[tuple[str, str], int] = Counter()
    for _, exp, act, _ in results:
        confusion[(exp, act)] += 1

    print("\n=== Validation Results ===")
    print(f"Overall accuracy: {correct}/{total} = {overall:.1%}  (threshold: {PASS_OVERALL:.0%})")
    print("\nPer-class accuracy:")
    for cls in ("ICP Fit", "Needs Human Review", "Unlikely ICP"):
        t = per_class_total.get(cls, 0)
        c = per_class_correct.get(cls, 0)
        acc = c / t if t else 1.0
        marker = "PASS" if acc >= PASS_PER_CLASS or t == 0 else "FAIL"
        print(f"  {cls}: {c}/{t} = {acc:.1%}  [{marker}]")

    print("\nConfusion matrix (rows=expected, cols=predicted):")
    classes = ["ICP Fit", "Needs Human Review", "Unlikely ICP"]
    print("  " + " | ".join(f"{c[:20]:>20}" for c in [""] + classes))
    for exp in classes:
        row = [exp[:20]]
        for act in classes:
            row.append(str(confusion.get((exp, act), 0)))
        print("  " + " | ".join(f"{cell:>20}" for cell in row))

    print("\nMisclassifications:")
    misses = [(n, e, a, ev) for n, e, a, ev in results if e != a]
    for name, exp, act, ev in misses:
        print(f"  [{exp} → {act}] {name}")
        print(f"      evidence: {ev}")

    overall_pass = overall >= PASS_OVERALL
    per_class_pass = all(
        (per_class_correct.get(cls, 0) / per_class_total.get(cls, 1)) >= PASS_PER_CLASS
        for cls in per_class_total
    )

    if overall_pass and per_class_pass:
        print("\n[VALIDATION PASSED]")
        return 0
    print("\n[VALIDATION FAILED]")
    return 1


if __name__ == "__main__":
    sys.exit(run())
