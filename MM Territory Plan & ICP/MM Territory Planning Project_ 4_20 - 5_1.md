**MM (Senior AE) TERRITORY LAUNCH**

Project Plan  ·  5/1 Launch Target

**9 Business Days  ·  April 21 – May 1, 2025**

## **Overview**

This plan covers all workstreams required to launch the new Senior AE 1:1 AE/SDR pod model with 10 marquee geographic territories (two per Senior AE) on May 1st. Each of the 5 Senior AEs will own 2 geo territories paired with 1 dedicated SDR. Six phases run concurrently across territory finalization, SFDC setup, sequence development, team communication, and pair enablement.

DRIs are assigned per task. Phases overlap intentionally — sequence development and SFDC setup run in parallel with team comms. The critical sequencing constraint: AEs and SDRs cannot submit territory preferences or holdover tags until after the strategy is communicated to them (Phase 2).

## **Phase Summary**

| Phase | Focus | Dates | Key DRI(s) | Hard Deadline |
| :---- | :---- | :---- | :---- | :---- |
| **PHASE 1** | Account Territory Finalization | Mon 4/21 – Wed 4/23 | Jared, Jared \+ Vinny, Vinny \+ Jaime | **4/23** |
| **PHASE 2** | Team Communication | Thu 4/24 | Jeremy \+ Jared, Sadie \+ Jared | **4/24** |
| **PHASE 3** | Pairing \+ Holdover Process | Mon 4/28 – Wed 4/30 | Jeremy (AEs) / Sadie (SDRs), Jared \+ Jeremy, Jared \+ Sadie | **4/30** |
| **PHASE 4** | Salesforce Territory Setup (Final) | Wed 4/30 – Thu 5/1 | Vinny \+ Jaime, Vinny | **5/1** |
| **PHASE 5** | Sequence Development | Runs concurrently 4/21 – 4/30 | Jared, Sadie | **4/30** |
| **PHASE 6** | Pair Enablement \+ Pre-Launch QA | Wed 4/30 – Thu 5/1 | Jeremy \+ Sadie, Jeremy \+ Sadie (facilitate) / each pair, Vinny \+ Sadie, Jared | **5/1** |

**PHASE 1  Account Territory Finalization**

*Week 1  |  Mon 4/21 – Wed 4/23*

| Complete ICP filtering via Claude CSV workflow | DRI: Jaime | 4/21 | In Progress |
| :---- | :---- | :---- | :---: |

* Run master CSV through Claude web search enrichment

* Flag accounts that meet ICP criteria (trade, size, ERP, geo)

* Remove/deprioritize non-ICP accounts

| Finalize 10 geo territory definitions (5 AEs × 2 territories each) | DRI: Jared \+ Vinny | 4/21 → 4/23 | Not Started |
| :---- | :---- | :---- | :---: |

* Confirm 10 territory account sets across geos

* Each AE will own 2 geo territories

* Validate account density per territory — target 250–350 named accounts per AE (across both territories)

* Ensure each territory anchored by at least 2–3 marquee ENT Kojo accounts

| SFDC territory tier labeling — pre-holdover pass | DRI: Vinny \+ Jaime | 4/22 → 4/23 | Not Started |
| :---- | :---- | :---- | :---: |

* Tier 1 \= geo territory accounts (all accounts within assigned state territories)

* Tier 2 \= holdover accounts and large MM accounts outside geo territory (tagged after holdover window closes)

* Create/confirm Tier field on Account object in SFDC

* Bulk-tag all geo territory accounts as Tier 1 based on state

**PHASE 2  Team Communication**

*Week 1 (end)  |  Thu 4/24*

| Communicate new strategy to MM AE team | DRI: Jeremy \+ Jared | 4/24 | Not Started |
| :---- | :---- | :---- | :---: |

* Jeremy-led team meeting — Jared attends

* Cover: why we're making this change, what the 1:1 pairing model means, what's expected

* Explain the 10-territory structure — each AE will own 2 geo territories

* Explain the holdover process and stank ranking process that comes next

* Q\&A — address concerns directly

* Note: AEs submit holdover tags/territory preferences after this meeting

| Communicate new strategy to SDR I and SDR IIs | DRI: Sadie \+ Jared | 4/24 | Not Started |
| :---- | :---- | :---- | :---: |

* Sadie-led team meeting — Jared attends

* Cover: new territory model, 1:1 AE pairing, joint account ownership, end of round robin

* Explain what changes in their day-to-day (territory-specific sequencing, pod syncs)

* Explain stank ranking process for AE pairing preferences

* Note: SDRs cannot submit pairing preferences until after this meeting

**PHASE 3  Pairing \+ Holdover Process**

*Week 2  |  Mon 4/28 – Wed 4/30*

| Collect blind territory stank rankings from AEs and SDRs | DRI: Jeremy (AEs) / Sadie (SDRs) | 4/28 | Not Started |
| :---- | :---- | :---- | :---: |

* Send blind preference form to all 5 AEs (Jeremy sends) — each AE ranks their top territory pair preferences

* Send blind preference form to all 5 SDRs (Sadie sends) — each SDR ranks which AE they'd prefer to pair with

* Each person provides 1-line rationale per preference (if they choose to)

* Window open: 4/28 morning — responses due EOD 4/28

| Reconcile rankings and finalize AE territory assignments | DRI: Jared \+ Jeremy | 4/29 | Not Started |
| :---- | :---- | :---- | :---: |

* Jared \+ Jeremy review AE preferences

* Factor in: current hunting grounds, attainment, territory upside, competitive risk, etc

* Finalize assignments

| Reconcile rankings and finalize SDR pairings | DRI: Jared \+ Sadie | 4/29 | Not Started |
| :---- | :---- | :---- | :---: |

* Jared \+ Sadie review SDR preferences

* Match SDRs to AEs — factor in complementary strengths

* Best SDR goes to highest-upside AE

* Finalize 5 × 1:1 pairings

| Open holdover account tagging window | DRI: Jeremy (AEs) / Sadie (SDRs) | 4/27 → 4/30 | Not Started |
| :---- | :---- | :---- | :---: |

* Share each AE's current named account list with them (without open opps)

* AE flags holdover accounts: active C/L deals, current hunting ground accounts, high-context relationships

* SDRs flag any accounts with active sequences or warm conversations

* Holdovers auto-kept by that AE regardless of geo territory — tagged as Tier 2 in SFDC

* Window open: 4/28 morning — tags due EOD 4/30

**PHASE 4  Salesforce Territory Setup (Final)**

*Week 2  |  Wed 4/30 – Thu 5/1*

| Finalize SFDC territory structure post-holdover | DRI: Vinny \+ Jaime | 4/28 → 4/30 | Not Started |
| :---- | :---- | :---- | :---: |

* Create 10 territory records in SFDC (one per geo territory)

* Territory naming convention: MM\_GEO\_FL, MM\_GEO\_TX, MM\_GEO\_CA, etc.

* Map AE ownership — each AE assigned to 2 territory records

* Reassign account ownership in SFDC where AE changes due to new territory assignments

| Apply Tier 2 tags for holdover and large MM accounts | DRI: Vinny \+ Jaime | 4/30 → 5/1 | Not Started |
| :---- | :---- | :---- | :---: |

* Begins after holdover window closes EOD 4/30

* Bulk-tag all flagged holdover accounts as Tier 2

* Tag large MM accounts outside geo territory as Tier 2

* QA: spot check 20 accounts per territory for correct tier labeling

* Ensure Tier field is visible on AE and SDR default SFDC account views

| Build territory-based SFDC views and reports | DRI: Vinny | 4/28 → 5/1 | Not Started |
| :---- | :---- | :---- | :---: |

* Account list view per territory — AE \+ SDR can filter to their book

* Pipeline report filtered by territory for weekly reviews

* SDR activity report by pair for Sadie

**PHASE 5  Sequence Development**

*Week 1–2  |  Runs concurrently 4/21 – 4/30*

| Write outbound sequences (elec/mech, marquee accounts specific) | DRI: Jared | 4/21 → 4/28 | In Progress |
| :---- | :---- | :---- | :---: |

* FL sequence (electrical focus) — already drafted

* TX \+ AZ sequence (electrical \+ mechanical mix)

* CA sequence (mechanical \+ plumbing focus)

* NY \+ NJ \+ MA sequence (union market nuance, commercial electrical)

* SC \+ NC sequence (growing commercial, mixed trade)

* Each sequence: 7 touches, 15 days, Email \+ Phone \+ LinkedIn

* Bake in: geo marquee account references, dominant local vendors (Rexel, Wesco, Graybar etc.), ERP pain (Vista/COINS), trade-specific field purchasing pain

| Sadie reviews and edits all sequences | DRI: Sadie | 4/28 → 4/30 | Not Started |
| :---- | :---- | :---- | :---: |

* Check tone — SDR voice, not AE voice

* Flag anything too technical or too generic

* Approve final versions

| Load approved sequences into Outreach | DRI: Sadie | 4/30 | Not Started |
| :---- | :---- | :---- | :---: |

* Build sequences in Outreach/Salesloft

* Tag sequences by territory for easy SDR access

* Set sequences to draft — do not activate until pair enablement sessions complete

**PHASE 6  Pair Enablement \+ Pre-Launch QA**

*Week 2 (end)  |  Wed 4/30 – Thu 5/1*

| Communicate final pairings and territory assignments to full team | DRI: Jeremy \+ Sadie | 4/30 | Not Started |
| :---- | :---- | :---- | :---: |

* Jeremy shares AE territory assignments

* Sadie shares final 1:1 pairings

* Share marquee account reference docs per territory (if ready — otherwise share week of 5/5)

* Emphasize: 1:1 pairing means joint accountability, not optional collaboration

| Run pair enablement sessions (all 5 pairs) | DRI: Jeremy \+ Sadie (facilitate) / each pair | 4/30 → 5/1 | Not Started |
| :---- | :---- | :---- | :---: |

* 45-min session per pair — stagger across 4/30 and 5/1

* Walk through territory account list together

* Review marquee accounts — who they are, why they matter, what to say

* AE walks SDR through territory sequence — explains pain language and talk track rationale

* Schedule recurring weekly pod sync on the calendar before leaving the session

* Sequences activate only after pair enablement session is complete

| SFDC \+ sequence final QA | DRI: Vinny \+ Sadie | 4/30 → 5/1 | Not Started |
| :---- | :---- | :---- | :---: |

* Vinny \+ Jared spot-check territory tagging and account ownership

* Sadie sends test emails from each sequence — check formatting and merge fields

* Confirm all sequences tagged correctly by territory

* Sign off — no further bulk changes after this point

| Build marquee ENT account reference docs (non-blocker) | DRI: Jared | 4/24 → 5/1 | Not Started |
| :---- | :---- | :---- | :---: |

* Identify 3–5 marquee ENT Kojo accounts per territory (AI-assisted)

* Document trade focus, project types, dominant local vendors, ERP

* Format as 1-pager per territory for SDR/AE use in pod syncs and outreach

* Not a hard blocker for 5/1 launch — can be distributed week of 5/5 if needed

| Set week 1 accountability structure | DRI: Jared | 4/30 → 5/1 | Not Started |
| :---- | :---- | :---- | :---: |

* All 5 pod syncs on calendar before sequences go live

* First MM pipeline review scheduled: week of 5/5 (Jared \+ Jeremy \+ Vinny \+ Sadie)

* Sadie confirms SDR activity baseline pull for week 1

* AE outbound expectation set: 2 self-sourced touches/week minimum in week 1

## **Week 1 Post-Launch Accountability (5/1–5/8)**

| Action | Owner | When |
| :---- | :---- | :---- |
| All 5 pairing syncs on calendar before sequences go live | Jeremy \+ Sadie | **Before 5/1** |
| Sequences live — SDRs outbounding into Tier 1 territory accounts | Sadie | **5/1** |
| AE self-sourced touches/prospecting begins (2/week minimum) | Jeremy | **5/1** |
| Joint account tiering session per pair — Tier 1 hunt list set together (45 min) | Each pair | **By 5/8** |
| SDR activity baseline pulled by pair (dials, connects, SAOs) | Sadie | **5/8** |
| Marquee ENT account reference docs distributed (if not ready at launch) | Jared | **By 5/8** |
| First MM pipeline review (Jared \+ Jeremy \+ Vinny \+ Sadie) | Jared | **Week of 5/5** |

## 

## 

## **What Good Looks Like — 30 Days Post-Launch (by 5/30)**

* SAO-to-Stage-2 conversion rate improving week-over-week — quality signal that messaging and targeting are working

* Anecdotal evidence on calls that marquee name drops and other context dropping is landing

* Each pair completing at least 1 pod sync per week with documented account updates

* SDRs sequencing exclusively into their territory account list — minimal off-territory activity

* AE self-sourced touches averaging 2+ per week per AE

* Tier 1 accounts have clear next steps logged in SFDC for both AE and SDR

* Zero territory disputes — holdover process resolved all edge cases at launch

* Marquee account reference docs in use — SDRs name-dropping specific FL/TX/CA accounts in outreach

## **What Good Looks Like — 60 Days Post-Launch (by 6/30)**

* SDR outbound SAO volume trending toward 8/week target — measurable lift vs. pre-launch baseline

* All pairs producing SAOs from Tier 1 geo accounts (proximity-to-ENT thesis validating)

* AE self-sourced outbound at 3–4 touches/week — AEs re-engaged because pipeline math is improving

* 1–2 best-performing sequences identified — talk track patterns documented and shared across pairs

* Connect-to-SAO conversion rate up vs. baseline — SDRs reaching right people with right message

* Each pair has at least 1 Tier 1 account in active discovery or pipeline

* Pod sync cadence holding — no pairs have skipped 2+ consecutive weeks

* Inbound routing by territory fully operational — no MM inbound hitting round robin

## **What Good Looks Like — 90 Days Post-Launch (by 7/31)**

* SDR outbound SAOs consistently at or above 8/week — new baseline established

* MM AE attainment trending up vs. Q1 — outbound contribution visible in pipeline mix

* At least 2 pairs have closed or are closing deals sourced from geo territory outbound

* Sequence library updated — all 5 sequences iterated at least once based on real connect and conversion data

* AEs treating pod syncs as a tool, not a chore — SDR is generating enough quality pipeline that AEs are invested

* Referral motion beginning — wins in territory generating warm intros to co-subs and regional contacts

* Clay or equivalent enrichment layered in — jobsite overlap data informing Tier 1 account prioritization

* Decision point: any pairs underperforming after 90 days get restructured — territory reassignment or SDR swap

