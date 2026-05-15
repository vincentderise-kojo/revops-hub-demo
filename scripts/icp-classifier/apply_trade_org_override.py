"""
ICP Classifier V2 — Trade Org Override (Approach A pilot)

STATUS (2026-05-04): SUPERSEDED. This is the binary-override pilot — it auto-flips
ANY non-ICP-Fit account to ICP Fit if the SFDC trade-org field is non-empty. Sales
(Jared, Jaime, sales managers) pushed back on the binary rule because non-MEP orgs
(NRCA roofing, ACPA concrete, AWCI/SWCCA/Cisca/Disca drywall/ceiling) flip at
99-100% and produce ~1,500 false positives. Replaced by `compare_override_vs_tier_shift.py`
which uses a tier-shift model (only MEP-aligned orgs; one tier up, not auto-flip).

Kept for audit. DO NOT run as production logic.

Reads:
  - outputs/master_results_<TS>.xlsx   (V1 classification, 26,181 accounts)
  - inputs/MM All Account Export 5.4.26(Trade Orgs).csv  (SFDC export with Trade Org fields)

Applies the override rule:
  if account is a member of ANY trade org (List OR Chapter List non-empty)
     AND ICP_Classification__c ∈ {"Unlikely ICP", "Needs Human Review"}
  then ICP_Classification_v2 = "ICP Fit"  (flip)
  else ICP_Classification_v2 = ICP_Classification__c  (carry-forward)

Writes:
  outputs/icp_v2_trade_org_override_<TS>.xlsx — multi-sheet:
    - Summary
    - Trade Org Flip Breakdown
    - Flipped Accounts
    - All Accounts (V2)
    - Definitions
"""

from __future__ import annotations
import sys
from datetime import datetime
from pathlib import Path
import pandas as pd

ROOT = Path(__file__).parent
MASTER_PATH = ROOT / "outputs" / "master_results_20260430_121924.xlsx"
TRADE_ORG_PATH = ROOT / "inputs" / "MM All Account Export 5.4.26(Trade Orgs).csv"

LIST_COL = "Trade Organization List"
CHAPTER_COL = "Trade Organization Chapter List"
JOIN_KEY = "Account ID (18 Char)"

FLIPPABLE = {"Unlikely ICP", "Needs Human Review"}


def normalize_orgs(s: str) -> list[str]:
    if not isinstance(s, str) or not s.strip():
        return []
    return [v.strip() for v in s.split(";") if v.strip()]


def main() -> None:
    if not MASTER_PATH.exists():
        sys.exit(f"missing master: {MASTER_PATH}")
    if not TRADE_ORG_PATH.exists():
        sys.exit(f"missing trade-org export: {TRADE_ORG_PATH}")

    master = pd.read_excel(MASTER_PATH)
    trade = pd.read_csv(TRADE_ORG_PATH, encoding="utf-8-sig", low_memory=False)

    print(f"master rows: {len(master):,}")
    print(f"trade-org rows: {len(trade):,}")

    # Slim trade df to join keys
    trade_slim = trade[[JOIN_KEY, LIST_COL, CHAPTER_COL]].drop_duplicates(subset=[JOIN_KEY])

    # Left-join master onto trade-org. Accounts in master but not in trade export
    # get blank trade-org fields (treat as no membership).
    merged = master.merge(trade_slim, on=JOIN_KEY, how="left", indicator=True)
    missing_in_trade = int((merged["_merge"] == "left_only").sum())
    merged = merged.drop(columns=["_merge"])
    print(f"master accts NOT found in trade export (deleted from SFDC since 4/30): {missing_in_trade:,}")

    merged[LIST_COL] = merged[LIST_COL].fillna("")
    merged[CHAPTER_COL] = merged[CHAPTER_COL].fillna("")

    # Membership flag
    merged["_list_orgs"] = merged[LIST_COL].apply(normalize_orgs)
    merged["_chapter_orgs"] = merged[CHAPTER_COL].apply(normalize_orgs)
    merged["Has Any Trade Org"] = merged.apply(
        lambda r: bool(r["_list_orgs"] or r["_chapter_orgs"]), axis=1
    )

    # Override rule
    prior = merged["ICP_Classification__c"].fillna("")
    will_flip = merged["Has Any Trade Org"] & prior.isin(FLIPPABLE)
    merged["ICP_Classification_v2"] = prior.where(~will_flip, "ICP Fit")
    merged["Flipped"] = will_flip
    merged["Flip From"] = prior.where(will_flip, "")

    # ── Build Summary ────────────────────────────────────────────────
    total = len(merged)
    members = int(merged["Has Any Trade Org"].sum())
    flipped_total = int(will_flip.sum())
    flipped_from_unlikely = int((will_flip & (prior == "Unlikely ICP")).sum())
    flipped_from_review = int((will_flip & (prior == "Needs Human Review")).sum())

    prior_counts = prior.value_counts()
    v2_counts = merged["ICP_Classification_v2"].value_counts()

    summary_rows = [
        ("Master accounts (V1 classified)", total),
        ("Accounts in trade-org export", len(trade)),
        ("Master accts not found in trade-org export", missing_in_trade),
        ("", ""),
        ("Accounts with ≥1 trade-org membership (List or Chapter)", members),
        ("  membership rate", f"{members/total*100:.1f}%"),
        ("", ""),
        ("Total flips (V1 non-ICP-Fit → V2 ICP Fit)", flipped_total),
        ("  from Unlikely ICP", flipped_from_unlikely),
        ("  from Needs Human Review", flipped_from_review),
        ("  flip rate (of all members)", f"{flipped_total/members*100:.1f}%" if members else "n/a"),
        ("  flip rate (of master)", f"{flipped_total/total*100:.1f}%"),
        ("", ""),
        ("V1 ICP Fit", int(prior_counts.get("ICP Fit", 0))),
        ("V1 Needs Human Review", int(prior_counts.get("Needs Human Review", 0))),
        ("V1 Unlikely ICP", int(prior_counts.get("Unlikely ICP", 0))),
        ("", ""),
        ("V2 ICP Fit", int(v2_counts.get("ICP Fit", 0))),
        ("V2 Needs Human Review", int(v2_counts.get("Needs Human Review", 0))),
        ("V2 Unlikely ICP", int(v2_counts.get("Unlikely ICP", 0))),
        ("", ""),
        ("V2 ICP Fit growth vs V1", f"+{int(v2_counts.get('ICP Fit', 0)) - int(prior_counts.get('ICP Fit', 0)):,}"),
    ]

    # By AE Territory
    by_terr = merged.groupby("AE_Territory__c", dropna=False).agg(
        total=("ICP_Classification__c", "size"),
        v1_icp_fit=("ICP_Classification__c", lambda s: (s == "ICP Fit").sum()),
        flips=("Flipped", "sum"),
        v2_icp_fit=("ICP_Classification_v2", lambda s: (s == "ICP Fit").sum()),
    ).reset_index()
    by_terr["v1_icp_fit"] = by_terr["v1_icp_fit"].astype(int)
    by_terr["flips"] = by_terr["flips"].astype(int)
    by_terr["v2_icp_fit"] = by_terr["v2_icp_fit"].astype(int)
    by_terr["growth_pct"] = (by_terr["flips"] / by_terr["v1_icp_fit"].replace(0, pd.NA) * 100).round(1)
    by_terr = by_terr.sort_values("flips", ascending=False)

    # ── Per-Trade-Org Flip Breakdown ────────────────────────────────
    # Explode atomic orgs from BOTH list + chapter, then count per org.
    list_explode = merged[["_list_orgs", "ICP_Classification__c", "Flipped"]].explode("_list_orgs")
    list_explode = list_explode[list_explode["_list_orgs"].notna() & (list_explode["_list_orgs"] != "")]
    list_explode["Source Field"] = "Trade Organization List"
    list_explode = list_explode.rename(columns={"_list_orgs": "Trade Org"})

    chap_explode = merged[["_chapter_orgs", "ICP_Classification__c", "Flipped"]].explode("_chapter_orgs")
    chap_explode = chap_explode[chap_explode["_chapter_orgs"].notna() & (chap_explode["_chapter_orgs"] != "")]
    chap_explode["Source Field"] = "Trade Organization Chapter List"
    chap_explode = chap_explode.rename(columns={"_chapter_orgs": "Trade Org"})

    by_org = pd.concat([list_explode, chap_explode], ignore_index=True)
    org_summary = by_org.groupby(["Trade Org", "Source Field"]).agg(
        total_members=("Trade Org", "size"),
        already_icp_fit=("ICP_Classification__c", lambda s: (s == "ICP Fit").sum()),
        flips=("Flipped", "sum"),
        flips_from_unlikely=("ICP_Classification__c", lambda s: 0),  # placeholder; recompute below
    ).reset_index()
    # recompute the prior-source breakdown properly
    flip_unlikely = (
        by_org[by_org["Flipped"] & (by_org["ICP_Classification__c"] == "Unlikely ICP")]
        .groupby(["Trade Org", "Source Field"]).size().reset_index(name="flips_from_unlikely")
    )
    flip_review = (
        by_org[by_org["Flipped"] & (by_org["ICP_Classification__c"] == "Needs Human Review")]
        .groupby(["Trade Org", "Source Field"]).size().reset_index(name="flips_from_review")
    )
    org_summary = org_summary.drop(columns=["flips_from_unlikely"]).merge(
        flip_unlikely, on=["Trade Org", "Source Field"], how="left"
    ).merge(
        flip_review, on=["Trade Org", "Source Field"], how="left"
    )
    org_summary["flips_from_unlikely"] = org_summary["flips_from_unlikely"].fillna(0).astype(int)
    org_summary["flips_from_review"] = org_summary["flips_from_review"].fillna(0).astype(int)
    org_summary["flips"] = org_summary["flips"].astype(int)
    org_summary["already_icp_fit"] = org_summary["already_icp_fit"].astype(int)
    org_summary["flip_rate_%"] = (org_summary["flips"] / org_summary["total_members"] * 100).round(1)
    org_summary = org_summary.sort_values(["Source Field", "flips"], ascending=[True, False])

    # ── Flipped accounts detail ─────────────────────────────────────
    flipped_accts = merged[merged["Flipped"]][[
        JOIN_KEY, "Account Name", "AE_Territory__c", "MM_Pod_Territory__c",
        "Annual Revenue", "Flip From", "ICP_Classification_v2",
        LIST_COL, CHAPTER_COL, "ICP_Classification_Evidence__c",
    ]].sort_values(["AE_Territory__c", "Account Name"])

    # ── Full V2 master ──────────────────────────────────────────────
    drop_cols = [c for c in ("_list_orgs", "_chapter_orgs") if c in merged.columns]
    full_v2 = merged.drop(columns=drop_cols)

    # Definitions
    defs = pd.DataFrame([
        ("Has Any Trade Org", "True if account has ≥1 entry in either Trade Organization List or Trade Organization Chapter List"),
        ("ICP_Classification_v2", "V2 verdict — equals V1 verdict UNLESS account had a trade-org membership AND V1 verdict was Unlikely ICP / Needs Human Review, in which case flipped to ICP Fit"),
        ("Flipped", "True when V2 verdict differs from V1 verdict (always V1 non-ICP → V2 ICP Fit)"),
        ("Flip From", "V1 verdict for accounts that flipped, blank otherwise"),
        ("Trade Org (in breakdown sheet)", "An atomic trade org parsed from semicolon-separated SFDC field"),
        ("Source Field", "Which SFDC text-rollup field the org was parsed from"),
        ("flip_rate_% (in breakdown)", "flips / total_members for that org (% of org's members that the override flipped)"),
    ], columns=["Field", "Definition"])

    # ── Write ────────────────────────────────────────────────────────
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out = ROOT / "outputs" / f"icp_v2_trade_org_override_{ts}.xlsx"
    summary_df = pd.DataFrame(summary_rows, columns=["Metric", "Value"])

    with pd.ExcelWriter(out, engine="openpyxl") as w:
        summary_df.to_excel(w, sheet_name="Summary", index=False)
        by_terr.to_excel(w, sheet_name="By AE Territory", index=False)
        org_summary.to_excel(w, sheet_name="Trade Org Flip Breakdown", index=False)
        flipped_accts.to_excel(w, sheet_name="Flipped Accounts", index=False)
        full_v2.to_excel(w, sheet_name="All Accounts V2", index=False)
        defs.to_excel(w, sheet_name="Definitions", index=False)

    print(f"\nwrote: {out.relative_to(ROOT)}")
    print(f"  flips: {flipped_total:,}  ({flipped_from_unlikely:,} from Unlikely + {flipped_from_review:,} from Needs Review)")
    print(f"  V2 ICP Fit total: {int(v2_counts.get('ICP Fit', 0)):,} (V1 was {int(prior_counts.get('ICP Fit', 0)):,})")


if __name__ == "__main__":
    main()
