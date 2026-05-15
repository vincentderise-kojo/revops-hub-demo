# ICP Classifier + Territory Assigner

Two-stage Python pipeline:
1. **`classify.py`** — scrapes account websites and classifies each as ICP Fit / Needs Human Review / Unlikely ICP using Claude (Haiku 4.5).
2. **`assign_territories.py`** — given a classified master file, an SFDC marquee CSV, and a `territory_mapping.csv` (Account Name → Territory), picks the top-N nearest classifier-confirmed ICP Fits per territory using ZIP geocoding (pgeocode). Backfills shortfall territories from positions 101+ within the cap. Runs at three caps (200/300/500mi) for side-by-side comparison; uses one as the primary cap for the working account list. Optionally merges fresh SFDC fields (`Parent Account ID`, `Sales Last Activity Date`, refreshed `Account Owner`) onto the classified output.

The classifier's `cache.json` is keyed on normalized URL — re-classifying overlapping account lists is essentially free. The 26K classified output is the durable artifact; territory assignment is a 10-second numpy operation that can be re-run cheaply when a territory is added/changed.

See `docs/superpowers/specs/2026-04-21-icp-classifier-design.md` for the original design.

## Setup

```bash
cd pipeline-pulse-app/scripts/icp-classifier
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.local.example .env.local
# Edit .env.local to add ANTHROPIC_API_KEY
```

## Standard end-to-end workflow (post-2026-04-28)

For a fresh territory-planning run from a raw SFDC MM-prospects pull + a marquee file:

```bash
# 1. Drop the raw SFDC master xlsx/csv in inputs/ (e.g., inputs/all_mm_accounts.xlsx)
# 2. Drop the marquee CSV in inputs/marquees/ (Account Name + Billing Zip required; Territory column NOT required)
# 3. Maintain inputs/territory_mapping.csv (Account Name → Territory) — single source of truth for which marquees belong to which territory

source .venv/bin/activate

# Classify the full master (~$15-20, ~2-3 hrs at MAX_WORKERS=16 on Tier 4 Anthropic)
./run-icp.sh inputs/all_mm_accounts.xlsx

# Assign accounts to territories with cap comparison and SFDC enrichment (10-30 sec)
python assign_territories.py \
  --master runs/classified_<TIMESTAMP>.xlsx \
  --enrich-master inputs/All_MM_Accounts_<DATE>.csv \
  --territory-mapping inputs/territory_mapping.csv
```

Outputs:
- `runs/classified_<ts>.xlsx` — raw classifier output (durable, reusable)
- `outputs/assigned_<ts>.xlsx` — 4 sheets:
  - **Summary** — Key Findings (auto-generated) + cap comparison (Count and Max Distance at 200/300/500mi) + flag counts at the primary cap
  - **Definitions** — explanation of every Summary column
  - **Assigned Accounts** — per-account list at the primary cap, with Territory, Secondary Territory, Distance, Closest Marquee, full SFDC enrichment, and 3 flag columns (`OpCo?`, `Active <14d?`, `Has Active Owner?`)
  - **Territory Marquees** — Territory → Marquee Account Name reference

The primary cap defaults to 300mi. Pass `--max-distance-miles <value>` to switch which cap drives the Assigned Accounts sheet (Summary still shows all three for comparison).

To add a new territory: append rows to `inputs/territory_mapping.csv` with the new Territory label and any marquee Account Names that anchor it. Marquees referenced in the mapping must also exist in a CSV under `inputs/marquees/` (so the script has their ZIPs). Re-run only `assign_territories.py` — no re-classification needed.

## Run — legacy wrapper

If the input is already classified or you only want classification (no territory assignment):

```bash
./run-icp.sh path/to/input.xlsx
```

Produces classified + territory_report + log under `runs/`. Wrapper activates the venv and validates `.env.local`.

## Run — manual (when you want individual control)

```bash
source .venv/bin/activate

# Dry run (parse xlsx, report counts, no scraping or classification)
python classify.py --input accounts.xlsx --dry-run

# Full classification only
python classify.py --input accounts.xlsx --output classified.xlsx

# Ignore cache (re-scrape all URLs)
python classify.py --input accounts.xlsx --output classified.xlsx --fresh

# Validation (bundled 45-account fixture — uses real API)
python classify.py --validate

# Build territory report from a classified xlsx
python build_territory_report.py --input classified.xlsx --output territory_report.xlsx
```

## Expected input xlsx schema

The classifier reads these columns (tolerant of minor variants like `NAICS Code ` with trailing space):

| Column | Required? | Notes |
|---|---|---|
| `Account Name` | yes | |
| `Account ID (18 Char)` | yes | Used to join results back |
| `Website` | recommended | No website → row routed to Needs Human Review |
| `NAICS Code` | recommended | Sent to classifier as supporting signal |
| `Annual Revenue` | recommended | Accepts `$50,000,000`, bare int, or float |
| `State`, `ZIP`, `Address`, `Account Type`, `Account Owner`, `SDR Owner` | optional | Preserved in output; `Account Owner` used for Owner Gap flagging in report |
| `Territory` | optional | If present, enables per-territory breakdown in the report. For a single-territory run this can be omitted. |

## Output columns (appended to input)

| Column | Description |
|---|---|
| Updated Category | `ICP Fit` / `Needs Human Review` / `Unlikely ICP` |
| Website Evidence | One-line rationale from the classifier |
| Verification Method | `Website scrape` / `Website inaccessible` / `Classifier parse error` |
| Scrape Timestamp | ISO 8601 datetime of the scrape |
