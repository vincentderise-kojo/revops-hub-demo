# MOJO Metric — Claude Code Brief

## What This Answers
"Is our pipeline growing or shrinking?" — Luke asked for this directly ("how much is leaving pipeline each week"), and Micah described it as "keeping the steady state of quality pipeline at 4× is the name of the game." Bill Binch (Battery Ventures, Kojo's investor) calls this the "Mojo Metric" — the most important metric he looked at daily.

## Where It Lives
Add this as a new section on the existing Coverage dashboard (`/coverage`). Place it AFTER the Coverage Scoreboard and BEFORE Pipeline Aging. Also add a **Stale Threshold slider** to the Coverage page (same as the one on Scenarios) that controls both the MOJO section and the Pipeline Aging section.

## Binch's MOJO Formula
```
(New Pipe Created + Deals Pulled In) − (Deals Killed + Deals Pushed Out) = Net Pipeline Added
```

We're implementing a version of this adapted to what our data supports.

## The Staleness Slider (add to Coverage page)
Add a slider at the top of the Coverage dashboard, similar to the one on Scenarios:
- **Stale Threshold**: Slider from 30 to 180 days, default 90
- Label: "Pipeline with no activity in X+ days is excluded"
- Uses opp-level **"Last Activity"** column for current-state calculations
- This slider controls BOTH the MOJO section AND the existing Pipeline Aging section
- When the slider moves, everything recalculates in real time

## MOJO Section — What to Show

### Summary Cards (top row, 4 cards, for the current week)
- **Pipeline In**: $ amount of pipeline that entered the fresh pool this week
- **Pipeline Out**: $ amount of pipeline that left the fresh pool this week
- **Net Change**: In − Out (green if positive, red if negative)
- **Fresh Pipeline Total**: Current total fresh pipeline (same number shown in Pipeline Aging, but repeated here for context)

Show both $ amounts AND opp counts on each card (Binch emphasizes tracking both — "one AE pushing $1M is different from ten $100K deals leaving").

### Weekly Flow Chart (last 12 weeks)
A bar chart with:
- **Green bars going UP**: Pipeline In (new + reactivated)
- **Red bars going DOWN**: Pipeline Out (CW + CL + went stale)
- **Line overlay**: Net change per week (green if positive, red if negative)
- **Dashed line**: Cumulative fresh pipeline total (right Y axis) — shows the trajectory over time

X axis = week labels (Mon-Sun dates). Most recent week on the right.

### Weekly Flow Table (last 12 weeks, below the chart)
Each row = one week. Columns:

| Week | New Created | Reactivated | Total In | Closed Won | Closed Lost | Went Stale | Total Out | Net Change | Fresh Total | Opps In | Opps Out |
|------|------------|-------------|----------|------------|-------------|------------|-----------|------------|-------------|---------|----------|

## How to Calculate Each Component

### Pipeline In (positive — pipeline entering the fresh pool)

**New Created**: Opps with Discovery Date in this week AND Last Activity within the stale threshold. These are brand new opps entering the system.
- Filter: Discovery Date >= week start AND Discovery Date <= week end
- AND Last Activity >= (today − stale threshold days)
- Amount: sum of Amount for matching opps

**Reactivated**: Opps that WERE stale (Last Activity was beyond the threshold) but got touched this week (Last Activity is now within the threshold AND falls within this week).
- This is harder to compute without historical snapshots. For V1, skip this component and just show New Created as the "In" metric. Add a note: "Reactivated deals (stale opps that received new activity) will be added in a future update."
- **SIMPLIFICATION FOR V1**: Pipeline In = New Created only

### Pipeline Out (negative — pipeline leaving the fresh pool)

**Closed Won**: Opps with Close Date in this week AND Stage = Closed Won.
- These left pipeline because they converted to revenue. This is GOOD attrition.
- Amount: sum of Amount for CW opps in the week

**Closed Lost**: Opps with Close Date in this week AND Stage = Closed Lost.
- These left pipeline because they died. This is BAD attrition.
- Amount: sum of Amount for CL opps in the week

**Went Stale**: Opps that are still in an open stage but whose Last Activity date just crossed the stale threshold relative to the end of this week.
- Filter: Stage is open (Discovery, Evaluation, Contracts/Negotiation) AND Last Activity < (week end date − stale threshold)
- For the CURRENT week, this is straightforward — check Last Activity against today.
- For HISTORICAL weeks, Last Activity is current-state (same limitation as Scenarios). For V1, only compute "Went Stale" for the current week. Historical weeks show "—" for this column.
- **SIMPLIFICATION FOR V1**: Went Stale only computed for current week

**Total Out** = Closed Won + Closed Lost + Went Stale

### Net Change
Net = Total In − Total Out

### Fresh Pipeline Total
Running total: previous week's Fresh Total + this week's Net Change.
For the most recent week, this should match the fresh pipeline number in the Pipeline Aging section (since both use the same stale threshold slider).

## Interaction with Existing Coverage Sections

### Pipeline Aging Section
The existing Pipeline Aging section currently uses hardcoded thresholds (MM: 70d, ENT: 150d). Replace this with the dynamic stale threshold slider. When the slider moves:
- Pipeline Aging recalculates fresh/aging/stale buckets
- MOJO recalculates all flow metrics
- The Fresh Total in MOJO matches the Fresh number in Aging

### Coverage Scoreboard
The Coverage Scoreboard stays as-is (uses all open pipeline, not filtered by staleness). The staleness filter applies to Aging and MOJO only.

## Segment Filter
Add the same segment dropdown as Scenarios: All, MidMarket, Enterprise. Filters both MOJO and Aging. When MidMarket is selected, only MM opps are counted. Uses the same segmentation logic (Manager gate + Annual Revenue gate).

## Data Source
Same Google Sheet as all other views. Same data-loader.ts. No new data source needed. The "Last Activity" column (opp-level) is already parsed from the previous Scenarios build.

## Config
```typescript
mojo: {
  defaultStaleThresholdDays: 90,
  weeksToShow: 12,  // show last 12 weeks of flow data
}
```

## Design
Same dark theme. The MOJO section should feel like an extension of the Coverage dashboard — same cards, same table style, same chart aesthetics.

The flow chart is the visual centerpiece. Green bars up, red bars down, net line threading through. This should be immediately readable — "is the green bigger than the red? Are we growing or shrinking?"

## Important Notes

1. **V1 simplifications**: Skip "Reactivated" (requires historical Last Activity snapshots) and only compute "Went Stale" for the current week. The core value — Created vs CW vs CL per week — is still highly useful without these.

2. **The staleness slider is the key innovation**: This is what makes our MOJO different from a generic pipeline flow chart. Leadership can ask "at our current 90-day definition, are we growing?" and then tighten to 60 days and see "oh, fresh pipeline is actually shrinking even though total is growing — we're creating but not advancing."

3. **Both dollars and opp counts**: Binch specifically calls out tracking both. One $500K deal leaving looks different from five $100K deals leaving. Show opp counts alongside dollar amounts in the summary cards and in the table.

4. **Closed Won should be visually distinguished from Closed Lost**: Both are "out" but CW is good attrition (revenue!) and CL is bad. Use different shades — perhaps teal for CW (positive outcome) and red for CL (negative outcome) — so they're not confused.

## After building, deploy to Vercel production.
