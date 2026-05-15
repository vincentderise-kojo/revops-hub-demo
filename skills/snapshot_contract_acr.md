Title:
Snapshot Contract ACR

Description:
Refreshes data/customer-contract-acr.json by pulling each customer's latest signed contract from Salesforce. For every customer account, the snapshot captures both the structured Quote.Annual_Construction_Revenue__c field AND the value parsed from the signed PDF, then flags mismatches. Default is incremental (only re-parses accounts whose latest closed-won CloseDate changed). Use when a renewal cycle closes, when CSMs flag stale data, or to bootstrap the first snapshot.

Example Prompt:
/snapshot-contract-acr — refresh the Contract ACR snapshot incrementally.

Content:
---
name: snapshot_contract_acr
description: Refresh data/customer-contract-acr.json by pulling signed contract data from SFDC. Captures both the Quote.Annual_Construction_Revenue__c field and the value parsed from the signed PDF, flags mismatches between the two. Use when renewals close or CSMs flag stale Contract ACR values on the Upsell Signals tab.
---

# Snapshot Contract ACR

This skill refreshes the Contract ACR snapshot that feeds the Size signal on the Upsell Signals tab of `/account-intelligence`. For every customer account it captures TWO sources of Annual Construction Revenue and flags when they disagree:

- **Quote field** — `Quote.Annual_Construction_Revenue__c`, the structured SFDC value
- **PDF parse** — the value parsed from the signed Order Form (regex first, Claude fallback for older templates)

Mismatches between the two (>5% delta) are surfaced as an audit signal. They typically indicate either (a) the Quote field was edited after signing, or (b) the PDF was generated from an earlier Quote revision.

## When to use

- A wave of renewals just closed — stated ACR values have likely shifted
- A CSM flagged a stale Contract ACR value on a row
- Bootstrapping the first snapshot (use `--full`)
- Spot-checking a single account before a customer conversation (use `--account <Id>`)

## How it works

1. Reads `pipeline-pulse-app/data/customer-gmv-snapshot.json` to get the customer-account universe
2. Reads the existing `pipeline-pulse-app/data/customer-contract-acr.json` (if present) as a cache
3. For each account: SOQL latest closed-won opp with a synced Quote → in parallel: read Quote field + download PDF + parse with regex-first, Claude-fallback
4. Compute mismatch (>5% delta between field and PDF)
5. In `--incremental` mode (default), skips accounts whose latest CloseDate matches the cache — saves time + cost
6. Writes the refreshed JSON, prints a diff summary

## Steps

1. **From the repo root**, navigate to the app:
   ```bash
   cd pipeline-pulse-app
   ```

2. **Confirm `.env.local` has SFDC + Anthropic credentials**:
   ```bash
   grep -c "SFDC_CONSUMER_KEY\|SFDC_USERNAME\|SFDC_JWT_PRIVATE_KEY\|ANTHROPIC_API_KEY" .env.local
   ```
   Expected: `4` — all four present.

3. **Run the snapshot**. Pick the right flag:
   - **Default (incremental, recommended for routine refreshes):**
     ```bash
     npx tsx scripts/snapshot-contract-acr.ts
     ```
   - **Full re-parse (bootstrap, or after parser changes):**
     ```bash
     npx tsx scripts/snapshot-contract-acr.ts --full
     ```
   - **Single account (spot-check, no write):**
     ```bash
     npx tsx scripts/snapshot-contract-acr.ts --account <SFDC_ACCOUNT_ID>
     ```

4. **Review the diff summary** at the end of the run. Watch for:
   - Many `acr_not_found` errors → parser may need tuning (Claude fallback failing?)
   - Many `sfdc_fetch_failed` → check VPN / SFDC connectivity
   - Unexpected `changed` rows (large ACR swings) → spot-check a few
   - **PDF↔field mismatches** → audit signal: investigate any account with >5% delta between the structured Quote field and the parsed PDF value. Usually means SFDC field was edited post-signing.

5. **Eyeball the JSON** before committing:
   ```bash
   git diff data/customer-contract-acr.json | head -80
   ```

6. **Commit + push** if it looks right:
   ```bash
   git add data/customer-contract-acr.json
   git commit -m "data(contract-acr): refresh snapshot — <N> changed, <M> mismatches"
   git push origin main
   ```

## Troubleshooting

- **"Cannot find module 'p-limit'"** — run `npm install` first
- **Claude API errors** — verify `ANTHROPIC_API_KEY` in `.env.local`
- **SFDC 401** — JWT token expired; the script will retry; if it keeps failing, check the External Client App in SFDC is still active
- **Single-account spot-check shows wrong value** — open the source PDF via the URL the script prints, verify Annual Construction Revenue line manually
- **Quote field is null but PDF parsed cleanly** — the structured field was never populated for older Quotes; this is expected. PDF value becomes the primary `statedAcr`.

## What this skill does NOT do

- Does not commit automatically — Vincent reviews before commit
- Does not write to SFDC custom fields (read-only)
- Does not include cron or scheduled refresh — manual only
