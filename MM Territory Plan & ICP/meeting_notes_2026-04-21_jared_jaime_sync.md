# Meeting Notes — Vincent / Jared / Jaime Sync

**Date:** 2026-04-21 (afternoon)
**Topic:** ICP Classifier Phoenix+SA/Austin sample review → greenlight for full 11-territory run
**Source:** Zoom AI summary (imported verbatim; lightly reformatted for readability)

---

## Key Outcomes

Vincent built a Python script that automates website scraping for territory assignment, processing Phoenix and San Antonio initially with plans to run all 3,000 accounts overnight. The team will validate data quality by reviewing 20 accounts per territory by Friday, then finalize territory assignments in Monday's sales leadership meeting for a potential May 1st launch.

## Decisions Made

- **Validation approach:** Each team member reviews 20 random accounts from the "needs human review" bucket in their assigned territories to establish quality proxy percentages
- **Territory expansion criteria:** If proxy analysis shows insufficient ICP accounts, expand radius from 75 to 125 miles to reach 300 accounts per territory
- **Holdover strategy:** AE holdovers (close-loss opportunities), SDR holdovers, and unassigned large mid-market accounts will populate Tier 2 of territories
- **Launch timeline:** Target May 1st launch if decisions finalized Monday; willing to delay to ensure quality over speed
- **Script output format:** Excel export converted to Google Sheets for collaboration is approved

## Technical Implementation

- **Script architecture:** Python automation using Claude API with context from prior Claude project instructions, Endgame ICP analysis, and Kojo product/competitive files
- **Categorization logic:** Identifies ICP fit vs non-ICP fit, flags accounts needing human review (primarily when websites unreachable or blocked from scraping)
- **Phoenix results:** 40 confirmed ICP accounts from 307 total; 100 need human review; 153 previously marked ICP now reclassified as unlikely (better accuracy than pattern-based approach)
- **Cost and runtime:** Under $2 in API costs so far; overnight processing capability for full 3,000 account run
- **Improvement potential:** Script accuracy may improve over time with refinement; some websites block AI scrapers despite being accessible to humans

## Territory Assignment Breakdown

**Assigned for review (20 accounts each):**

- **Jared:** Arizona, Georgia
- **Vincent:** Phoenix, San Antonio/Austin
- **Jeremy:** DFW, Houston
- **Sadie:** Florida, North Carolina
- **Jaime:** DC/Baltimore, New York/New Jersey, Minneapolis/Louisville

**Note:** "Other Texas" territory with scattered accounts may be allocated to San Antonio/Austin if needed to reach minimum thresholds.

## Pending Confirmation

- **Script output quality:** Full 3,000 account run completion expected by Thursday morning or end of day
- **Proxy percentages:** Percentage of "needs review" accounts that are actual ICP fits varies by geography (could range 30–70%)
- **Sufficient account density:** Whether territories contain enough ICP accounts without radius expansion unknown until proxy analysis complete
- **New hire backfill:** Marcus and V's pre-scrubbed books will be assigned to new SDRs starting second week of May

## Action Items

- **Vincent:** Run Python script on all 3,000 accounts overnight; deliver results by Thursday EOD
- **All team members:** Complete 20-account proxy analysis for assigned territories by Friday EOD (60–90 minutes each)
- **Jared:** Lead territory pairing decisions and AE assignment recommendations in Monday sales leadership meeting
- **Sadie:** Coordinate with Via on SDR holdover amounts and new hire territory assignments
- **Jeremy:** Push through ACS opportunity with Pat before Wednesday follow-up call

## Open Questions

- **Geographic variance:** West Coast likely has better website quality than Midwest, requiring territory-specific proxy analysis rather than universal extrapolation
- **Minimum viable threshold:** If only 20–30% of "needs review" bucket proves ICP fit, whether 50–100 confirmed accounts per territory sufficient to launch strategy
- **Phased rollout option:** Whether to assign anchor territories with confirmed accounts while continuing to scrape and validate additional accounts

## Next Steps

- **Friday EOD:** All proxy analyses complete, uploaded to shared tracking
- **Monday sales leadership meeting:** Finalize territory pairings and AE assignments based on validated account counts
- **Tuesday (if approved):** Communicate territory assignments to AEs and SDRs; initiate AE holdover process
- **May 1st (target):** Launch new territory structure if validation confirms sufficient account density
