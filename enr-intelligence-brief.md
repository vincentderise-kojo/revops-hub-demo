# Account Intelligence — Reference Brief

## Purpose

Account Intelligence cross-references two external datasets against Salesforce CRM data to surface account-level insights for RevOps and Sales leadership. It automates a previously manual exercise of building a Top Customers list ranked by Annual Revenue and matching it against the ENR Top 600 Specialty Contractors list.

**Route:** `/account-intelligence`
**Audience:** Vincent (RevOps), Jared/Sean/Jeremy (Sales leadership), anyone doing account planning or territory work.

## What It Answers

1. **ENR Top 600 tab:** "Of the 600 largest specialty contractors in the US, which ones are our customers, which are prospects, and where is our SFDC data wrong?"
2. **Top Customers tab:** "Who are our biggest customers by Annual Revenue, rolled up to the parent company level?"
3. **Methodology tab:** Documents data sources, matching logic, status assignment, hierarchy resolution, and revenue delta thresholds.

## Data Sources

| Source | Location | Size | Refresh |
|--------|----------|------|---------|
| ENR Top 600 | Static JSON (`data/enr-top-600-2025.json`) | 600 firms | Annual (~October) |
| Customer Accounts | Google Sheet (GID `1925406595`) | ~985 rows | Coefficient daily sync |
| Hierarchy / Prospects | Google Sheet (GID `1703881391`) | ~840 rows | Coefficient daily sync |
| Pipeline Opps | Google Sheet (GID `1815244803`, shared with Pipeline Pulse) | Varies | Coefficient hourly sync |
| Manual Overrides | `data/enr-sfdc-overrides.json` | 5 mappings | Manual as needed |

All sheets live in spreadsheet `139f4amjRpd-CuQwXfjCJ1oYJ4vbda68GdsSF7C3q6KU`.

## ENR Matching Logic (Priority Order)

Each ENR firm is matched to SFDC accounts using a 4-tier priority system with a contains fallback:

1. **Tag (highest confidence):** Account has `ENR Top 600 | 2025` in its Trade Organization Chapter List. Human-verified.
2. **Manual Override:** Config file maps known name mismatches (e.g., "POWER DESIGN" -> "Power Design - St. Petersburg").
3. **Name+State:** Normalized firm name matches normalized SFDC account name AND billing state matches. Normalization strips punctuation and common suffixes (Inc., LLC, Corp., etc.).
4. **Name-only (lowest confidence):** Name matches but state doesn't match or is missing. Flagged for manual review.
5. **Contains fallback:** Substring matching in either direction if no exact normalized match found. Minimum 3-character names to avoid false positives.

## Kojo Status Assignment

| Status | Condition |
|--------|-----------|
| Customer | Matched account Type = "Customer - Active" |
| Former | Matched account Type contains "churn", "cancel", or "former" |
| Active Opp | Matched account exists but isn't customer/former, OR unmatched firm has an open pipeline opp (Discovery, Evaluation, Contracts/Negotiation, Final Approvals) |
| Not in SFDC | No match found. Sub-classified as ICP or Non-ICP based on firm type. |

**ICP Classification:** Firms with "Not in SFDC" status are ICP if any component of their firm type is NOT in the non-ICP list (U, O, A, X). Combo types like E/U are ICP if any component qualifies.

## Parent Hierarchy Resolution

Two methods, with Ultimate Parent Co taking priority:

1. **Ultimate Parent Co field** (from hierarchy tab, manually maintained): Groups all accounts sharing the same Ultimate Parent Co name into a family. Highest priority.
2. **Parent Account ID chain walking:** Traces Parent Account ID references to find the ultimate parent (stops when no further parent exists in the dataset). Used for accounts without an Ultimate Parent Co value.

## Revenue Ranking

| Revenue Source | Condition |
|----------------|-----------|
| Ultimate Parent | Resolved via Ultimate Parent Co field, parent record found with revenue > 0 |
| Parent Acct | Ultimate parent exists in dataset via ID chain and has Annual Revenue > 0 |
| Own Acct | Standalone account (no parent, single-account family) |
| Proxy | Parent not in dataset or has $0 revenue — uses max child Annual Revenue as proxy. Flagged with warning. |

## Revenue Delta Thresholds

| Color | Delta Range | Meaning |
|-------|-------------|---------|
| Green | < 15% | SFDC revenue is accurate relative to ENR |
| Yellow | 15-30% | Worth reviewing |
| Red | > 30% | Significantly wrong — action needed |

## UI Structure

### Hero Stats (8 per tab)

**ENR tab:** Kojo Customers (of 600), Active Opps, Not in SFDC, ENR Customer ARR, Revenue Accuracy %, ENR Tagged / Matched, Market Penetration %, Former Customers.

**Top Customers tab:** Total Customer ARR, Customer Families, Top 10 Concentration %, ENR-Listed, Avg Family ARR, Multi-Account Families, Proxy Revenue count, States Covered.

### ENR Top 600 Tab

Full table of all 600 ENR firms with columns: Rank, ENR Firm, Type, ENR Rev ($M), Kojo Status (badge), Match Confidence (badge), SFDC Account, SFDC Rev, Rev Delta (color-coded), SFDC ARR, State, Trade Designation, ENR Tag (checkmark/X), Family.

**Filters:** Kojo Status (multi-select with ICP/Non-ICP sub-options), Firm Type (multi-select), Account Owner (single-select), Revenue Accuracy (single-select), Search (free text). Active filters show as removable pills with "Clear all."

**CSV Export:** Passcode-protected download of filtered rows. Includes an "Action Needed" column with triggers: Update SFDC Revenue (delta > 30%), Add ENR Tag (matched but missing tag), Prospect - ICP Match (not in SFDC, ICP firm type), Review Match (fuzzy Name or Name+State confidence).

### Top Customers Tab

Families ranked by revenue, expandable to show child accounts. Top N toggle (10 / 25 / 50 / 100 / All).

**Parent row columns:** Rank, Customer/Parent Entity, Annual Revenue, Rev Source (with Proxy warning), Family ARR, # Accts, Cust/Prospect split, Trade Designations, States, ENR Rank, Trade Orgs.

**Child rows (on expand):** Account Name with type badge (Customer/Churned/Prospect/Parent), Annual Revenue, ARR, Trade Designation, State, Account Owner. Shows first 4 children by default with "+ N more" link.

**Filters:** Industry (multi-select), State (single-select), Trade Organization (single-select), ENR Status, Account Type, Account Owner, Search.

### Methodology Tab

Static documentation covering: data sources table, ENR matching logic (4-tier), Kojo status assignment rules, ICP classification, parent hierarchy resolution, revenue ranking sources, revenue delta thresholds, and CSV export action triggers.

## File Structure

```
app/account-intelligence/page.tsx     -- Server component: fetches data, processes, renders dashboard
components/
  account-intelligence-dashboard.tsx  -- Client shell: tabs, hero stats
  enr-view.tsx                        -- ENR tab: table, filters, sort, export
  top-customers-view.tsx              -- Top Customers tab: families, expand, filters
  account-methodology.tsx             -- Methodology tab: static docs
lib/
  process-account-intelligence.ts     -- All processing: parsing, hierarchy, matching, stats
  types-account-intelligence.ts       -- All types for the feature
  config.ts                           -- AI_CONFIG section: GIDs, thresholds, overrides, state map
data/
  enr-top-600-2025.json              -- Static ENR firm data (600 rows)
  enr-sfdc-overrides.json            -- Manual name mappings (5 entries)
```

## What's Not Built

- No direct Salesforce API integration — uses Coefficient for the data pipeline
- No write-back to Salesforce — read-only intelligence
- No EC&M Top 50 tab (was considered, not implemented)
- No automated alerting — manual review tool
- No parent expand "intelligence summary" (revenue confidence, child > parent flags) — expansion shows child rows only
