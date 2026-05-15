# Crestline Procurement — RevOps Hub

A live demo of a GTM operations dashboard suite built for an executive audience at a fictional construction-tech company. Designed and built by [Vincent DeRise](https://www.linkedin.com/in/vincentderise).

## What's inside

- **Pipeline Pulse** — Weekly pipeline creation vs. board plan, blended and source-adjusted
- **Pipeline Coverage** — Forward-looking open pipeline vs. quota
- **Created Cohort Win Rate** — Monthly cohort analysis of pipeline-created → closed-won
- **Revenue Breakdown** — Closed-won attribution by source, set type, and segment
- **Scenarios** — Backtest coverage multiples against historical actuals
- **MM SDR** — Mid-market SDR funnel and pipeline contribution
- **Account Intelligence** — Upsell signals across Size, Discount, Billing, and Renewal vectors
- **Pricing Calculator** — BPS-based deal pricing with discount and ROI math
- **RevOps Support** — Static landing page for the demo's "ask the RevOps team" flow
- **Updates** — Changelog of dashboard features shipped over time
- **Architecture** — System manual covering data flow, app inventory, and tool stack

Every dashboard has an in-line Methodology tab documenting the math behind the numbers.

## About the data

All data in this demo is synthetic. A deterministic generator (`scripts/generate-demo-data.ts`) produces ~400 opportunities, 15 customer accounts with hand-tuned upsell signals, 6 months of quotas, SDR meetings, and Contract ACR snapshots — all internally consistent so the dashboards tell a coherent story.

The generator uses a seeded RNG (`"crestline-2026"`) so re-runs produce identical output and diffs in version control are reviewable.

## Tech

- Next.js 15 (App Router) · React 19 · TypeScript 5.8 (strict)
- Tailwind v4 · PostCSS
- PapaParse 5.5 for CSV parsing
- Vercel hosting
- No state management library, no UI component library, no testing framework — all custom

## Run locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`.

## Regenerate demo data

```bash
npm run generate-demo-data
```

Outputs land in `data/demo/`: `pipeline.csv`, `closedWon.csv`, `quotas.csv`, `sdrSets.csv`, `customerAccounts.csv`, `customer-contract-acr.json`.

## Contact

For the engineer behind the build: [vincentderise on LinkedIn](https://www.linkedin.com/in/vincentderise).
