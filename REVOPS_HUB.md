# RevOps Hub — Context Doc

> Last updated: 2026-05-15
> Purpose: Single source of truth that explains what the Kojo RevOps Hub is, what Vincent has built, the public portfolio fork, and how to keep both repos current. Pasteable across DJ (Kojo workspace), the portfolio repo, and Vincent's personal repo so every Claude instance starts with the same context.

---

## TL;DR

Vincent DeRise (Director of Revenue Operations at Kojo, a construction-tech SaaS) has built and ships a multi-view GTM dashboard suite called the **RevOps Hub**. It runs on Next.js + Vercel against a daily Coefficient-synced Salesforce dataset and serves the CEO, VP Sales, and Head of Finance as their primary pipeline / revenue / coverage / cohort view. The work is sole-engineer; Vincent is RevOps by title and has built every dashboard, every data pipeline, and every Claude Code skill that maintains them.

A **public portfolio fork** of the Hub now exists under a fictional company called *Crestline Procurement* — synthetic data, no live integrations, deployed at https://revops-hub-demo.vercel.app. The portfolio version exists so Vincent can talk about this work externally without exposing Kojo data.

---

## What Vincent has built (the headline accomplishment)

A 12-view internal GTM platform that the executive team treats as the canonical source for "where is pipeline" and "are we on plan." Built over Q1–Q2 2026 as a solo engineering effort alongside a full RevOps role.

### Views shipped

| View | Route | What it answers |
|---|---|---|
| Pipeline Pulse | `/` | Are we hitting weekly pipeline creation targets, by source and owner group? |
| Pipeline Coverage | `/coverage` | Do we have enough open pipeline to hit plan this month and next quarter? |
| Created Cohort Win Rate | `/ccwr` | What share of pipeline created in month X eventually closed won? |
| Revenue Breakdown | `/revenue` | Closed-won attribution by source, set type, and segment. |
| Scenarios | `/scenarios` | Backtest coverage multiples against historical actuals. |
| MM SDR | `/mm-sdr` | Mid-market SDR funnel: meetings → SAOs → pipeline contribution. |
| Account Intelligence | `/account-intelligence` | Upsell signals across Size, Discount, Billing, and Renewal vectors. Includes a customer-by-customer table with parsed Contract ACR. |
| Pricing Calculator | `/pricing` | BPS-based deal pricing with discount and ROI math; auto-posts a summary to Slack. |
| RevOps Support | `/support` | Lightweight intake / FAQ surface. |
| Updates | `/updates` | Auto-rendered changelog of every dashboard ship. |
| Architecture | `/architecture` | System manual: which views, which data, which automations. |
| Hub | `/hub` | Landing page that links to all of the above. |

Each dashboard view has an inline Methodology tab that documents the math.

### Things that aren't dashboards but are part of the system

- **Monday Pulse** — Vercel cron that posts a Block Kit exec summary to `#pipeline-review` every Monday at 9:30 ET, DST-aware, fail-closed sanity gate.
- **Contract ACR snapshot pipeline** — A Claude Code skill (`/snapshot-contract-acr`) that authenticates to SFDC via JWT, pulls the latest signed Order Form PDF for every customer, parses Annual Construction Revenue via regex (with Claude as fallback for older templates), and writes a snapshot the dashboards consume.
- **Pricing → Slack** — The pricing calculator posts deal-shape requests to a `#pricing-requests` channel.
- **Daily SFDC refresh via Coefficient** — Google Sheets is the data plane between SFDC and the app; Coefficient runs the sync.
- **A growing library of Claude Code skills** — `/snapshot-contract-acr`, leadership deal inspection, an ICP classifier (Python CLI that scrapes account websites and grades fit), and more.

### Tech stack

- Next.js 15 (App Router), React 19, TypeScript 5.8 strict
- Tailwind v4 (custom dark theme)
- PapaParse for CSV ingestion
- Vercel hosting (Pro plan)
- No state management library, no UI component library, no testing framework beyond Vitest — all custom
- Anthropic SDK for in-app AI features
- Salesforce JWT auth for direct SFDC access
- Coefficient for sheet-side data sync

### Why this matters

The dashboards have become the operational pulse of the company. Pipeline reviews are run against Pipeline Pulse. Forecast conversations reference Coverage. Renewal motions are driven by Account Intelligence's Upsell Signals. Sales leadership doesn't open Salesforce reports anymore for the things this app covers.

---

## The portfolio fork — Crestline Procurement

A public demo of the same architecture, rebranded as a fictional construction-tech company called *Crestline Procurement*. Built so Vincent can share the work externally — LinkedIn, resume conversations, cold intros, portfolio site — without exposing real Kojo data, real customer names, real exec names, or live integrations.

### Live + repo links

- **Demo:** https://revops-hub-demo.vercel.app
- **Repo:** https://github.com/vincentderise-kojo/revops-hub-demo (public)
- **Local working copy:** `/Users/vincent/Documents/revops-hub-demo`

### What's identical to the Kojo Hub

- Every view, layout, color scheme, methodology tab
- Every chart type and computation
- The two-segment (MM/ENT) framing, the four-source (BDR / Field / Perf / AE Self-Set) framing
- The Pricing Calculator's BPS × Annual Construction Revenue formula
- Architecture page describing the full system

### What's different

- **Company name and persona** — Crestline Procurement instead of Kojo. Construction tech / MEP subcontractor focus retained.
- **All names fictional** — CEO Daniel Voss, VP Sales Marcus Halloran, Head of Finance Sara Lindgren, MM Manager Kevin Brand, ENT Manager Patrick Yu, plus fictional AEs / SDRs / managers.
- **No live integrations** — SFDC client deleted, cron routes deleted, Slack stubbed (the button fires a fake "posted!" toast and does nothing). All data is committed CSVs + JSONs in `data/demo/`.
- **No auth** — passcode gate stripped. Site is fully public.
- **Deterministic synthetic data** — generator at `scripts/generate-demo-data.ts` (seed `"crestline-2026"`) produces 400 opps, 15 hand-tuned customer accounts, a contract ACR snapshot, quotas, SDR sets. Re-runs are reproducible.

### What's not yet polished on the demo

- MM SDR call activity section renders empty (no synthetic call data generated).
- AE Performance tab on Pipeline Pulse shows "not wired" empty state for the qualification section.
- Account Intelligence ENR-rank match stats are zero (no synthetic ENR-rank file).
- Vercel preview URLs return 401 due to default deployment protection; canonical `revops-hub-demo.vercel.app` is open.

---

## How to update each repo

### Updating the Kojo Hub (internal)

This is the daily-driver repo at `/Users/vincent/Documents/DJ/pipeline-pulse-app`. Standard dev cadence:

1. Make changes, run `npm run build`.
2. Append a changelog entry to `pipeline-pulse-app/data/changelog.json` per the protocol in `.claude/CLAUDE.md`.
3. Commit, push to `origin/main` on `vincentderise-kojo/kojo-revops-hub`.
4. Deploy via `vercel --prod` (from the DJ root, not the subdirectory — Vercel project root is configured as `pipeline-pulse-app`).
5. Sync to Notion (RevOps Projects & Priorities DB) per the protocol.

### Updating the portfolio demo

The portfolio is a one-time fork. It does not auto-sync from Kojo. To bring a Kojo feature over:

1. Identify the Kojo commit(s) that shipped the feature.
2. Hand-port the code into `/Users/vincent/Documents/revops-hub-demo`. Watch for live-integration references — anything touching SFDC, Slack live posts, env vars, or the AuthGate component is a no-go in the portfolio.
3. If the feature needs new demo data, extend `scripts/generate-demo-data.ts` and run `npm run generate-demo-data`.
4. Sanitize any leftover Kojo references — names (Vincent's full Kojo roster is muscle memory by now, check for any of those), customer names, Slack channel IDs, internal Google Sheet links.
5. Build, commit, push to `origin/main` on `vincentderise-kojo/revops-hub-demo`.
6. Deploy via `vercel --prod` from inside the `revops-hub-demo` directory.

### When NOT to port to the portfolio

- Anything touching live SFDC, live Slack, live cron schedules.
- Internal-only views (e.g., a one-off audit page for Vincent's eyes).
- Features that depend on real customer names or proprietary external data (ENR Top 600, Kojo BPS bands beyond what's already published in the demo).

---

## Decisions worth remembering

A few non-obvious design calls that future-Claude (or future-Vincent) should know about:

- **The portfolio is a fork, not a config flag.** Approach A (one-time fork into a separate repo) was chosen explicitly over Approach B (a `DATA_MODE=demo` flag on a single repo). Tradeoff: portfolio diverges from Kojo over time and porting is manual. Upside: zero risk of accidentally leaking Kojo data through a flag-gated path; clean Phase-2 transfer to personal accounts.
- **Demo data is mixed-scale.** Pipeline Pulse / Coverage / Revenue / CCWR see realistic volume (~400 opps over 18 months). Account Intelligence is hand-tuned to 15 customers — small enough to manually verify, large enough to demonstrate every UI state (Reprice motion, Wallet Share, audit mismatch, recent upsell, open renewal, sub-annual billing).
- **Tool reference policy on the Architecture page.** Industry-standard SaaS names stay verbatim (Salesforce, Slack, Vercel, Notion, Google Workspace). Niche / bespoke tools are generalized (Endgame → "AI revenue intelligence platform", ZoomInfo → "data enrichment platform"). Reasoning: portfolio viewers should see familiarity with the standard RevOps toolkit, not a redacted version of someone's internal stack.
- **The Hub previously had a duplicate "AE Performance" card** that linked to `/` (same as Pipeline Pulse, where AE Performance lives as a tab). Removed in both repos on 2026-05-15.

---

## Status as of 2026-05-15

- **Kojo Hub** — actively shipping. Recent feature: Contract ACR signal on the Upsell Signals tab, renamed to "Stated ACR" with per-cell PDF / Quote source tags. Jul '26 Coverage Math row added with Perf Marketing's $1.0M commit (BDR still TBD).
- **Portfolio fork** — shipped and live. Public repo. Demo data deterministic and reproducible.
- **Phase 2 (transfer to personal accounts)** — deferred until Vincent decides he wants the portfolio off Kojo-affiliated infrastructure. Plan documented in `docs/superpowers/plans/2026-05-15-portfolio-fork.md`.

---

## Spec + plan trail

For deeper context on the portfolio build:

- **Design spec:** `docs/superpowers/specs/2026-05-15-portfolio-fork-design.md`
- **Implementation plan:** `docs/superpowers/plans/2026-05-15-portfolio-fork.md`

Both live in the Kojo DJ repo and capture the persona decisions, data-layer architecture, per-view sanitization plan, and the file-by-file scrub work.
