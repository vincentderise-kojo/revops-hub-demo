# Pipeline Coverage View — Claude Code Brief

## What This View Answers
"Do we have enough pipeline to hit plan?" — Micah's exact words from the Slack thread: "The idea here isn't to force us to close things — it's to have a better idea of 'do we have enough pipeline to hit our goals.'"

This is the forward-looking counterpart to the Pipeline Pulse (which is backward-looking: "how much did we create?"). Coverage looks at what's currently in the pipe and whether it's enough to close the month/quarter.

## Route
Add this as a new page at `/coverage` in the existing Next.js app. Add a card for it on the `/hub` page with category "PIPELINE", title "Pipeline Coverage", status "Live", and description "Forward-looking coverage analysis. Do we have enough open pipeline to hit plan this month and next quarter?"

## Data Source
Same Google Sheet as Pipeline Pulse (Coefficient daily sync from SFDC). Same data-loader.ts, same fallback to CSV. The difference is how the data is filtered and viewed:
- Pipeline Pulse filters by **Discovery Date** (when pipeline was created)
- Coverage filters by **Close Date** (when pipeline is expected to close) and **Stage** (only open opps)

## What to Show

### Section 1: Coverage Scoreboard
Show open pipeline vs quota for three time windows:
- **This month** (remaining days in current month) — opps with Close Date in current month AND Stage is open (Discovery, Evaluation, Contracts/Negotiation)
- **Next month** — same logic, Close Date in next month
- **This quarter** (remaining months) — Close Date within current quarter

For each window show:
- Total open pipeline $
- Quota for the period (read from config.ts — monthly quotas already exist there)
- Coverage ratio (open pipeline ÷ quota)
- Target coverage ratio: **5.8×** (Luke confirmed this in the Slack thread: "fwiw I think we need closer to 5.8x coverage across both teams")
- Status: green if coverage ≥ 5.8×, yellow if ≥ 3×, red if < 3×

Split by segment (MM and ENT) with Luke's thresholds:
- **MM (Jeremy Taylor's team):** Needs $1,369,459 of open pipeline at any given time, freshness ceiling 70 days
- **ENT (Sean Coyle's team):** Needs $1,888,110 of open pipeline at any given time, but currently has ~$18M (massive bloat — most of this is stale)

### Section 2: Pipeline Aging
This is the critical insight — how much of the open pipeline is "real" vs stale.

For each segment, show pipeline split by age bucket:
- **Fresh:** ≤40 days old (MM) / ≤90 days old (ENT) — this is pipeline we trust
- **Aging:** 41-70 days (MM) / 91-150 days (ENT) — getting stale, needs attention
- **Stale:** >70 days (MM) / >150 days (ENT) — likely dead, inflating the numbers

Age = today's date minus Discovery Date (not Close Date).

Show this as a stacked bar: fresh (green) + aging (yellow) + stale (red) = total.

The key metric: **Fresh pipeline vs Luke's threshold.** If fresh MM pipeline < $1.37M, we don't have enough real pipeline even though the total might look fine.

Luke's insight from Slack: "the $18.9M in open pipe is... large..." — meaning ENT has massive bloat that needs to be cleaned. This view should make that obvious visually.

### Section 3: Stage Composition
For the current month's close window, break down open pipeline by stage:
- Discovery — earliest stage, lowest confidence
- Evaluation — middle, showing buying intent
- Contracts/Negotiation — latest stage, highest confidence

Show as a funnel or horizontal stacked bar. Pipeline in later stages is more reliable for the current month's close plan. Pipeline still in Discovery with a close date this month is a red flag.

### Section 4: Top Deals by Close Date
Table of the top 15-20 deals driving the current month and next month's coverage, sorted by Amount descending:
- Opportunity Name
- Amount
- Owner
- Stage
- Close Date
- Age (days since Discovery)
- Segment (MM/ENT)

This is so Jared can eyeball whether the close plan is real. He said: "Look at our total open pipeline for Q2 as we enter Q2 to gauge pipeline coverage to quota."

### Section 5: Close Date Health
From the Slack thread, close date accuracy was a major concern. Jared: "close dates are a bigger area of opportunity... Different AEs are better at this. Jack hoards stale pipeline and so does GHughes."

Show:
- Count of open opps with Close Date in the past (already missed) — these need updating
- Count of open opps with Close Date this month by stage (are they really going to close?)
- Flag any opp in Discovery stage with Close Date < 30 days out (unlikely to close)

## Design
Same dark theme as Pipeline Pulse. Same color tokens from the existing app. Same component style — cards, tables, progress bars. Add a "Pipeline Coverage" tab at the top alongside "Weekly Lookback" and "Sources & Methodology", OR make it a separate page at /coverage with its own nav. I'd recommend a separate page since it's a different tool with different logic.

## Config Values (add to lib/config.ts)
```
coverage: {
  mm: {
    requiredPipeline: 1369459,    // Luke's threshold
    freshCeilingDays: 70,          // 1.75× the 40-day sales cycle
    staleDays: 40,                 // MM sales cycle
    agingDays: 70,                 // stale threshold
  },
  ent: {
    requiredPipeline: 1888110,    // Luke's threshold
    freshCeilingDays: 150,         // ~1.5× the 110-day sales cycle
    staleDays: 90,                 // ENT stale threshold
    agingDays: 150,                // beyond this = very stale
  },
  targetCoverageMultiple: 5.8,    // Luke's coverage target
}
```

## Segmentation
Same two-gate model as Pipeline Pulse (already in process-pipeline.ts):
- Gate 1: Annual Revenue ≥ $75M = ENT, else MM
- Gate 2: Manager override — Sean Coyle → ENT, Jeremy Taylor → MM

## Open Pipeline Definition
Stage must be one of: Discovery, Evaluation, Contracts/Negotiation
Exclude: Closed Won, Closed Lost, Qualification (not yet in pipeline)
Exclude: Amount = 0 or blank

## Important Context from the Team
- Jared confirmed March/April close dates are clean ("all AEs cleaned that up a few weeks ago and I checked it myself")
- May and June need cleanup (Sean: "I think there's some major clean up work to do for may and june")
- ENT has $18M in open pipeline vs $1.89M needed — the aging view will expose this
- Luke wants to do a spot check at end of March to see "how much real pipeline we have heading into Q2"
- The team agreed on a 4-month forward window for ENT (Sean asked, Luke/Micah confirmed)

## After building, deploy to Vercel production.
