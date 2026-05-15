# Upsell Signals Tab — Account Intelligence Dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 4th "Upsell Signals" tab to the existing Account Intelligence app at `/account-intelligence`. This tab surfaces systematic renewal pricing opportunities across three vectors: (1) company size / ACV correction, (2) discount normalization, and (3) payment terms optimization. It reuses existing family aggregation, ENR matching, and data pipeline infrastructure — no new pages or routes.

**Context:** This directly supports the Systematic Upsell Framework from the April 9 CS Exec Sync. Micah wants pricing opportunity identification to be data-driven and systematic rather than CSM-dependent. The three vectors map to the pricing formula: `Pricing = ACV × Basis Points × (1 - Discount)`. Product value / basis points (the third vector in the formula) is intentionally left to CS and excluded from this tab for now.

**Architecture:** The existing server component already fetches ENR data, customer accounts, hierarchy/prospects, and pipeline opportunities in parallel. This tab layers on top of that by:
1. Extending the pipeline opportunity fetch to include closed-won deals with discount and contract metadata
2. Computing per-family upsell signals by cross-referencing ENR revenue deltas, discount history, and contract vintage
3. Rendering a new client component as a 4th tab with sortable/filterable columns and a combined "signal strength" indicator

**Tech Stack:** Same as existing — Next.js 15 App Router, TypeScript, PapaParse, inline styles with CSS variables (not Tailwind classes). No new dependencies.

**Data quality caveat:** The underlying SFDC data has known accuracy issues (Annual Revenue, parent hierarchy, ENR matching). This tab will surface those gaps as part of the value — rows with missing or suspect data get flagged rather than hidden, because fixing that data IS part of the upsell workflow.

---

## Pre-Build: Understand Existing Code

Before writing any code, read these files to understand the current architecture:

```
Read: lib/types-account-intelligence.ts          — all existing types
Read: lib/process-account-intelligence.ts        — processing logic, family building, ENR matching
Read: lib/config.ts                              — SHEET_GIDS, AI_CONFIG, OPEN_STAGES
Read: lib/types.ts                               — RawOpportunity type (pipeline opps)
Read: app/account-intelligence/page.tsx           — server component, data fetching
Read: components/account-intelligence-dashboard.tsx — client shell, tab switching, hero stats
Read: components/top-customers-view.tsx           — reference for table patterns, filters, sorting
Read: components/enr-view.tsx                     — reference for CSV export pattern
```

---

## Data Source Requirements

### What we already have (from existing data pipeline):
- `EnrMatch[]` — ENR firms matched to SFDC accounts with `revenueDeltaPct`
- `AccountFamily[]` — parent-resolved families with `rankingRevenue`, `totalFamilyArr`, `revenueSource`
- `RawOpportunity[]` — pipeline opportunities from the pipeline sheet (GID `1815244803`). This sheet contains ALL opps including closed-won — not just open pipeline. It's already fetched by the Account Intelligence server component.

### Available fields on the pipeline sheet (GID `1815244803`):

The sheet has 42 columns. `RawOpportunity` in `lib/types.ts` currently maps only 21 of them. The following columns exist on the sheet and are relevant to upsell signals but are NOT yet on the `RawOpportunity` interface:

| Sheet Column | Use Case | Sample Values |
|---|---|---|
| `Discount Amount` | Dollar discount on the deal | |
| `Discount Percentage` | Percentage discount — key field for Vector 2 | |
| `Recurring Discount Percentage` | Discount on recurring portion — may differ from overall | |
| `Opportunity BPS` | Basis points — could inform pricing analysis | |
| `Type` | Distinguishes new business vs renewal | |
| `Opportunity Record Type` | Another new vs renewal indicator | |
| `Opportunity ID (18 Char)` | Unique key for deduplication | |
| `Probability (%)` | Stage confidence | |
| `Contract Term (Month)` | Contract length in months | 12 (309), 36 (111), 24 (18), 60 (2) |
| `Payment Terms` | Collection/payment timing | Due Upon Receipt (391), Net 30 (39), Net 60 (7), Net 45 (2) |
| `Invoice Frequency` | **Billing cadence — key field for Vector 3** | Annually (335), Quarterly (60), Semi-Annually (20), Upfront (15), Monthly (12), Custom (1) |

**Required step:** Add these fields to the `RawOpportunity` interface in `lib/types.ts`. This is safe — PapaParse already parses all columns from the CSV; the interface just controls TypeScript access. Existing views reference only the fields they use and will not be affected.

### Vector 3 signal logic (Invoice Frequency):
- **No signal:** "Annually" or "Upfront" — already optimal
- **Strong signal:** "Monthly" or "Quarterly" — clear optimization opportunity
- **Moderate signal:** "Semi-Annually" or "Custom" — worth reviewing
- 93 opps across the sheet are not on Annual/Upfront billing today

### What is NOT on the sheet (future enhancements):
- **GMV / Usage Proxy** — Micah mentioned GMV should approximate 30% of ACR. This data is not on any existing sheet. Future enhancement once we identify where GMV lives.

---

## File Structure

```
Modify: lib/types.ts                               — add new fields to RawOpportunity (Discount Percentage, etc.)
Modify: lib/types-account-intelligence.ts          — add UpsellSignal, UpsellHeroStats types
Modify: lib/process-account-intelligence.ts        — add upsell signal computation
Modify: lib/config.ts                              — add upsell threshold constants
Modify: app/account-intelligence/page.tsx           — pass upsell data to client
Modify: components/account-intelligence-dashboard.tsx — add 4th tab, upsell hero stats
Create: components/upsell-signals-view.tsx          — the new tab component
Modify: data/changelog.json                        — add changelog entry
```

---

### Task 1: Type Definitions

**Files:**
- Modify: `lib/types-account-intelligence.ts`

- [ ] **Step 1: Add upsell-specific types**

Add to the end of `lib/types-account-intelligence.ts`:

```typescript
// ── Upsell Signal types ──

export type SignalStrength = "strong" | "moderate" | "weak" | "no-data";

export interface DiscountHistory {
  opportunityName: string;
  closeDate: string;
  amount: number;
  discountPct: number | null;           // from "Discount Percentage" column
  recurringDiscountPct: number | null;  // from "Recurring Discount Percentage" column
  invoiceFrequency: string | null;      // from "Invoice Frequency" column — Annually, Quarterly, Monthly, etc.
  contractTermMonths: number | null;    // from "Contract Term (Month)" column
  isFirstYear: boolean; // true if this was the original deal (earliest close date for this account)
}

export interface UpsellSignal {
  family: AccountFamily;
  // Vector 1: Company Size / ACV Correction
  enrRevenue: number | null;          // ENR revenue in dollars (from matched ENR firm)
  sfdcRevenue: number;                // SFDC Annual Revenue (from family rankingRevenue)
  revenueDeltaPct: number | null;     // same as EnrMatch.revenueDeltaPct — positive = SFDC over, negative = SFDC under
  sizeSignal: SignalStrength;         // strong if delta > 30%, moderate if > 15%, weak if matched but accurate, no-data if unmatched
  // Vector 2: Discount Normalization
  currentDiscountPct: number | null;  // most recent deal's discount
  originalDiscountPct: number | null; // first deal's discount (may differ if renewed at different rate)
  discountHistory: DiscountHistory[];
  contractVintageYears: number | null; // years since first close date
  discountSignal: SignalStrength;     // strong if discount > 30% and vintage > 1yr, moderate if > 20%, etc.
  // Vector 3: Invoice Frequency (billing cadence optimization)
  currentInvoiceFrequency: string | null;  // from "Invoice Frequency" column
  isSubAnnual: boolean;               // true if not Annually or Upfront = optimization opportunity
  termsSignal: SignalStrength;
  // Combined
  overallSignal: SignalStrength;      // strongest of the three individual signals
  signalCount: number;                // how many of the 3 vectors have moderate+ signal
  // Display helpers
  enrRank: number | null;
  totalFamilyArr: number;
  accountOwners: string[];
  customerCount: number;
}

export interface UpsellHeroStats {
  totalCustomersAnalyzed: number;
  strongSignalCount: number;
  moderateSignalCount: number;
  arrWithStrongSignal: number;
  avgDiscountPct: number | null;      // across all customers with discount data
  subAnnualCount: number;              // customers not on annual/upfront billing
  sizeCorrections: number;            // customers where ENR delta > 30%
  dataGapCount: number;               // customers missing key data (discount, revenue, etc.)
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/types-account-intelligence.ts
git commit -m "feat(upsell-signals): add type definitions for upsell signal computation"
```

---

### Task 2: Extend Data Pipeline

**Files:**
- Modify: `lib/process-account-intelligence.ts`
- Modify: `lib/config.ts` (if new GIDs needed)

- [ ] **Step 1: Extend RawOpportunity with new fields**

Add the following fields to the `RawOpportunity` interface in `lib/types.ts`. These columns already exist on the pipeline sheet (GID `1815244803`) — we just need TypeScript access:

```typescript
"Discount Amount": string;
"Discount Percentage": string;
"Recurring Discount Percentage": string;
"Opportunity BPS": string;
"Type": string;
"Opportunity Record Type": string;
"Opportunity ID (18 Char)": string;
"Probability (%)": string;
```

This is safe — PapaParse already parses all CSV columns. Existing views don't reference these fields and won't be affected.

- [ ] **Step 2: Add upsell signal computation function**

Add to `lib/process-account-intelligence.ts`:

```typescript
// ── Upsell Signal Computation ──

export function computeUpsellSignals(
  families: AccountFamily[],
  enrMatches: EnrMatch[],
  allOpps: RawOpportunity[] // NOTE: this should include closed-won, not just open pipeline
): UpsellSignal[] {
  // Build ENR lookup by account ID
  const enrByAccountId = new Map<string, EnrMatch>();
  for (const match of enrMatches) {
    if (match.matchedAccount) {
      enrByAccountId.set(match.matchedAccount.accountId, match);
    }
  }

  // Build opportunity lookup by normalized account name
  // Group all closed-won opps by account, sorted by close date ascending
  const oppsByAccount = new Map<string, DiscountHistory[]>();
  for (const opp of allOpps) {
    // Filter to closed-won only
    if (opp.Stage !== "Closed Won") continue;
    const accountName = opp["Account Name"];
    if (!accountName) continue;

    const normName = accountName.toLowerCase().trim();
    if (!oppsByAccount.has(normName)) oppsByAccount.set(normName, []);

    const discountRaw = opp["Discount Percentage"]?.replace(/[%,]/g, "").trim();
    const recurringDiscountRaw = opp["Recurring Discount Percentage"]?.replace(/[%,]/g, "").trim();

    oppsByAccount.get(normName)!.push({
      opportunityName: opp["Opportunity Name"] || "",
      closeDate: opp["Close Date"] || "",
      amount: parseFloat((opp["Amount"] || "0").replace(/[$,]/g, "")) || 0,
      discountPct: discountRaw ? parseFloat(discountRaw) / 100 : null,
      recurringDiscountPct: recurringDiscountRaw ? parseFloat(recurringDiscountRaw) / 100 : null,
      invoiceFrequency: opp["Invoice Frequency"]?.trim() || null,
      contractTermMonths: opp["Contract Term (Month)"]
        ? parseInt(opp["Contract Term (Month)"], 10)
        : null,
      isFirstYear: false, // computed below
    });
  }

  // Sort each account's opps by close date and mark the first one
  for (const [, opps] of oppsByAccount) {
    opps.sort((a, b) => a.closeDate.localeCompare(b.closeDate));
    if (opps.length > 0) opps[0].isFirstYear = true;
  }

  // Compute signals per family (only customer families — at least one active customer member)
  return families
    .filter((f) => f.customerCount > 0)
    .map((family) => {
      // Find ENR match for any member of the family
      let enrMatch: EnrMatch | null = null;
      for (const member of family.members) {
        const match = enrByAccountId.get(member.accountId);
        if (match) { enrMatch = match; break; }
      }

      // Find discount history for any member of the family
      const allDiscountHistory: DiscountHistory[] = [];
      for (const member of family.members) {
        const normName = member.accountName.toLowerCase().trim();
        const opps = oppsByAccount.get(normName) || [];
        allDiscountHistory.push(...opps);
      }
      allDiscountHistory.sort((a, b) => a.closeDate.localeCompare(b.closeDate));
      if (allDiscountHistory.length > 0) allDiscountHistory[0].isFirstYear = true;

      // ── Vector 1: Size / ACV Correction ──
      const enrRevenue = enrMatch ? enrMatch.enrFirm.revenue2024Mil * 1_000_000 : null;
      const sfdcRevenue = family.rankingRevenue;
      const revenueDeltaPct = enrMatch?.revenueDeltaPct ?? null;

      let sizeSignal: SignalStrength = "no-data";
      if (revenueDeltaPct !== null) {
        const abs = Math.abs(revenueDeltaPct);
        if (abs > 0.3) sizeSignal = "strong";
        else if (abs > 0.15) sizeSignal = "moderate";
        else sizeSignal = "weak";
      }

      // ── Vector 2: Discount Normalization ──
      const firstDeal = allDiscountHistory.find((d) => d.isFirstYear);
      const latestDeal = allDiscountHistory.length > 0
        ? allDiscountHistory[allDiscountHistory.length - 1]
        : null;

      const originalDiscountPct = firstDeal?.discountPct ?? null;
      const currentDiscountPct = latestDeal?.discountPct ?? null;

      let contractVintageYears: number | null = null;
      if (firstDeal?.closeDate) {
        const firstClose = new Date(firstDeal.closeDate);
        const now = new Date();
        contractVintageYears = Math.round(
          (now.getTime() - firstClose.getTime()) / (365.25 * 24 * 60 * 60 * 1000) * 10
        ) / 10;
      }

      let discountSignal: SignalStrength = "no-data";
      if (currentDiscountPct !== null) {
        if (currentDiscountPct > 0.3 && (contractVintageYears ?? 0) > 1) {
          discountSignal = "strong";
        } else if (currentDiscountPct > 0.2) {
          discountSignal = "moderate";
        } else {
          discountSignal = "weak";
        }
      }

      // ── Vector 3: Invoice Frequency ──
      const currentInvoiceFrequency = latestDeal?.invoiceFrequency ?? null;
      const optimalFrequencies = ["annually", "upfront"];
      const isSubAnnual = currentInvoiceFrequency
        ? !optimalFrequencies.includes(currentInvoiceFrequency.toLowerCase())
        : false;

      let termsSignal: SignalStrength = "no-data";
      if (currentInvoiceFrequency !== null) {
        const freq = currentInvoiceFrequency.toLowerCase();
        if (freq === "monthly" || freq === "quarterly") {
          termsSignal = "strong";
        } else if (freq === "semi-annually" || freq === "custom") {
          termsSignal = "moderate";
        } else {
          termsSignal = "weak"; // Annually or Upfront — already optimal
        }
      }

      // ── Combined Signal ──
      const signals = [sizeSignal, discountSignal, termsSignal];
      const signalCount = signals.filter(
        (s) => s === "strong" || s === "moderate"
      ).length;
      let overallSignal: SignalStrength = "no-data";
      if (signals.includes("strong")) overallSignal = "strong";
      else if (signals.includes("moderate")) overallSignal = "moderate";
      else if (signals.some((s) => s !== "no-data")) overallSignal = "weak";

      return {
        family,
        enrRevenue,
        sfdcRevenue,
        revenueDeltaPct,
        sizeSignal,
        currentDiscountPct,
        originalDiscountPct,
        discountHistory: allDiscountHistory,
        contractVintageYears,
        discountSignal,
        currentInvoiceFrequency,
        isSubAnnual,
        termsSignal,
        overallSignal,
        signalCount,
        enrRank: family.enrRank,
        totalFamilyArr: family.totalFamilyArr,
        accountOwners: family.accountOwners,
        customerCount: family.customerCount,
      };
    })
    .sort((a, b) => {
      // Sort by signal count desc, then by ARR desc
      if (b.signalCount !== a.signalCount) return b.signalCount - a.signalCount;
      return b.totalFamilyArr - a.totalFamilyArr;
    });
}

export function computeUpsellHeroStats(signals: UpsellSignal[]): UpsellHeroStats {
  const withDiscount = signals.filter((s) => s.currentDiscountPct !== null);
  const avgDiscount = withDiscount.length > 0
    ? withDiscount.reduce((sum, s) => sum + s.currentDiscountPct!, 0) / withDiscount.length
    : null;

  return {
    totalCustomersAnalyzed: signals.length,
    strongSignalCount: signals.filter((s) => s.overallSignal === "strong").length,
    moderateSignalCount: signals.filter((s) => s.overallSignal === "moderate").length,
    arrWithStrongSignal: signals
      .filter((s) => s.overallSignal === "strong")
      .reduce((sum, s) => sum + s.totalFamilyArr, 0),
    avgDiscountPct: avgDiscount,
    subAnnualCount: signals.filter((s) => s.isSubAnnual).length,
    sizeCorrections: signals.filter((s) => s.sizeSignal === "strong").length,
    dataGapCount: signals.filter((s) => s.overallSignal === "no-data").length,
  };
}
```

**NOTE:** Field names above match the actual Google Sheet column headers on the pipeline tab (GID `1815244803`). All three vectors have real data available. `Invoice Frequency` is the key field for Vector 3 (billing optimization) — flag anything not "Annually" or "Upfront" as an opportunity. `Payment Terms` (Due Upon Receipt, Net 30, etc.) is about collection timing, not billing cadence — it's on the sheet but not used for signal computation.

- [ ] **Step 3: Update AccountIntelligenceData type**

In `lib/types-account-intelligence.ts`, add to the `AccountIntelligenceData` interface:

```typescript
  upsellSignals: UpsellSignal[];
```

- [ ] **Step 4: Wire into main processor**

In `lib/process-account-intelligence.ts`, update `processAccountIntelligence()` to call `computeUpsellSignals()` and include the result in the returned `AccountIntelligenceData`.

Note: The existing `pipelineOpps` parameter already receives opportunity data — but it may only contain open pipeline. Check if closed-won deals are included in the same sheet. If not, you may need to add a separate fetch for closed-won opps using a new sheet GID.

- [ ] **Step 5: Commit**

```bash
git add lib/types-account-intelligence.ts lib/process-account-intelligence.ts lib/config.ts
git commit -m "feat(upsell-signals): add upsell signal computation with 3-vector analysis"
```

---

### Task 3: Server Component Updates

**Files:**
- Modify: `app/account-intelligence/page.tsx`

- [ ] **Step 1: Pass upsell signals to client**

The server component already computes `data` via `processAccountIntelligence()`. Since we added `upsellSignals` to the return type in Task 2, this should flow through automatically. Verify the data is passed to `<AccountIntelligenceDashboard data={data} />`.

If closed-won opportunities need a separate fetch (i.e., they're on a different sheet tab), add that fetch to the existing `Promise.all()` block.

- [ ] **Step 2: Commit**

```bash
git add app/account-intelligence/page.tsx
git commit -m "feat(upsell-signals): pass upsell data through server component"
```

---

### Task 4: Dashboard Shell — Add 4th Tab

**Files:**
- Modify: `components/account-intelligence-dashboard.tsx`

- [ ] **Step 1: Add "Upsell Signals" tab**

In the `Tab` type, add `"upsell"`. Add the tab button to the header alongside ENR, Top Customers, and Methodology.

Import `UpsellSignalsView` from `./upsell-signals-view` and `computeUpsellHeroStats` from the processing file.

Add hero stats for the upsell tab — show:
- Total Customers Analyzed
- Strong Signals (count + ARR)
- Moderate Signals (count)
- Avg Discount %
- Sub-Annual Billing (count — customers not on annual/upfront invoicing)
- Data Gaps (count — customers missing discount or revenue data)

Render `<UpsellSignalsView data={data} />` when `tab === "upsell"`.

- [ ] **Step 2: Commit**

```bash
git add components/account-intelligence-dashboard.tsx
git commit -m "feat(upsell-signals): add upsell tab to dashboard shell with hero stats"
```

---

### Task 5: Upsell Signals View Component

**Files:**
- Create: `components/upsell-signals-view.tsx`

This is the main deliverable. Build a table view showing one row per customer family with columns organized by the three pricing vectors.

- [ ] **Step 1: Build the full component**

Create `components/upsell-signals-view.tsx` with:

**Filters:**
- Signal Strength: All / Strong / Moderate / Weak / No Data
- Vector filter: All / Size Correction / Discount / Payment Terms (filter to families that have signal on that specific vector)
- Account Owner dropdown
- Search (family name)
- Sort by: Signal Count (desc), ARR (desc), Discount % (desc), Revenue Delta (desc)

**Table Columns:**
| Column | Source | Notes |
|--------|--------|-------|
| Overall Signal | Combined badge | Color-coded: strong=red, moderate=yellow, weak=green, no-data=gray |
| # Signals | signalCount | "2/3" format |
| Customer / Parent | family.ultimateParentName | |
| Family ARR | totalFamilyArr | formatted with fmtK |
| ENR Rank | enrRank | "—" if not on list |
| **Size Vector** | | |
| SFDC Revenue | sfdcRevenue | formatted |
| ENR Revenue | enrRevenue | formatted, "—" if unmatched |
| Rev Delta | revenueDeltaPct | color-coded like ENR tab, with ⚠ for >30% |
| Size Signal | sizeSignal | badge |
| **Discount Vector** | | |
| Current Discount | currentDiscountPct | percentage, "No data" if null |
| Original Discount | originalDiscountPct | percentage |
| Vintage | contractVintageYears | "X.X yrs" |
| Discount Signal | discountSignal | badge |
| **Billing Vector** | | |
| Invoice Frequency | currentInvoiceFrequency | text (Annually, Quarterly, Monthly, etc.), "No data" if null |
| Billing Signal | termsSignal | badge — strong if Monthly/Quarterly, moderate if Semi-Annually/Custom, weak if Annually/Upfront |
| Owner(s) | accountOwners | joined |

**Signal badges** should use this color scheme (consistent with existing dashboard patterns):
- `strong` → red/coral background (action needed)
- `moderate` → amber/yellow background (opportunity)
- `weak` → green background (currently OK)
- `no-data` → gray background (data gap — also an action item, just different)

**Row behavior:**
- Rows with "no-data" overall signal should be dimmed (like unmatched ENR rows) but NOT hidden by default — data gaps are actionable
- Consider a toggle "Hide no-data rows" for when users want to focus on actionable signals only

**CSV Export:**
- Follow the same passcode-protected export pattern from `enr-view.tsx`
- Include all columns plus an "Action Needed" column that says things like:
  - "Update SFDC Revenue (delta >30%)"
  - "Review discount — 40% in year 3"
  - "Convert to annual billing (currently [Monthly/Quarterly/etc.])"
  - "Missing discount data"
  - "Missing revenue data — update SFDC"

- [ ] **Step 2: Style to match existing tabs**

Use the same `thStyle`, `tdStyle`, `filterSelectStyle` patterns from `enr-view.tsx` and `top-customers-view.tsx`. The tab should feel like a natural extension of the existing dashboard, not a different app.

- [ ] **Step 3: Verify the tab renders**

Visit `http://localhost:3000/account-intelligence`, click the Upsell Signals tab. Verify:
- Hero stats display correctly
- Table renders with all columns
- Filters work
- Sorting works
- Signal badges are color-coded correctly
- "No data" states display gracefully (not errors or blank rows)
- CSV export works

- [ ] **Step 4: Commit**

```bash
git add components/upsell-signals-view.tsx
git commit -m "feat(upsell-signals): build Upsell Signals view with 3-vector analysis table"
```

---

### Task 6: Changelog and Final Verification

**Files:**
- Modify: `data/changelog.json`

- [ ] **Step 1: Add changelog entry**

Add to the beginning of the `data/changelog.json` array:

```json
{
  "date": "2026-04-14",
  "app": "Account Intelligence",
  "status": "shipped",
  "title": "Upsell Signals tab — systematic renewal pricing analysis",
  "description": "New 4th tab on Account Intelligence: surfaces upsell opportunities across three vectors (company size correction via ENR delta, discount normalization by contract vintage, payment terms optimization). Includes signal strength scoring, filterable table, and CSV export with action items."
}
```

- [ ] **Step 2: Run production build**

```bash
npm run build
```

Fix any TypeScript or build errors.

- [ ] **Step 3: Run lint**

```bash
npm run lint
```

- [ ] **Step 4: Final commit and push**

```bash
git add -A
git commit -m "feat(upsell-signals): changelog entry and build verification"
git push origin main
```

- [ ] **Step 5: Verify on Vercel**

After deploy:
- `/account-intelligence` loads, 4th tab visible
- Upsell Signals tab renders data (even if many columns show "No data" — that's expected given data gaps)
- Filters and sorting functional
- CSV export works

- [ ] **Step 6: Update Notion**

Update the Notion project page (`33bae6b4a3b9804e9e56f8492a773682`) Next Steps / Notes with today's progress.

---

## Known Limitations & Next Steps (do NOT build these now)

These are documented for future iterations:

1. **Discount data availability** — `Discount Percentage` and `Recurring Discount Percentage` ARE on the pipeline sheet. However, many rows may have empty values if the field wasn't consistently populated in SFDC. Expect some "No data" in the discount vector — that's a data quality signal, not a bug.
2. **GMV / Usage Proxy** — Micah wants GMV as a size proxy (should ≈ 30% of ACR). This data source isn't wired up yet. Future column addition once we identify where GMV lives.
3. **Luke's BPS comparison** — The discount vector should eventually cross-reference against Luke's basis points schedule to show how far each customer is from standard pricing. Requires BPS data source.
4. **MCAA / EC&M data** — Micah mentioned additional external data sources beyond ENR. Future enhancement to add as a second external revenue benchmark.
5. **CSM-facing view** — Once the data quality issues are resolved, this tab (or a derivative) could become a CSM-facing renewal prep tool. For now it's RevOps-facing for data cleanup and strategy.
6. **Product value vector** — Micah is leaving this to CS. Could add a qualitative column later where CSMs can tag accounts with product value notes, but not in V1.
