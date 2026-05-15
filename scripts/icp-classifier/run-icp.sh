#!/usr/bin/env bash
# Quality-of-life wrapper: run the ICP classifier end-to-end on a new input xlsx.
#
# Usage:
#   ./run-icp.sh path/to/input.xlsx
#
# Produces timestamped files under runs/:
#   runs/classified_YYYYMMDD_HHMMSS.xlsx       — raw classifier output
#   runs/territory_report_YYYYMMDD_HHMMSS.xlsx — 6-sheet decision artifact
#   runs/run_YYYYMMDD_HHMMSS.log               — full run log
#
# Prereqs (one-time setup):
#   python3 -m venv .venv
#   source .venv/bin/activate
#   pip install -r requirements.txt
#   cp .env.local.example .env.local   # then edit .env.local with your ANTHROPIC_API_KEY

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ $# -lt 1 ]]; then
    echo "Usage: $0 path/to/input.xlsx" >&2
    exit 1
fi

INPUT="$1"
if [[ ! -f "$INPUT" ]]; then
    echo "Error: input file not found: $INPUT" >&2
    exit 1
fi

if [[ ! -f ".venv/bin/activate" ]]; then
    echo "Error: .venv/ not found. Create it with:" >&2
    echo "  python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt" >&2
    exit 1
fi

if [[ ! -f ".env.local" ]]; then
    echo "Error: .env.local not found. Copy it and add your ANTHROPIC_API_KEY:" >&2
    echo "  cp .env.local.example .env.local" >&2
    exit 1
fi

TS="$(date +%Y%m%d_%H%M%S)"
CLASSIFIED="runs/classified_${TS}.xlsx"
REPORT="runs/territory_report_${TS}.xlsx"
LOG="runs/run_${TS}.log"
mkdir -p runs

echo "================================================================"
echo "ICP Classifier — one-shot run"
echo "================================================================"
echo "Input:              $INPUT"
echo "Classified output:  $CLASSIFIED"
echo "Territory report:   $REPORT"
echo "Log:                $LOG"
echo "----------------------------------------------------------------"
echo

# shellcheck disable=SC1091
source .venv/bin/activate

echo "[1/2] Classifying accounts (scrape + Claude call, may take hours for large inputs)..."
python classify.py --input "$INPUT" --output "$CLASSIFIED" 2>&1 | tee "$LOG"

echo
echo "[2/2] Building territory report..."
python build_territory_report.py --input "$CLASSIFIED" --output "$REPORT" 2>&1 | tee -a "$LOG"

echo
echo "================================================================"
echo "Done."
echo "  Classified output: $CLASSIFIED"
echo "  Territory report:  $REPORT"
echo "  Run log:           $LOG"
echo "================================================================"
