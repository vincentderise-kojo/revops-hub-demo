"""Build SFDC bulk-update CSV mapping every classified MM account to a territory.

Different goal from assign_territories.py:
  - assign_territories.py picks the top-N closest ICP Fits per territory for outbound pod planning.
  - This script maps EVERY classified account (ICP Fit + Needs Review + Unlikely) to its single
    closest marquee territory and rolls that up to an AE Territory, producing a Data Loader-ready
    CSV for SFDC bulk update of four custom fields:
      MM_Pod_Territory__c              — Picklist of the 12 marquee territories
      AE_Territory__c                  — Picklist of the AE territory groupings
      ICP_Classification__c            — Picklist: ICP Fit / Needs Human Review / Unlikely ICP
      ICP_Classification_Evidence__c   — Long Text: website evidence quote from the classifier

Also emits a comprehensive master xlsx (one row per account) with all SFDC enrichment fields,
classifier output, territory assignment, and per-account flags (OpCo?, Active <14d?, Has Active Owner?).

Inputs:
  --classified <path>            Classified master xlsx (output of classify.py)
  --enrich-master <path>         Optional fresh SFDC pull for current billing zips, merged by Account ID
  --territory-mapping <path>     Account Name → Marquee Territory (default inputs/territory_mapping.csv)
  --ae-mapping <path>            Marquee Territory → AE Territory (default inputs/ae_territory_mapping.csv)
  --marquees <dir>               Dir of marquee CSVs (default inputs/marquees)
  --max-distance-miles <n>       Cap; accounts beyond this get null territory fields (default 1500)
  --output <path>                Output CSV (default outputs/sfdc_update_<ts>.csv)
  --master-output <path>         Master xlsx (default outputs/master_results_<ts>.xlsx)
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd
import pgeocode

from assign_territories import (
    _normalize_zip,
    compute_flags,
    geocode_zips,
    haversine_miles,
    load_marquees,
    merge_enrichment,
)


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--classified", required=True, help="Classified master xlsx")
    p.add_argument("--enrich-master", default=None, help="Fresh SFDC pull (CSV/xlsx) merged by Account ID")
    p.add_argument("--territory-mapping", default="inputs/territory_mapping.csv")
    p.add_argument("--ae-mapping", default="inputs/ae_territory_mapping.csv")
    p.add_argument("--marquees", default="inputs/marquees")
    p.add_argument("--max-distance-miles", type=float, default=1500,
                   help="Accounts beyond this distance from any marquee get null territory fields (default 1500)")
    p.add_argument("--output", default=None)
    p.add_argument("--master-output", default=None,
                   help="Comprehensive xlsx with one row per account (default outputs/master_results_<ts>.xlsx)")
    args = p.parse_args()

    classified_path = Path(args.classified)
    marquees_dir = Path(args.marquees)
    mapping_path = Path(args.territory_mapping)
    ae_mapping_path = Path(args.ae_mapping)

    for label, path in [("classified", classified_path), ("marquees dir", marquees_dir),
                        ("territory mapping", mapping_path), ("ae mapping", ae_mapping_path)]:
        if not path.exists():
            print(f"ERROR: {label} not found: {path}", file=sys.stderr)
            return 2

    ts = datetime.now().strftime('%Y%m%d_%H%M%S')
    output_path = Path(args.output) if args.output else (
        Path("outputs") / f"sfdc_update_{ts}.csv"
    )
    master_output_path = Path(args.master_output) if args.master_output else (
        Path("outputs") / f"master_results_{ts}.xlsx"
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)
    master_output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"Loading classified master from {classified_path}...")
    df = pd.read_excel(classified_path)
    print(f"  {len(df)} classified rows")

    if args.enrich_master:
        enrich_path = Path(args.enrich_master)
        if not enrich_path.is_file():
            print(f"ERROR: enrich-master file not found: {enrich_path}", file=sys.stderr)
            return 2
        print(f"Merging fresh SFDC fields from {enrich_path} (refreshes billing zip)...")
        before = len(df)
        df = merge_enrichment(df, enrich_path)
        # Refresh billing zip from the enrich file too if present
        for enc in ("utf-8-sig", "cp1252", "latin-1"):
            try:
                fresh = pd.read_csv(enrich_path, encoding=enc, dtype=str) if enrich_path.suffix.lower() == ".csv" else pd.read_excel(enrich_path, dtype=str)
                break
            except UnicodeDecodeError:
                continue
        if "Billing Zip/Postal Code" in fresh.columns and "Account ID (18 Char)" in fresh.columns:
            zip_lookup = fresh.set_index("Account ID (18 Char)")["Billing Zip/Postal Code"]
            df["_fresh_zip"] = df["Account ID (18 Char)"].map(zip_lookup)
            df["Billing Zip/Postal Code"] = df["_fresh_zip"].combine_first(df.get("Billing Zip/Postal Code"))
            df = df.drop(columns=["_fresh_zip"])
        print(f"  {len(df)} rows after merge (was {before})")

    # Identify zip column
    zip_col = next((c for c in df.columns if "zip" in c.lower() or "postal" in c.lower()), None)
    if zip_col is None:
        print(f"ERROR: classified master missing ZIP column. Columns: {list(df.columns)}", file=sys.stderr)
        return 2
    df["_zip"] = df[zip_col].apply(_normalize_zip)

    # Load marquees + territory mapping
    print(f"Loading marquees from {marquees_dir} and territory mapping from {mapping_path}...")
    marquees_df = load_marquees(marquees_dir, mapping_path)
    print(f"  {len(marquees_df)} marquees across {marquees_df['Territory'].nunique()} territories")

    # Load AE mapping
    ae_map = pd.read_csv(ae_mapping_path)
    ae_map["Marquee Territory"] = ae_map["Marquee Territory"].astype(str).str.strip()
    ae_map["AE Territory"] = ae_map["AE Territory"].astype(str).str.strip()
    ae_dict = dict(zip(ae_map["Marquee Territory"], ae_map["AE Territory"]))
    # Replace literal "nan" string with empty for blank rows in CSV
    ae_dict = {k: ("" if v.lower() == "nan" else v) for k, v in ae_dict.items()}
    print(f"  AE mapping: {len(ae_dict)} marquee territories → "
          f"{len({v for v in ae_dict.values() if v})} AE territories")

    # Geocode + distances
    all_zips = list(set(df["_zip"].dropna()) | set(marquees_df["Marquee ZIP"].dropna()))
    print(f"Geocoding {len(all_zips)} unique ZIPs...")
    geo = geocode_zips(all_zips)

    df = df.join(geo, on="_zip")
    pre = len(df)
    df_geo = df.dropna(subset=["latitude", "longitude"]).reset_index(drop=True)
    df_no_geo = df[df["latitude"].isna() | df["longitude"].isna()].copy()
    print(f"  {len(df_geo)} rows geocoded; {pre - len(df_geo)} dropped or unmapped (will get null territory)")

    marquees_df = marquees_df.join(geo, on="Marquee ZIP", rsuffix="_g").dropna(
        subset=["latitude", "longitude"]).reset_index(drop=True)

    dist = haversine_miles(
        df_geo["latitude"].values[:, None],
        df_geo["longitude"].values[:, None],
        marquees_df["latitude"].values[None, :],
        marquees_df["longitude"].values[None, :],
    )

    territories = sorted(marquees_df["Territory"].unique())
    n = len(df_geo)
    territory_dist = pd.DataFrame(np.full((n, len(territories)), np.inf), columns=territories)
    closest_marquee = pd.DataFrame(np.full((n, len(territories)), "", dtype=object), columns=territories)
    for terr in territories:
        mask = marquees_df["Territory"].values == terr
        sub_dist = dist[:, mask]
        sub_names = marquees_df.loc[mask, "Marquee Account Name"].values
        min_idx = sub_dist.argmin(axis=1)
        territory_dist[terr] = sub_dist[np.arange(n), min_idx]
        closest_marquee[terr] = sub_names[min_idx]

    # Closest territory per account; null beyond cap
    df_geo = df_geo.reset_index(drop=True)
    df_geo["_closest_territory"] = territory_dist.idxmin(axis=1)
    df_geo["_closest_distance"] = territory_dist.min(axis=1)
    df_geo["_closest_marquee"] = [
        closest_marquee.at[i, df_geo.at[i, "_closest_territory"]] for i in df_geo.index
    ]
    over_cap = df_geo["_closest_distance"] > args.max_distance_miles
    df_geo.loc[over_cap, "_closest_territory"] = ""
    df_geo.loc[over_cap, "_closest_marquee"] = ""
    df_geo.loc[over_cap, "_closest_distance"] = np.nan

    df_geo["MM_Pod_Territory__c"] = df_geo["_closest_territory"]
    df_geo["AE_Territory__c"] = df_geo["_closest_territory"].map(lambda t: ae_dict.get(t, ""))
    df_geo["ICP_Classification__c"] = df_geo["Updated Category"].fillna("")
    df_geo["ICP_Classification_Evidence__c"] = df_geo.get("Website Evidence", "").fillna("")
    df_geo["Distance to Marquee (mi)"] = df_geo["_closest_distance"]
    df_geo["Closest Marquee"] = df_geo["_closest_marquee"]

    # Bring back the un-geocoded rows with empty territory fields
    df_no_geo["MM_Pod_Territory__c"] = ""
    df_no_geo["AE_Territory__c"] = ""
    df_no_geo["ICP_Classification__c"] = df_no_geo.get("Updated Category", "").fillna("")
    df_no_geo["ICP_Classification_Evidence__c"] = df_no_geo.get("Website Evidence", "").fillna("")
    df_no_geo["Distance to Marquee (mi)"] = np.nan
    df_no_geo["Closest Marquee"] = ""

    out_cols = ["Account ID (18 Char)", "Account Name",
                "MM_Pod_Territory__c", "AE_Territory__c",
                "ICP_Classification__c", "ICP_Classification_Evidence__c"]
    out = pd.concat([
        df_geo[out_cols],
        df_no_geo[out_cols] if len(df_no_geo) else pd.DataFrame(columns=out_cols),
    ], ignore_index=True)

    out.to_csv(output_path, index=False)

    # ── Comprehensive master xlsx ──
    combined = pd.concat([df_geo, df_no_geo], ignore_index=True)
    combined = compute_flags(combined)

    master_cols = [
        "Account ID (18 Char)", "Account Name", "Account Owner", "Type",
        "Annual Revenue", "Account URL", "Website",
        "Billing Street", "Billing Address Line 1", "City", "State", "Billing Zip/Postal Code",
        "Parent Account ID", "Parent Account", "Sales Last Activity Date",
        "Primary NAICS Code", "SDR Owner",
        "ICP_Classification__c", "ICP_Classification_Evidence__c",
        "Verification Method", "Scrape Timestamp",
        "MM_Pod_Territory__c", "AE_Territory__c",
        "Distance to Marquee (mi)", "Closest Marquee",
        "OpCo?", "Active <14d?", "Has Active Owner?",
    ]
    # Tolerate missing columns (e.g., enrich-master not provided)
    available = [c for c in master_cols if c in combined.columns]
    missing = [c for c in master_cols if c not in combined.columns]
    if missing:
        print(f"NOTE: master output missing columns (will be excluded): {missing}")
    master = combined[available].copy()
    master.to_excel(master_output_path, index=False)

    # Summary
    print()
    print("=== Coverage Summary ===")
    print(f"Total accounts: {len(out)}")
    print(f"Mapped to a Marquee Territory: {(out['MM_Pod_Territory__c'] != '').sum()}")
    print(f"Mapped to an AE Territory: {(out['AE_Territory__c'] != '').sum()}")
    print(f"Beyond {args.max_distance_miles}mi or no ZIP: {(out['MM_Pod_Territory__c'] == '').sum()}")
    print()
    print("Per Marquee Territory:")
    by_terr = out[out["MM_Pod_Territory__c"] != ""].groupby(
        ["MM_Pod_Territory__c", "AE_Territory__c", "ICP_Classification__c"]).size().unstack(fill_value=0)
    print(by_terr.to_string())
    print()
    print("Per AE Territory roll-up:")
    by_ae = out[out["AE_Territory__c"] != ""].groupby(
        ["AE_Territory__c", "ICP_Classification__c"]).size().unstack(fill_value=0)
    by_ae["Total"] = by_ae.sum(axis=1)
    print(by_ae.to_string())
    print()
    print(f"Slim CSV: {output_path}")
    print(f"Master xlsx: {master_output_path} ({len(master)} rows × {len(available)} cols)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
