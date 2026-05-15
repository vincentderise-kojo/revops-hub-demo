"""Claude-powered ICP classification."""

from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import dataclass
from pathlib import Path

from anthropic import Anthropic, APIError, APIStatusError, RateLimitError


logger = logging.getLogger(__name__)

MODEL = "claude-haiku-4-5-20251001"
MAX_TOKENS = 512
MAX_RETRIES = 3
BASE_BACKOFF_SEC = 2.0

CATEGORIES = ("ICP Fit", "Needs Human Review", "Unlikely ICP")


@dataclass
class ClassifierOutput:
    category: str
    evidence: str
    confidence: float


def load_system_prompt(prompts_dir: Path) -> str:
    return (prompts_dir / "system_icp.md").read_text()


def build_user_message(
    account_name: str,
    naics: str,
    annual_revenue: int | None,
    city: str,
    state: str,
    website_url: str,
    scraped_text: str,
) -> str:
    payload = {
        "account_name": account_name,
        "naics_code": naics or None,
        "annual_revenue": annual_revenue,
        "city": city or None,
        "state": state or None,
        "website_url": website_url or None,
        "scraped_text": scraped_text or None,
    }
    return (
        "Classify this account. Return JSON only.\n\n"
        + json.dumps(payload, indent=2)
    )


def parse_response(raw: str) -> ClassifierOutput:
    # Strip code fences if the model emitted them despite instructions
    stripped = raw.strip()
    fence = re.match(r"^```(?:json)?\s*(.*?)\s*```$", stripped, re.DOTALL)
    if fence:
        stripped = fence.group(1)

    try:
        data = json.loads(stripped)
    except json.JSONDecodeError as e:
        raise ValueError(f"Classifier returned non-JSON: {raw[:200]!r}") from e

    category = data.get("category", "")
    if category not in CATEGORIES:
        logger.warning(
            "Classifier returned unknown category %r; defaulting to Needs Human Review",
            category,
        )
        category = "Needs Human Review"

    return ClassifierOutput(
        category=category,
        evidence=str(data.get("evidence", ""))[:500],
        confidence=float(data.get("confidence", 0.0) or 0.0),
    )


def classify(
    client: Anthropic,
    system_prompt: str,
    *,
    account_name: str,
    naics: str,
    annual_revenue: int | None,
    city: str,
    state: str,
    website_url: str,
    scraped_text: str,
) -> ClassifierOutput:
    user_msg = build_user_message(
        account_name, naics, annual_revenue, city, state, website_url, scraped_text
    )

    last_err: Exception | None = None
    for attempt in range(MAX_RETRIES):
        try:
            resp = client.messages.create(
                model=MODEL,
                max_tokens=MAX_TOKENS,
                system=system_prompt,
                messages=[{"role": "user", "content": user_msg}],
            )
            raw = resp.content[0].text
            try:
                return parse_response(raw)
            except ValueError:
                # One-shot retry with explicit reminder
                logger.warning(
                    "JSON parse failed on attempt %d; retrying with reminder",
                    attempt + 1,
                )
                reminder = (
                    user_msg
                    + "\n\nReturn ONLY valid JSON. No commentary, no code fences."
                )
                resp = client.messages.create(
                    model=MODEL,
                    max_tokens=MAX_TOKENS,
                    system=system_prompt,
                    messages=[{"role": "user", "content": reminder}],
                )
                raw = resp.content[0].text
                try:
                    return parse_response(raw)
                except ValueError:
                    return ClassifierOutput(
                        category="Needs Human Review",
                        evidence="Classifier parse error",
                        confidence=0.0,
                    )
        except (RateLimitError, APIStatusError, APIError) as e:
            last_err = e
            backoff = BASE_BACKOFF_SEC * (2**attempt)
            logger.warning(
                "Anthropic error on attempt %d: %s — retrying in %ss",
                attempt + 1,
                e,
                backoff,
            )
            time.sleep(backoff)

    raise RuntimeError(f"Classifier failed after {MAX_RETRIES} retries: {last_err}")
