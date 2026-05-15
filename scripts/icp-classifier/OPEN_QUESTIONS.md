# MM Territory Planning — Open Questions

Durable record of unresolved territory questions surfaced during ICP classification + pod planning. Update or remove items as they're answered. Cross-referenced from the Notion `RevOps Hub: ICP Classifier & Enrichment Foundation` page and the `MM Territory Planning - Build Tier 1 SFDC Reports` page.

## 1. Territory #6 - Nashville-Charlotte — no AE owner

**Question:** Who covers the Nashville-Charlotte marquee territory?

**Status:** Orphan as of 2026-04-30. Marty selected Option A (Territory #4 - NYC/NJ), leaving #6 without an AE.

**Why it matters:** 330 ICP Fit accounts (within the 350mi pool) currently roll up to a Nashville-Charlotte `MM_Pod_Territory__c` with no `AE_Territory__c` under the BoB-filtered alignment. They won't appear in any AE-scoped report or routing rule until coverage is decided.

**Options brainstormed 2026-04-30:**
- Roll Nashville-Charlotte into Sasha's Southeast (Atlanta + Tampa-FL + NC). Strongest data argument: lateral fill already pulled 13 NC accounts into Southeast; markets are geographically adjacent (Atlanta-Charlotte ~250mi, Atlanta-Nashville ~250mi). Solves Sasha's structural shortfall (233 own-pool) AND removes the orphan in one move.
- Assign to Nash with DMV — would help DMV's structural shortfall (162 own-pool) but creates a very wide geographic spread.
- Leave orphan, route inbound RR / SDR-led until further notice.
- Hire / promote a 6th AE to own it.

**Counter-argument to Sasha absorption:** Sasha is new in role. Original pod doc framed her territory as a focused ramp (Tampa anchored by Power Design + Atlanta secondary). Adding NC widens her book to FL + GA + TN + NC. Workload is capped by 250-account BoB rule, but anchor talk tracks and SDR coordination scale with marquee count.

**Decision tabled 2026-04-30** — revisit with Jared / Jeremy before re-upserting the BoB CSV.

## 2. Minneapolis-Louisville — no AE owner

**Question:** Who covers the Minneapolis-Louisville marquee territory?

**Status:** Unresolved as of 2026-04-30. Currently no AE assigned, leaving 2,905 accounts (310 ICP Fit / 884 Needs Review / 1,711 Unlikely) without an AE Territory rollup in the bulk update CSV.

**Why it matters:** Those accounts get a `MM_Pod_Territory__c` value but a blank `AE_Territory__c`, so they won't show up in any AE-scoped report or routing rule until coverage is decided.

**Options to consider:**
- Assign to an existing AE territory — geographically the pair is awkward (Minneapolis and Louisville are 600+ miles apart); may need a split.
- Create a new AE territory if headcount supports it.
- Leave unassigned and route as inbound-only / SDR-led until further notice.

**Next step:** Decision needed from Jared / Sales leadership; update `inputs/ae_territory_mapping.csv` and re-run `build_sfdc_update.py` + `build_bob_csv.py`.

## Resolved

- **Marty Option A vs B (resolved 2026-04-30):** Marty selected Territory #4 - NYC/NJ. Territory #6 - Nashville-Charlotte left orphan — see Q1 above.
