"""
ICP Classifier V2 — Side-by-side comparison of two override models.

STATUS (2026-05-04): ACTIVE — this is the production tier-shift comparison script.
Re-run when:
  (1) Micah confirms MEP-aligned trade-org inclusion list changes (edit the
      MEP_ALIGNED_ORGS set near the top of this file, then re-run).
  (2) Trade-org SFDC export is refreshed (drop new CSV in inputs/ and update
      the TRADE_ORG_PATH constant).
  (3) Master classification (V1 web-scrape verdict) is re-run.

Output xlsx is the file Vincent shares with stakeholders for review.

Produces one xlsx comparing:
  - V1               : current website-scrape verdict (Apr 30 master)
  - V2 Binary        : original Micah-spec rule (any trade-org member → ICP Fit)
  - V2 Tier-Shift    : sales-pushback rule (MEP-aligned orgs only; Needs Review → ICP Fit;
                       Unlikely → Needs Review queue; non-MEP and ambiguous orgs ignored)

Outputs:
  outputs/icp_v2_comparison_<TS>.xlsx with sheets:
    Summary, By AE Territory, Trade Org Breakdown,
    Tier-Shift Promotions, Tier-Shift Escalations,
    All Accounts, Definitions
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

# MEP-aligned trade orgs — get tier-shift treatment.
# Derived from the 43 atomic orgs surfaced in the 2026-05-04 export, filtered against
# Kojo's ICP spec (MEP construction trades only; explicitly excludes roofing, concrete,
# wall/ceiling, drywall, finance, peer groups).
MEP_ALIGNED_ORGS = {
    "ABC - Associated Builders & Contractors",
    "NECA - National Electrical Contractors Association",
    "IEC - Independent Electrical Contractors",
    "IEC - Chesapeake",
    "MCAA - Mechanical Contractors Association of America",
    "SMACNA - Sheet Metal & Air Conditioning Contractors' National Association",
    "Engineering News - Record (ENR)",
    "MCAC - Mechanical Contractors Association of Canada",
    "NEMCA - New England MCA",
    "WECA",
    "ECAO - Electrical Contractors Association of Ontario",
    "CECA - Canadian Electrical Contractors Association",
    "CECA - Carolinas Electrical Contractors Association",
    "Electri Int'l",
    "FEC - Federated Electrical Contractors",
    "North American Electrical Partnership",
    "Subcontractor Trade Association",
    "Subcontractors Trade Association",
}

# Non-MEP / ambiguous orgs — surfaced for the comparison file's annotation column.
NON_MEP_ORGS = {
    "NRCA - National Roofing Contractors Association",
    "AWCI - Association of the Wall & Ceiling Industry",
    "ACPA - American Concrete Pumping Association",
    "CFA - Concrete Foundation Association",
    "SWCCA - Signatory Wall & Ceiling Contractors Association",
    "Cisca - Ceiling & Interior Systems Construction Association",
    "Disca - Drywall & Interior Systems Contractors Association",
    "NPCA - National Precast Concrete Association",
    "CFMA - Construction Financial Management Association",
    "Construction Financial Management Association",
}


def normalize_orgs(s: str) -> list[str]:
    if not isinstance(s, str) or not s.strip():
        return []
    return [v.strip() for v in s.split(";") if v.strip()]


def classify_org(name: str) -> str:
    if name in MEP_ALIGNED_ORGS:
        return "MEP-aligned"
    if name in NON_MEP_ORGS:
        return "Non-MEP (excluded)"
    return "Ambiguous (excluded)"


def main() -> None:
    if not MASTER_PATH.exists():
        sys.exit(f"missing master: {MASTER_PATH}")
    if not TRADE_ORG_PATH.exists():
        sys.exit(f"missing trade-org export: {TRADE_ORG_PATH}")

    master = pd.read_excel(MASTER_PATH)
    trade = pd.read_csv(TRADE_ORG_PATH, encoding="utf-8-sig", low_memory=False)
    print(f"master: {len(master):,}   trade-org: {len(trade):,}")

    trade_slim = trade[[JOIN_KEY, LIST_COL, CHAPTER_COL]].drop_duplicates(subset=[JOIN_KEY])
    merged = master.merge(trade_slim, on=JOIN_KEY, how="left")
    merged[LIST_COL] = merged[LIST_COL].fillna("")
    merged[CHAPTER_COL] = merged[CHAPTER_COL].fillna("")

    # Atomic-org sets per row (combine List + Chapter)
    merged["_orgs"] = merged.apply(
        lambda r: list(set(normalize_orgs(r[LIST_COL]) + normalize_orgs(r[CHAPTER_COL]))),
        axis=1,
    )
    merged["Has Any Trade Org"] = merged["_orgs"].apply(bool)
    merged["Has MEP-Aligned Org"] = merged["_orgs"].apply(
        lambda orgs: any(o in MEP_ALIGNED_ORGS for o in orgs)
    )

    prior = merged["ICP_Classification__c"].fillna("")

    # ── Binary override (any trade org → ICP Fit if flippable) ─────
    binary_flip = merged["Has Any Trade Org"] & prior.isin(FLIPPABLE)
    merged["V2_Binary"] = prior.where(~binary_flip, "ICP Fit")

    # ── Tier-Shift (MEP-aligned only; one tier up; Unlikely → Needs Review) ─
    is_mep = merged["Has MEP-Aligned Org"]
    promote_to_fit = is_mep & (prior == "Needs Human Review")
    escalate_to_review = is_mep & (prior == "Unlikely ICP")
    v2_tier = prior.copy()
    v2_tier = v2_tier.where(~promote_to_fit, "ICP Fit")
    v2_tier = v2_tier.where(~escalate_to_review, "Needs Human Review")
    merged["V2_TierShift"] = v2_tier
    merged["TierShift_Action"] = ""
    merged.loc[promote_to_fit, "TierShift_Action"] = "Promoted (Needs Review → ICP Fit)"
    merged.loc[escalate_to_review, "TierShift_Action"] = "Escalated (Unlikely → Needs Review)"

    # ── Summary ─────────────────────────────────────────────────────
    n = len(merged)
    v1c = prior.value_counts()
    bc = merged["V2_Binary"].value_counts()
    tc = merged["V2_TierShift"].value_counts()

    summary_rows = [
        ("Master accounts", n),
        ("With ≥1 trade-org membership", int(merged["Has Any Trade Org"].sum())),
        ("With ≥1 MEP-aligned trade-org membership", int(is_mep.sum())),
        ("", ""),
        ("V1 — ICP Fit", int(v1c.get("ICP Fit", 0))),
        ("V1 — Needs Human Review", int(v1c.get("Needs Human Review", 0))),
        ("V1 — Unlikely ICP", int(v1c.get("Unlikely ICP", 0))),
        ("", ""),
        ("V2 BINARY — ICP Fit", int(bc.get("ICP Fit", 0))),
        ("V2 BINARY — Needs Human Review", int(bc.get("Needs Human Review", 0))),
        ("V2 BINARY — Unlikely ICP", int(bc.get("Unlikely ICP", 0))),
        ("V2 BINARY — total flips (V1 non-Fit → V2 ICP Fit)", int(binary_flip.sum())),
        ("", ""),
        ("V2 TIER-SHIFT — ICP Fit", int(tc.get("ICP Fit", 0))),
        ("V2 TIER-SHIFT — Needs Human Review", int(tc.get("Needs Human Review", 0))),
        ("V2 TIER-SHIFT — Unlikely ICP", int(tc.get("Unlikely ICP", 0))),
        ("V2 TIER-SHIFT — promotions (Needs Review → ICP Fit)", int(promote_to_fit.sum())),
        ("V2 TIER-SHIFT — escalations (Unlikely → Needs Review)", int(escalate_to_review.sum())),
        ("", ""),
        (
            "Δ ICP Fit pool — V1 → Binary",
            f"+{int(bc.get('ICP Fit', 0)) - int(v1c.get('ICP Fit', 0)):,} ({int(bc.get('ICP Fit', 0))/max(int(v1c.get('ICP Fit', 0)),1):.1f}x)",
        ),
        (
            "Δ ICP Fit pool — V1 → Tier-Shift",
            f"+{int(tc.get('ICP Fit', 0)) - int(v1c.get('ICP Fit', 0)):,} ({int(tc.get('ICP Fit', 0))/max(int(v1c.get('ICP Fit', 0)),1):.1f}x)",
        ),
        (
            "Δ Binary vs Tier-Shift on ICP Fit",
            int(bc.get("ICP Fit", 0)) - int(tc.get("ICP Fit", 0)),
        ),
    ]
    summary_df = pd.DataFrame(summary_rows, columns=["Metric", "Value"])

    # ── By AE Territory ─────────────────────────────────────────────
    by_terr = merged.groupby("AE_Territory__c", dropna=False).apply(
        lambda g: pd.Series({
            "total": len(g),
            "V1_ICP_Fit": int((g["ICP_Classification__c"] == "ICP Fit").sum()),
            "V2_Binary_ICP_Fit": int((g["V2_Binary"] == "ICP Fit").sum()),
            "V2_TierShift_ICP_Fit": int((g["V2_TierShift"] == "ICP Fit").sum()),
            "V2_TierShift_Needs_Review": int((g["V2_TierShift"] == "Needs Human Review").sum()),
            "Binary_flips": int(((g["ICP_Classification__c"].isin(FLIPPABLE)) & g["Has Any Trade Org"]).sum()),
            "TierShift_promotions": int(((g["ICP_Classification__c"] == "Needs Human Review") & g["Has MEP-Aligned Org"]).sum()),
            "TierShift_escalations": int(((g["ICP_Classification__c"] == "Unlikely ICP") & g["Has MEP-Aligned Org"]).sum()),
        }),
        include_groups=False,
    ).reset_index()
    by_terr = by_terr.sort_values("V1_ICP_Fit", ascending=False)

    # ── Trade Org Breakdown ─────────────────────────────────────────
    explode = merged[["_orgs", "ICP_Classification__c"]].explode("_orgs")
    explode = explode[explode["_orgs"].notna() & (explode["_orgs"] != "")]
    explode = explode.rename(columns={"_orgs": "Trade Org"})
    org_summary = explode.groupby("Trade Org").agg(
        total_members=("Trade Org", "size"),
        already_v1_ICP_Fit=("ICP_Classification__c", lambda s: int((s == "ICP Fit").sum())),
        v1_Needs_Review=("ICP_Classification__c", lambda s: int((s == "Needs Human Review").sum())),
        v1_Unlikely=("ICP_Classification__c", lambda s: int((s == "Unlikely ICP").sum())),
    ).reset_index()
    org_summary["Classification"] = org_summary["Trade Org"].map(classify_org)
    org_summary["Binary_flips"] = org_summary["v1_Needs_Review"] + org_summary["v1_Unlikely"]
    org_summary["TierShift_promotions"] = org_summary.apply(
        lambda r: r["v1_Needs_Review"] if r["Classification"] == "MEP-aligned" else 0, axis=1
    )
    org_summary["TierShift_escalations"] = org_summary.apply(
        lambda r: r["v1_Unlikely"] if r["Classification"] == "MEP-aligned" else 0, axis=1
    )
    org_summary = org_summary.sort_values(["Classification", "total_members"], ascending=[True, False])
    org_summary = org_summary[[
        "Trade Org", "Classification", "total_members",
        "already_v1_ICP_Fit", "v1_Needs_Review", "v1_Unlikely",
        "Binary_flips", "TierShift_promotions", "TierShift_escalations",
    ]]

    # ── Tier-Shift detail sheets ────────────────────────────────────
    detail_cols = [
        JOIN_KEY, "Account Name", "AE_Territory__c", "MM_Pod_Territory__c",
        "Annual Revenue", "ICP_Classification__c", "V2_TierShift",
        LIST_COL, CHAPTER_COL, "ICP_Classification_Evidence__c",
    ]
    promotions = merged[promote_to_fit][detail_cols].sort_values(["AE_Territory__c", "Account Name"])
    escalations = merged[escalate_to_review][detail_cols].sort_values(["AE_Territory__c", "Account Name"])

    # ── Full master with all three verdicts ────────────────────────
    keep = [c for c in merged.columns if not c.startswith("_")]
    full = merged[keep]

    # ── Definitions ─────────────────────────────────────────────────
    defs = pd.DataFrame([
        ("V1 verdict", "Original website-scrape classification (Apr 30 master)."),
        ("V2 Binary", "Micah-spec rule: any trade-org membership AND prior verdict in {Unlikely, Needs Review} → flip to ICP Fit. Includes non-MEP orgs (NRCA roofing, ACPA concrete, etc.) — produces ~1,500 false positives."),
        ("V2 Tier-Shift", "Sales-pushback rule: only MEP-aligned trade-org memberships count. Needs Review + MEP org → ICP Fit (promote). Unlikely + MEP org → Needs Human Review (escalate, not auto-flip). Non-MEP and ambiguous orgs ignored."),
        ("MEP-aligned org", "Trade orgs Kojo's ICP spec considers MEP construction (ABC, NECA, IEC, MCAA, SMACNA, ENR, MCAC, NEMCA, WECA, ECAO, CECA, Electri Int'l, FEC, NAEP, IEC-Chesapeake, Subcontractor Trade Association)."),
        ("Non-MEP org", "Trade orgs Kojo's ICP spec excludes (NRCA roofing, ACPA/CFA/NPCA concrete, AWCI/SWCCA/Cisca/Disca wall+ceiling+drywall, CFMA finance)."),
        ("Ambiguous org", "Peer groups and unclassified entries — excluded from tier-shift logic to avoid false positives."),
        ("TierShift_Action", "Per-account label of what tier-shift did: Promoted / Escalated / blank (no change)."),
    ], columns=["Term", "Definition"])

    # ── Write ────────────────────────────────────────────────────────
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out = ROOT / "outputs" / f"icp_v2_comparison_{ts}.xlsx"
    with pd.ExcelWriter(out, engine="openpyxl") as w:
        summary_df.to_excel(w, sheet_name="Summary", index=False)
        by_terr.to_excel(w, sheet_name="By AE Territory", index=False)
        org_summary.to_excel(w, sheet_name="Trade Org Breakdown", index=False)
        promotions.to_excel(w, sheet_name="Tier-Shift Promotions", index=False)
        escalations.to_excel(w, sheet_name="Tier-Shift Escalations", index=False)
        full.to_excel(w, sheet_name="All Accounts", index=False)
        defs.to_excel(w, sheet_name="Definitions", index=False)

    print(f"\nwrote: {out.relative_to(ROOT)}")
    bin_fits = int(bc.get("ICP Fit", 0))
    tier_fits = int(tc.get("ICP Fit", 0))
    v1_fits = int(v1c.get("ICP Fit", 0))
    print(f"  V1 ICP Fit:        {v1_fits:,}")
    print(f"  V2 Binary Fit:     {bin_fits:,}  (+{bin_fits-v1_fits:,} flips, but ~1,500 false positives)")
    print(f"  V2 Tier-Shift Fit: {tier_fits:,}  (+{tier_fits-v1_fits:,} promotions; {int(escalate_to_review.sum()):,} new Needs Review escalations)")


if __name__ == "__main__":
    main()
