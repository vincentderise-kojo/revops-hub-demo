"""xlsx I/O for the ICP classifier. Tolerant of column variants per the spec."""

from __future__ import annotations

import math
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd


NAICS_COLUMN_VARIANTS = ["NAICS Code", "NAICS Code ", "NAICS", "Primary NAICS Code"]
WEBSITE_COLUMN_VARIANTS = ["Website", "Website URL", "URL"]

OUTPUT_COLUMNS = [
    "Updated Category",
    "Website Evidence",
    "Verification Method",
    "Scrape Timestamp",
]


@dataclass
class Account:
    name: str
    sfdc_id: str
    website: str
    naics: str
    annual_revenue: int | None
    city: str
    state: str
    address: str
    account_type: str
    account_owner: str
    sdr_owner: str


@dataclass
class ClassifiedRow:
    sfdc_id: str
    category: str
    evidence: str
    verification_method: str
    scraped_at: str


def parse_annual_revenue(value: Any) -> int | None:
    """Parse a revenue value that may be a string like '$50,000,000', a number, or blank."""
    if value is None:
        return None
    if isinstance(value, float) and math.isnan(value):
        return None
    if isinstance(value, (int,)) and not isinstance(value, bool):
        return int(value)
    if isinstance(value, float):
        return int(value)
    s = str(value).strip()
    if not s:
        return None
    s = s.replace("$", "").replace(",", "").strip()
    if not s:
        return None
    try:
        return int(float(s))
    except ValueError:
        return None


def _pick_column(df: pd.DataFrame, candidates: list[str]) -> str | None:
    for c in candidates:
        if c in df.columns:
            return c
    return None


def _cell(row: pd.Series, col: str | None) -> str:
    if col is None:
        return ""
    v = row.get(col)
    if v is None:
        return ""
    if isinstance(v, float) and math.isnan(v):
        return ""
    return str(v).strip()


def read_accounts(path: Path) -> list[Account]:
    df = pd.read_excel(path, dtype=object)

    naics_col = _pick_column(df, NAICS_COLUMN_VARIANTS)
    website_col = _pick_column(df, WEBSITE_COLUMN_VARIANTS)

    accounts: list[Account] = []
    for _, row in df.iterrows():
        accounts.append(
            Account(
                name=_cell(row, "Account Name"),
                sfdc_id=_cell(row, "Account ID (18 Char)"),
                website=_cell(row, website_col),
                naics=_cell(row, naics_col),
                annual_revenue=parse_annual_revenue(row.get("Annual Revenue")),
                city=_cell(row, "City"),
                state=_cell(row, "State"),
                address=_cell(row, "Address"),
                account_type=_cell(row, "Account Type"),
                account_owner=_cell(row, "Account Owner"),
                sdr_owner=_cell(row, "SDR Owner"),
            )
        )
    return accounts


def write_classified(
    input_path: Path,
    output_path: Path,
    results: list[ClassifiedRow],
) -> None:
    df = pd.read_excel(input_path, dtype=object)

    # Index results by SFDC id for join
    by_id = {r.sfdc_id: r for r in results}

    df["Updated Category"] = df["Account ID (18 Char)"].map(
        lambda sid: by_id[sid].category if sid in by_id else ""
    )
    df["Website Evidence"] = df["Account ID (18 Char)"].map(
        lambda sid: by_id[sid].evidence if sid in by_id else ""
    )
    df["Verification Method"] = df["Account ID (18 Char)"].map(
        lambda sid: by_id[sid].verification_method if sid in by_id else ""
    )
    df["Scrape Timestamp"] = df["Account ID (18 Char)"].map(
        lambda sid: by_id[sid].scraped_at if sid in by_id else ""
    )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_excel(output_path, index=False)
