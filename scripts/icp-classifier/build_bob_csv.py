"""Build SFDC bulk-update CSV with AE Territory limited to each AE's 250-account BoB.

Different goal from build_sfdc_update.py:
  - build_sfdc_update.py snaps EVERY account to its single closest marquee territory
    (1500mi cap) and rolls up to AE Territory. AE_Territory__c is populated for every
    geocoded account.
  - This script reads the master xlsx (output of build_sfdc_update.py), filters to
    ICP Fit, then per AE territory selects ~250 accounts using a 100mi primary cap
    with even split across marquee territories and a configurable backstop for
    expansion. AE_Territory__c is populated ONLY for accounts in the BoB; everyone
    else keeps MM_Pod_Territory__c but gets blank AE_Territory__c.

Algorithm per AE territory:
  - target = 250 ICP Fit accounts
  - equal_share = target // num_marquee_territories_in_ae
  - Phase 1: each marquee territory contributes min(count_within_primary_radius, equal_share)
  - Bottleneck = a marquee territory whose 100mi count is < equal_share. Frozen at
    its 100mi count for Phase 2a.
  - Single-marquee AE territories: never bottlenecked (always allowed to expand).
  - Phase 2a: expand non-bottleneck marquees outward (closest-first across all
    eligible marquees) up to backstop, until target reached.
  - Phase 2b: fallback — if Phase 2a exhausts and we still have deficit, allow
    bottleneck marquees to expand too (rare; only when whole AE territory is sparse).

Inputs:
  --master <path>            Master xlsx from build_sfdc_update.py with Distance to
                             Marquee + Closest Marquee + ICP_Classification__c
  --territory-mapping <path> Account Name → Marquee Territory (default inputs/territory_mapping.csv)
  --ae-mapping <path>        Marquee Territory → AE Territory (default inputs/ae_territory_mapping.csv)
  --target-per-ae <n>        Default 250
  --primary-radius <mi>      Default 100
  --backstop-radius <mi>     Default 350
  --output <path>            Default outputs/sfdc_update_bob_<ts>.csv
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

import numpy as np
import pandas as pd

from assign_territories import (
    _normalize_zip,
    geocode_zips,
    haversine_miles,
    load_marquees,
)


def allocate_bob_per_ae(df_ae_pool, marquee_territories, terr_map,
                        target=250, primary_radius=100, backstop_radius=350):
    """Pick BoB accounts for one AE territory. Returns (selected_indices, per_terr_counts).

    df_ae_pool: ICP Fit subset where MM_Pod_Territory__c is one of marquee_territories.
    marquee_territories: list of marquee territory labels in this AE.
    terr_map: full territory_mapping.csv DataFrame (Account Name, Territory).
    """
    n_terrs = len(marquee_territories)
    if n_terrs == 0:
        return set(), {}
    equal_share = target // n_terrs

    # Per-marquee-territory sorted candidates (within backstop)
    by_terr = {}
    counts_100mi = {}
    for terr in marquee_territories:
        anchors = terr_map.loc[terr_map["Territory"] == terr, "Account Name"].tolist()
        sub = df_ae_pool[
            (df_ae_pool["Closest Marquee"].isin(anchors))
            & (df_ae_pool["Distance to Marquee (mi)"] <= backstop_radius)
        ].copy()
        sub = sub.sort_values("Distance to Marquee (mi)")
        by_terr[terr] = sub
        counts_100mi[terr] = int((sub["Distance to Marquee (mi)"] <= primary_radius).sum())

    selected = set()

    # Phase 1: each marquee territory contributes min(count_within_100mi, equal_share)
    for terr, sub in by_terr.items():
        within_100 = sub[sub["Distance to Marquee (mi)"] <= primary_radius]
        take_n = min(equal_share, len(within_100))
        selected.update(within_100.index[:take_n])

    # Bottleneck flags
    is_bottleneck = {terr: counts_100mi[terr] < equal_share for terr in marquee_territories}
    if n_terrs == 1:
        # Single-marquee AE always allowed to expand
        for terr in is_bottleneck:
            is_bottleneck[terr] = False

    # Phase 2a: expand non-bottleneck marquees (closest-first across eligible)
    deficit = target - len(selected)
    while deficit > 0:
        candidates = []
        for terr, sub in by_terr.items():
            if is_bottleneck[terr]:
                continue
            available = sub[~sub.index.isin(selected)]
            if not available.empty:
                first = available.iloc[0]
                candidates.append((float(first["Distance to Marquee (mi)"]), terr, first.name))
        if not candidates:
            break
        candidates.sort()
        _, _terr_chosen, idx_chosen = candidates[0]
        selected.add(idx_chosen)
        deficit -= 1

    # Phase 2b: fallback — allow bottleneck marquees to expand if still short
    while deficit > 0:
        candidates = []
        for terr, sub in by_terr.items():
            available = sub[~sub.index.isin(selected)]
            if not available.empty:
                first = available.iloc[0]
                candidates.append((float(first["Distance to Marquee (mi)"]), terr, first.name))
        if not candidates:
            break
        candidates.sort()
        _, _terr_chosen, idx_chosen = candidates[0]
        selected.add(idx_chosen)
        deficit -= 1

    # Per-territory selected counts
    per_terr_counts = {}
    for terr, sub in by_terr.items():
        per_terr_counts[terr] = int(sub.index.isin(selected).sum())

    return selected, per_terr_counts


def lateral_fill_short_aes(df_full, marquees_df, ae_short_deficit,
                            ae_to_marquees, bob_indices, backstop_radius):
    """Pass 2: short AEs claim from unclaimed ICP Fit surplus, ranked by distance to
    THEIR OWN anchors (not closest-anywhere). Claimed accounts have MM_Pod_Territory__c
    overridden to the closest of the claiming AE's marquee territories.

    Returns dict: {row_idx: (new_mm_pod_territory, new_ae_territory, distance_to_ae_anchor,
                             closest_ae_anchor_name, source_mm_pod_territory)}
    """
    overrides = {}
    if not ae_short_deficit:
        return overrides

    # Unclaimed ICP Fit pool with valid lat/lon
    unclaimed = df_full[
        (df_full["ICP_Classification__c"] == "ICP Fit")
        & (~df_full.index.isin(bob_indices))
        & (df_full["latitude"].notna())
        & (df_full["longitude"].notna())
    ].copy()

    if unclaimed.empty:
        return overrides

    # Process short AEs in deficit-descending order so the largest gap claims first
    for ae_terr in sorted(ae_short_deficit, key=lambda k: -ae_short_deficit[k]):
        deficit = ae_short_deficit[ae_terr]
        marquee_terrs = ae_to_marquees.get(ae_terr, [])
        ae_anchors = marquees_df[marquees_df["Territory"].isin(marquee_terrs)].reset_index(drop=True)
        if ae_anchors.empty:
            continue

        candidates = unclaimed[~unclaimed.index.isin(overrides.keys())].copy()
        if candidates.empty:
            break

        cand_lats = candidates["latitude"].values
        cand_lons = candidates["longitude"].values
        anchor_lats = ae_anchors["latitude"].values
        anchor_lons = ae_anchors["longitude"].values

        dist_matrix = haversine_miles(
            cand_lats[:, None], cand_lons[:, None],
            anchor_lats[None, :], anchor_lons[None, :],
        )
        min_idx = dist_matrix.argmin(axis=1)
        candidates = candidates.assign(
            _dist_to_ae=dist_matrix[np.arange(len(candidates)), min_idx],
            _closest_ae_anchor=ae_anchors["Marquee Account Name"].values[min_idx],
            _closest_ae_terr=ae_anchors["Territory"].values[min_idx],
        )

        eligible = candidates[candidates["_dist_to_ae"] <= backstop_radius].sort_values("_dist_to_ae")
        take = eligible.head(deficit)

        for idx, row in take.iterrows():
            overrides[idx] = (
                row["_closest_ae_terr"],
                ae_terr,
                float(row["_dist_to_ae"]),
                row["_closest_ae_anchor"],
                row.get("MM_Pod_Territory__c", ""),
            )

    return overrides


def main():
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--master", required=True, help="Master xlsx (build_sfdc_update.py output)")
    p.add_argument("--territory-mapping", default="inputs/territory_mapping.csv")
    p.add_argument("--ae-mapping", default="inputs/ae_territory_mapping.csv")
    p.add_argument("--marquees", default="inputs/marquees",
                   help="Dir of marquee CSVs (needed for lateral fill geocoding)")
    p.add_argument("--target-per-ae", type=int, default=250)
    p.add_argument("--primary-radius", type=float, default=100)
    p.add_argument("--backstop-radius", type=float, default=350)
    p.add_argument("--lateral-backstop-radius", type=float, default=None,
                   help="Distance cap for Pass 2 lateral fill. Defaults to --backstop-radius.")
    p.add_argument("--no-lateral-fill", action="store_true",
                   help="Disable Pass 2 lateral fill (pre-2026-04-30 behavior)")
    p.add_argument("--output", default=None)
    args = p.parse_args()
    lateral_backstop = args.lateral_backstop_radius if args.lateral_backstop_radius else args.backstop_radius

    master_path = Path(args.master)
    if not master_path.exists():
        print(f"ERROR: master not found: {master_path}", file=sys.stderr)
        return 2

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    output_path = Path(args.output) if args.output else (
        Path("outputs") / f"sfdc_update_bob_{ts}.csv"
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"Loading master from {master_path}...")
    df = pd.read_excel(master_path)
    print(f"  {len(df)} accounts loaded")

    required_cols = ["Account ID (18 Char)", "Account Name", "MM_Pod_Territory__c",
                     "AE_Territory__c", "ICP_Classification__c",
                     "ICP_Classification_Evidence__c", "Closest Marquee",
                     "Distance to Marquee (mi)", "Billing Zip/Postal Code"]
    missing = [c for c in required_cols if c not in df.columns]
    if missing:
        print(f"ERROR: master xlsx missing required columns: {missing}", file=sys.stderr)
        return 2

    # Geocode for lateral fill (Pass 2). Only ICP Fit rows need lat/lon, but cheap to do all.
    df["_zip"] = df["Billing Zip/Postal Code"].apply(_normalize_zip)
    marquees_dir = Path(args.marquees)
    marquees_df = load_marquees(marquees_dir, Path(args.territory_mapping))
    print(f"  Loaded {len(marquees_df)} marquees across {marquees_df['Territory'].nunique()} territories")
    all_zips = list(set(df["_zip"].dropna()) | set(marquees_df["Marquee ZIP"].dropna()))
    geo = geocode_zips(all_zips)
    df = df.join(geo, on="_zip")
    marquees_df = marquees_df.join(geo, on="Marquee ZIP", rsuffix="_g").dropna(
        subset=["latitude", "longitude"]).reset_index(drop=True)

    # Load mappings
    terr_map = pd.read_csv(args.territory_mapping)
    terr_map["Account Name"] = terr_map["Account Name"].astype(str).str.strip()
    terr_map["Territory"] = terr_map["Territory"].astype(str).str.strip()

    ae_map = pd.read_csv(args.ae_mapping)
    ae_map["Marquee Territory"] = ae_map["Marquee Territory"].astype(str).str.strip()
    ae_map["AE Territory"] = ae_map["AE Territory"].astype(str).str.strip()
    ae_map["AE Territory"] = ae_map["AE Territory"].replace("nan", "")

    # AE → list of marquee territories
    ae_to_marquees = {}
    for _, row in ae_map.iterrows():
        if row["AE Territory"]:
            ae_to_marquees.setdefault(row["AE Territory"], []).append(row["Marquee Territory"])

    # ICP Fit pool
    icp_fit = df[df["ICP_Classification__c"] == "ICP Fit"].copy()
    print(f"  {len(icp_fit)} ICP Fit accounts in master")
    print()

    # Allocate per AE territory
    bob_indices = set()
    summary_rows = []

    for ae_terr in sorted(ae_to_marquees.keys()):
        marquee_terrs = ae_to_marquees[ae_terr]
        ae_pool = icp_fit[icp_fit["MM_Pod_Territory__c"].isin(marquee_terrs)]

        selected, per_terr = allocate_bob_per_ae(
            ae_pool, marquee_terrs, terr_map,
            target=args.target_per_ae,
            primary_radius=args.primary_radius,
            backstop_radius=args.backstop_radius,
        )
        bob_indices.update(selected)

        sel_df = ae_pool.loc[list(selected)] if selected else ae_pool.iloc[0:0]
        max_dist = float(sel_df["Distance to Marquee (mi)"].max()) if not sel_df.empty else 0.0

        # Per-marquee distance bands
        per_terr_bands = {}
        for terr in marquee_terrs:
            anchors = terr_map.loc[terr_map["Territory"] == terr, "Account Name"].tolist()
            terr_sel = sel_df[sel_df["Closest Marquee"].isin(anchors)]
            if terr_sel.empty:
                per_terr_bands[terr] = (0, 0, 0)
                continue
            within_100 = int((terr_sel["Distance to Marquee (mi)"] <= args.primary_radius).sum())
            within_backstop = len(terr_sel)
            max_d = float(terr_sel["Distance to Marquee (mi)"].max())
            per_terr_bands[terr] = (within_100, within_backstop, max_d)

        # Total ICP Fit available in this AE pool (for context)
        avail_within_backstop = int((ae_pool["Distance to Marquee (mi)"] <= args.backstop_radius).sum())

        summary_rows.append({
            "ae": ae_terr,
            "marquees": marquee_terrs,
            "selected": len(selected),
            "available_within_backstop": avail_within_backstop,
            "max_distance": max_dist,
            "per_terr_bands": per_terr_bands,
        })

    # ── Pass 2: lateral fill for short AEs ──
    ae_short_deficit = {
        r["ae"]: args.target_per_ae - r["selected"]
        for r in summary_rows if r["selected"] < args.target_per_ae
    }
    overrides = {}
    if ae_short_deficit and not args.no_lateral_fill:
        print(f"Pass 2 — lateral fill for {len(ae_short_deficit)} short AE territories "
              f"(deficit total: {sum(ae_short_deficit.values())}, backstop: {lateral_backstop:.0f}mi)...")
        overrides = lateral_fill_short_aes(
            df, marquees_df, ae_short_deficit, ae_to_marquees, bob_indices, lateral_backstop,
        )
        # Roll claimed indices into bob_indices and update summary
        bob_indices.update(overrides.keys())
        # Re-tally selected counts per AE for printing
        claims_by_ae = {}
        for idx, (_pod, ae_t, dist, anchor, src_pod) in overrides.items():
            claims_by_ae.setdefault(ae_t, []).append((dist, src_pod, anchor))
        for r in summary_rows:
            ae_claims = claims_by_ae.get(r["ae"], [])
            r["lateral_added"] = len(ae_claims)
            r["lateral_max_dist"] = max((d for d, _, _ in ae_claims), default=0.0)
            r["lateral_sources"] = {}
            for d, src_pod, anchor in ae_claims:
                r["lateral_sources"][src_pod] = r["lateral_sources"].get(src_pod, 0) + 1
            r["selected"] += len(ae_claims)

    # Build output
    out = df.copy()
    bob_mask = out.index.isin(bob_indices)
    out.loc[~bob_mask, "AE_Territory__c"] = ""

    # Apply Pass 2 overrides (re-snap MM_Pod_Territory__c + set AE_Territory__c)
    for idx, (new_mm_pod, new_ae, _dist, _anchor, _src) in overrides.items():
        out.at[idx, "MM_Pod_Territory__c"] = new_mm_pod
        out.at[idx, "AE_Territory__c"] = new_ae

    out_cols = ["Account ID (18 Char)", "Account Name",
                "MM_Pod_Territory__c", "AE_Territory__c",
                "ICP_Classification__c", "ICP_Classification_Evidence__c"]
    out[out_cols].to_csv(output_path, index=False)

    # Summary
    print("=" * 80)
    print(f"  BoB Coverage Summary  |  target={args.target_per_ae}  "
          f"primary={args.primary_radius}mi  backstop={args.backstop_radius}mi")
    print("=" * 80)
    print()
    for row in summary_rows:
        status = "✅ FULL" if row["selected"] >= args.target_per_ae else f"⚠️  SHORT by {args.target_per_ae - row['selected']}"
        print(f"{row['ae']}  {status}")
        print(f"  Marquees: {', '.join(row['marquees'])}")
        print(f"  Selected: {row['selected']} / {args.target_per_ae}  "
              f"(pool within {int(args.backstop_radius)}mi: {row['available_within_backstop']})  "
              f"max dist: {row['max_distance']:.0f}mi")
        for terr, (w100, wbs, maxd) in row["per_terr_bands"].items():
            print(f"    {terr:30s}  {w100:4d} ≤{int(args.primary_radius)}mi   "
                  f"{wbs:4d} total   max {maxd:.0f}mi")
        if row.get("lateral_added", 0) > 0:
            print(f"  + Pass 2 lateral fill: {row['lateral_added']} accounts  "
                  f"(max dist to AE anchor: {row['lateral_max_dist']:.0f}mi)")
            for src_pod, count in sorted(row["lateral_sources"].items(), key=lambda kv: -kv[1]):
                print(f"    from {src_pod}: {count}")
        print()

    total_in_bob = sum(r["selected"] for r in summary_rows)
    full_count = sum(1 for r in summary_rows if r["selected"] >= args.target_per_ae)
    print(f"Total in BoB across all AE territories: {total_in_bob}")
    print(f"AE territories filled to target: {full_count} / {len(summary_rows)}")
    print(f"Slim CSV (Data Loader-ready): {output_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
