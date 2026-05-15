# Pipeline Scenarios — Claude Code Brief

## What This View Answers
"Is 5.8× the right coverage multiple, or are we inflating pipeline and therefore need a higher multiple?" — Micah's exact feedback from the Slack thread on 3/24.

This view has two halves:
1. A historical backtest showing what coverage actually produced in 2025
2. An interactive scenario planner that lets leadership test assumptions in real time

## Route
Add this as a new page at `/scenarios` in the existing Next.js app. Add a card for it on the `/hub` page with category "ANALYTICS", title "Pipeline Scenarios", status "Live", and description "Backtest coverage multiples against 2025 actuals and model what-if scenarios with interactive controls."

## Data Source
Same Google Sheet as Pipeline Pulse and Coverage (Coefficient daily sync from SFDC). Same data-loader.ts, same fallback to CSV.

**Important:** The Google Sheet must include opps with Discovery Dates from 2024-01-01 forward (not just 2025). This backfill is necessary so that "Open Pipeline at Month Start" for January 2025 includes pipeline that was already in the system. The sheet also includes an **"Account: Last Activity"** column (exact column name) used for staleness calculations. The data-loader.ts must parse this column as a date.

## SECTION 1: Historical Backtest (static table)

### What to show
For each month in 2025 (January through December) and Q1 2026 (January through March), show one row with:

- **Month**: Jan-25, Feb-25, etc.
- **Open Pipeline at Month Start**: Total Amount of all opps where: (a) Discovery Date is BEFORE the 1st of that month (the opp existed), AND (b) Close Date is ON or AFTER the 1st of that month OR the opp is still in an open stage (the opp hadn't closed yet). This gives us the pipeline that was sitting there going into the month. The dataset includes opps with Discovery Dates from 2024 forward to capture pipeline that existed before January 2025.
- **Fresh Pipeline**: Same as above but only opps where Last Activity Date (account level) is within the stale threshold of the month start date. Default: 90 days. This uses LAST ACTIVITY DATE, not Discovery Date age — an opp created 200 days ago but with activity last week is NOT stale.
- **Closed Won**: Total Amount of opps with Stage = "Closed Won" and Close Date within that month.
- **Implied Multiple (All)**: Open Pipeline ÷ Closed Won. This is the coverage multiple that actually produced that month's CW.
- **Implied Multiple (Fresh Only)**: Fresh Pipeline ÷ Closed Won. This is the coverage multiple using only non-stale pipeline.
- **Quota**: Monthly quota for that month (read from config.ts — for 2025 months, use $563K as the plan number since we don't have monthly quotas; for 2026, use the actual quotas from config).
- **Attainment**: Closed Won ÷ Quota as a percentage.

### Key insight this reveals
If months where the "Fresh Only" implied multiple was 4× produced the same attainment as months where it was 6×, then 4× is sufficient and 5.8× is overkill. The table will show the historical relationship between coverage and outcomes.

### Important calculation note
"Open Pipeline at Month Start" is computed using two fields:
- **Discovery Date** tells us when the opp entered pipeline (must be before month start)
- **Close Date** tells us when it closed (must be on or after month start, OR opp is still open)

This gives us an accurate view of what was in the pipe on any given date. The dataset includes opps with Discovery Dates from 2024-01-01 forward, which is necessary to capture pipeline that existed going into January 2025.

**Staleness is measured by the "Account: Last Activity" field** (this is the exact column name in the Google Sheet), NOT Discovery Date age. This is critical — Micah and Luke specifically called out that an old opp with recent activity is not stale. Parse this column as a date.

## SECTION 2: Interactive Scenario Planner

### Layout
Similar to a financial calculator or projection tool. Controls on top, dynamic output below.

### Controls (3 sliders + 1 dropdown)

1. **Stale Threshold (days since last activity)**: Slider from 30 to 180 days, default 90.
   - Measures staleness by the "Account: Last Activity" column in the Google Sheet, NOT by Discovery Date age
   - As this moves, the "fresh pipeline" number recalculates in real time
   - Opps where (reference date − Account: Last Activity) exceeds the threshold are excluded from fresh pipeline
   - Show the current value prominently: "Opps with no activity in the last X days are excluded"

2. **Coverage Multiple Target**: Slider from 2× to 8×, default 5.8×.
   - Shows the implied weekly and monthly creation needed at each level
   - "At 4×, you need $X/wk. At 5.8×, you need $Y/wk."
   - This is informational — it shows what the target WOULD be at different multiples

3. **Win Rate**: Slider from 5% to 35%, default seeded with actual blended win rate from the data (~15.4%).
   - Higher WR means you need less pipeline per CW dollar
   - This directly affects the coverage multiple calculation
   - The implied multiple = 1 ÷ Win Rate (e.g., 17.2% WR → 5.8×, 25% WR → 4×)

4. **Segment Filter**: Dropdown with "All", "MidMarket", "Enterprise"
   - Filters the backtest table and scenario output to the selected segment
   - Seeded win rates change per segment: MM ~18.5%, ENT ~16.4%
   - Stale thresholds have different defaults per segment but the slider overrides

### Dynamic Output (updates in real time as sliders move)

**Summary Cards (top row, 3-4 cards):**
- Current Fresh Pipeline: $X (based on stale threshold slider)
- Coverage Ratio: X.X× (fresh pipeline ÷ monthly quota)
- Status: green/yellow/red based on whether ratio meets the target multiple
- Weekly Creation Needed: $X/wk (to maintain the target multiple)

**Chart:**
A line or area chart showing the backtest months on the X axis. Two lines:
- Blue line: Implied multiple (all pipeline) per month
- Green line: Implied multiple (fresh only) per month
- Dashed horizontal line: The target coverage multiple from the slider
- Dots or bars: Attainment % per month (secondary Y axis)

This visually shows: when the green line (fresh coverage) was above the target line, did attainment follow? When it was below, did attainment drop?

**Insight text (auto-generated based on slider positions):**
Dynamic text that updates as sliders move. Example:
"At a [X]-day stale threshold and [Y]% win rate, the implied coverage multiple is [Z]×. Based on 2025 data, months where fresh coverage exceeded [Z]× achieved [A]% average attainment vs [B]% when below."

## Design
Same dark theme as Pipeline Pulse and Coverage. Same color tokens. Same component style.

Key colors for this view:
- Blue line for all-pipeline multiple
- Green line for fresh-pipeline multiple
- Dashed red/teal line for the target multiple
- Use the existing green/yellow/red status colors for attainment thresholds

## Config Values (add to lib/config.ts if not already present)

```typescript
scenarios: {
  defaultStaleThresholdDays: 90,
  defaultCoverageTarget: 5.8,
  // 2025 monthly quotas (operating plan, not 100% attainment)
  monthlyQuotas2025: {
    'Jan': 563000, 'Feb': 563000, 'Mar': 563000,
    'Apr': 563000, 'May': 563000, 'Jun': 563000,
    'Jul': 563000, 'Aug': 563000, 'Sep': 563000,
    'Oct': 563000, 'Nov': 563000, 'Dec': 563000,
  },
  // 2026 quotas from existing config
  // Jan: 662708, Feb: 672708, Mar: 682000
}
```

Note: 2025 quotas are approximate ($563K/mo plan). We don't have exact 2025 monthly quotas. Use $563K as the baseline. The 2026 quotas are already in config.ts.

## Processing Logic

Create a new file `lib/process-scenarios.ts` that:

1. Takes the raw opp data (same as other views)
2. For each month (Jan 2025 through current):
   a. Compute "open pipeline at month start": all opps where Discovery Date < month start AND (Close Date >= month start OR Stage is still open)
   b. Compute "fresh pipeline": subset of (a) where "Account: Last Activity" is within the stale threshold of the month start date
   c. Compute CW for that month (Close Date within month, Stage = Closed Won)
   d. Compute implied multiples and attainment
3. Return the monthly backtest data
4. Compute current-state scenario metrics based on slider values

## Important Context from the Team

From Micah (3/24 Slack):
- "Typically, you'd want to see ~4x coverage. 5.8x is high and makes me wonder if we have too loose a definition of what is 'pipeline' which is driving down conversion rates"
- "pipeline should be defined as deals with a close date within 4 months"
- Staleness should potentially use "last activity date" not Discovery Date age

From Luke (3/24 Slack):
- "The key assumption in the way I've built the 5.8x is close rate assumption — if that moves from historical trends, then the multiple shifts up/down a lot"
- "Even a modest improvement in win rates drops the multiple meaningfully — if we moved the blended rate from ~17.5% to 20%, the multiple falls to ~5x"
- The 5.8× is derived from close rates of 16.4% (ENT) and 18.5% (MM)

Note: The Google Sheet includes an **"Account: Last Activity"** column. This is the field used for staleness calculations throughout this view. The data-loader.ts needs to be updated to parse this new column as a date field and make it available to the processing logic.

## After building, deploy to Vercel production.
