Title:   
Leadership deal inspection

Description:   
Deal inspection for sales and ops leaders. Validates a rep's deal through the MEDDPICCCR framework with a skeptical lens, assesses forecast reliability, identifies where the leader should personally intervene, and surfaces coaching opportunities. Use when a leader asks to inspect, pressure-test, or validate a specific deal.

Example Prompt:   
Use the Leadership deal inspection skill to assess this deal

Content:   
\---  
name: leader\_deal\_inspection  
description: Single-deal inspection for sales and ops leaders. Validates a rep's deal through the MEDDPICCCR framework with a skeptical lens, assesses forecast reliability, identifies where the leader should personally intervene, and surfaces coaching opportunities. Use when a leader asks to inspect, pressure-test, or validate a specific deal.  
\---

\# Deal Inspection Skill \-- Leader View

Inspect a single deal through the MEDDPICCCR framework from a leadership perspective. The goal is not to re-do the rep's work but to \*\*validate\*\* it: Is the rep's assessment accurate? Can this deal be counted in the forecast? Where should the leader step in? What coaching does the rep need?

Leaders should be viewing deals through the "lens" of MEDDPICCCR. This skill applies that lens with a healthy dose of skepticism.

\#\# When to Use This Skill

\- Leader asks to inspect, review, or pressure-test a specific deal  
\- Leader asks "can I count on this deal?" or "is this deal real?"  
\- Leader is prepping to discuss a specific deal in a forecast call or 1:1  
\- Leader wants to know if they should personally get involved in a deal  
\- Leader asks to validate a rep's commit or best-case call on a deal

\#\# Guiding Principle: Evidence Over Claims

Throughout this inspection, distinguish between what the \*\*rep claims\*\* and what the \*\*data shows\*\*. A rep may say "the EB is supportive" but if there is no meeting, email, or note with EB involvement, that is an unvalidated claim. Grade based on evidence. Flag gaps between what the rep says and what the data supports.

\#\# Step 1: Gather Deal Context

Collect the full picture on this deal. Pull more context than the rep would typically surface on their own.

\#\#\# Data to pull:

\- \*\*Opportunity details\*\* from the CRM: amount, close date, stage, forecast category, next steps, owner, type, create date, number of times close date has changed  
\- \*\*Account details\*\*: company size, industry, revenue, interaction counts (30-day and 90-day), latest interaction date  
\- \*\*Full engagement timeline\*\*: all meetings (past and upcoming), call transcripts, emails, CRM notes \-- not just recent ones  
\- \*\*All contacts engaged\*\*: titles, roles, seniority, frequency of involvement  
\- \*\*Internal chatter\*\*: Slack/Teams messages, internal notes about this deal  
\- \*\*Deal history\*\*: how long has it been open, what stage progression has looked like, any close date pushes

\#\# Step 2: Deal Snapshot

Before the MEDDPICCCR deep dive, present a quick factual snapshot so the leader has the basics.

| Field | Value |  
|-------|-------|  
| Opportunity Name | |  
| Account | |  
| Rep | |  
| Amount | |  
| Close Date | |  
| Days Until Close | |  
| Stage | |  
| Forecast Category | |  
| Deal Age (days open) | |  
| Close Date Changes | Number of times pushed |  
| Next Step (from CRM) | |  
| Last Interaction | Date and type |  
| Next Scheduled Meeting | Date, or "None" |  
| Contacts Engaged | Count and highest seniority title |

Flag anything that jumps out immediately:  
\- Close date already passed  
\- Close date pushed 2+ times  
\- No interaction in 30+ days  
\- No upcoming meeting on a deal closing within 30 days  
\- Forecast is "Commit" but stage is early  
\- Next step is blank or generic ("follow up")

\#\# Step 3: MEDDPICCCR Evaluation

Grade each dimension Green / Yellow / Red. For each dimension, provide:  
1\. \*\*The grade\*\*  
2\. \*\*Evidence found\*\* (specific data points \-- dates, names, quotes from notes)  
3\. \*\*Evidence missing\*\* (what should exist but doesn't)  
4\. \*\*Validation question\*\* \-- a specific question the leader can ask the rep to pressure-test this dimension

\---

\#\#\# M \-- Metrics (ROI)

\*\*What to validate:\*\* Has the rep built a defensible, prospect-specific ROI case? Has the prospect acknowledged it?

\*\*Evidence to look for:\*\*  
\- ROI inputs captured in notes or transcripts: PO volume, field labor rates, materials spend, percentage of undocumented POs  
\- A calculated ROI number shared with the prospect  
\- Prospect response to the ROI (agreement, pushback, refinement)

\*\*Grade criteria:\*\*  
\- \*\*Green\*\*: ROI calculated with prospect-specific inputs, prospect has validated or engaged with the numbers  
\- \*\*Yellow\*\*: Some ROI discussion but missing key inputs, or ROI shared but no evidence the prospect acknowledged it  
\- \*\*Red\*\*: No ROI quantification found. Deal is being sold on features or "interest."

\*\*Leader validation question:\*\* "Walk me through the ROI you've presented. What specific numbers did the prospect give you, and how did they react?"

\*\*Why this matters to the leader:\*\* A deal without quantified ROI is a deal where the buyer sees you as a nice-to-have. These deals lose to inertia and competing priorities. If the rep can't articulate the ROI on the spot, the prospect certainly can't either.

\---

\#\#\# E \-- Economic Buyer

\*\*What to validate:\*\* Does the rep actually know who the EB is? Is the EB engaged, or is the rep taking someone else's word for it?

\*\*Evidence to look for:\*\*  
\- EB identified by name and title (Owner, President, CFO, COO)  
\- EB appeared in a meeting, email thread, or was referenced in call notes  
\- EB has expressed an opinion on the deal (confirmed ROI, asked about rollout/scale, reframed the value)

\*\*Grade criteria:\*\*  
\- \*\*Green\*\*: EB identified by name, has directly participated in the evaluation (meeting, email, or call), and there is evidence of their engagement (not just "my champion says the CFO is on board")  
\- \*\*Yellow\*\*: EB identified but engagement is indirect \-- the champion reports support but there is no firsthand evidence  
\- \*\*Red\*\*: EB is unknown, or the rep is treating a mid-level contact as the EB without validating authority

\*\*Leader validation question:\*\* "Have you spoken directly with the economic buyer? What did they say matters most to them? If you haven't met them yet, what's your plan to get there?"

\*\*Why this matters to the leader:\*\* If the EB has not been directly engaged, the deal can die at the last mile. A champion saying "my boss is on board" is not the same as the boss being on board. The leader may need to offer an executive-to-executive touchpoint to help the rep earn access.

\---

\#\#\# D \-- Decision Process

\*\*What to validate:\*\* Does the rep know the actual steps between now and a signed contract? Or are they guessing?

\*\*Evidence to look for:\*\*  
\- Documented steps: who evaluates, who signs off, the order of approvals  
\- Timeline tied to contract signature, implementation start, and go-live  
\- Evidence the prospect confirmed the process (not the rep's assumption)  
\- Number of close date pushes (a pattern of pushes suggests the process is not understood)

\*\*Grade criteria:\*\*  
\- \*\*Green\*\*: Decision process documented with specific steps, people, and timeline. Prospect has confirmed this sequence. Close date is anchored to a real milestone.  
\- \*\*Yellow\*\*: Partial process known (e.g., "they need to run it by the board") but missing specifics on who, when, or what order. Close date has been pushed once.  
\- \*\*Red\*\*: No documented decision process. Close date appears arbitrary. Has been pushed 2+ times.

\*\*Leader validation question:\*\* "After this next step, what exactly happens? Who else needs to weigh in, and when does each step happen? How did you arrive at the current close date?"

\*\*Why this matters to the leader:\*\* A deal without a mapped decision process is a deal the rep is hoping on, not managing. Close date pushes are the clearest signal that the rep does not understand or control the process.

\---

\#\#\# D \-- Decision Criteria

\*\*What to validate:\*\* Does the rep understand what the buyer is actually evaluating on? Or are they assuming it is features and price?

\*\*Evidence to look for:\*\*  
\- Discovery questions in transcripts about what matters to the buyer (e.g., "What would make this a bad decision?" "What are you most nervous about?")  
\- Documented criteria from the prospect (ease of adoption, financial control, speed to value, etc.)  
\- Evidence the rep has positioned against those criteria, not just demoed features

\*\*Grade criteria:\*\*  
\- \*\*Green\*\*: Rep has surfaced specific criteria from the prospect and can articulate what matters most. Demo/proposal was tailored to those criteria.  
\- \*\*Yellow\*\*: Rep assumes criteria based on pattern matching or general industry knowledge but has not confirmed with the prospect  
\- \*\*Red\*\*: No evidence of criteria discovery. Deal appears feature-led or demo-driven.

\*\*Leader validation question:\*\* "What are the top three things this buyer cares about in making this decision? How do you know \-- did they tell you, or are you guessing?"

\*\*Why this matters to the leader:\*\* Reps who do not surface criteria end up in bake-offs they lose because they positioned against the wrong things. This is a coachable skill \-- if missing, it is a 1:1 topic.

\---

\#\#\# P \-- Paper Process

\*\*What to validate:\*\* Does the rep know what it takes to get the contract across the finish line?

\*\*Evidence to look for:\*\*  
\- Who signs the agreement (name and title)  
\- Whether legal review is involved (in-house counsel, outside counsel, or just executive review)  
\- Expected turnaround time for contract review  
\- Any known redline risks or procurement requirements

\*\*Grade criteria:\*\*  
\- \*\*Green\*\*: Rep knows who signs, whether legal is involved, and expected timeline. Has asked "What has to be true internally for this to get signed?"  
\- \*\*Yellow\*\*: Rep knows who signs but has not explored legal review or internal mechanics  
\- \*\*Red\*\*: Paper process is unknown. This is especially dangerous for late-stage deals.

\*\*Leader validation question:\*\* "Who is going to sign this? Have they signed software contracts before? Is legal involved, and if so, how long does that usually take?"

\*\*Why this matters to the leader:\*\* Paper process surprises in the final weeks of a quarter are a top cause of slipped deals. If this is a Commit deal and the paper process is unknown, the forecast is at risk.

\---

\#\#\# I \-- Implicated Pain

\*\*What to validate:\*\* Is this deal grounded in real, quantified pain \-- or just interest from a demo?

\*\*Evidence to look for:\*\*  
\- Specific pain points articulated by the prospect in notes or transcripts  
\- Quantified pain (dollar impact, time wasted, risk exposure)  
\- Pain tied to business outcomes (not just "this would be nice")  
\- Consequences of inaction described by the prospect

\*\*Grade criteria:\*\*  
\- \*\*Green\*\*: Multiple pain points documented, at least one quantified, and the prospect has articulated the cost of doing nothing  
\- \*\*Yellow\*\*: Pain discussed qualitatively but not quantified, or pain identified by the rep but not confirmed by the prospect  
\- \*\*Red\*\*: No pain documented. The deal appears to be feature-interest or demo-driven.

\*\*Leader validation question:\*\* "What happens to this prospect if they don't buy? What are they losing today that's driving urgency?"

\*\*Why this matters to the leader:\*\* Deals without quantified pain lose to competing priorities. If the prospect cannot articulate their own pain, they will not fight internally to get the deal done.

\---

\#\#\# C \-- Competition

\*\*What to validate:\*\* Does the rep know who else is in the mix? Is there a competitive strategy, or is the rep flying blind?

\*\*Evidence to look for:\*\*  
\- Competitors mentioned by name in notes, transcripts, or CRM fields  
\- Evidence the rep has positioned differentially (not just "we're better")  
\- Prospect's reaction to competitive positioning

\*\*Grade criteria:\*\*  
\- \*\*Green\*\*: Competitors identified, rep has a differentiated positioning strategy, and the prospect has acknowledged the differentiation  
\- \*\*Yellow\*\*: Rep suspects competition but has not confirmed, or knows the competitor but has no positioning strategy  
\- \*\*Red\*\*: Competition is unknown. The rep has not asked.

\*\*Leader validation question:\*\* "Who else are they looking at? What have you heard from the prospect about how they see the alternatives? What's our angle against \[competitor\]?"

\*\*Why this matters to the leader:\*\* Reps who are unaware of competition get blindsided. If a deal is late-stage and competition is unknown, there may be a competitor the rep has never seen.

\---

\#\#\# C \-- Champion

\*\*What to validate:\*\* Is the rep's "champion" actually a champion \-- or just a friendly contact?

\*\*Evidence to look for:\*\*  
\- Has this person prepped the rep before meetings (gave intel, warned about objections)?  
\- Has this person sold internally on the rep's behalf (introduced to new stakeholders, shared materials)?  
\- Has this person proactively communicated deal status without being asked?  
\- Has the rep tested champion strength? ("If this got pushed or stalled, what would you do?")

\*\*Grade criteria:\*\*  
\- \*\*Green\*\*: Champion is actively advocating internally. Evidence of prep, internal selling, or proactive communication. Passes the champion test with a strong answer.  
\- \*\*Yellow\*\*: Friendly and responsive contact, but no evidence of internal advocacy. Answers calls, attends meetings, but is not pushing the deal forward independently.  
\- \*\*Red\*\*: No champion. The rep's primary contact is an evaluator with no personal stake.

\*\*Leader validation question:\*\* "Who is your champion on this deal? What have they done to help move this forward that you didn't ask them to do? If this deal stalled tomorrow, what would they do about it?"

\*\*Why this matters to the leader:\*\* A weak champion is the single biggest predictor of a deal that stalls or dies silently. The difference between a friendly contact and a true champion is whether they act when the rep is not in the room.

\---

\#\#\# C \-- Compelling Event

\*\*What to validate:\*\* Is there an actual deadline driving urgency, or is the close date wishful thinking?

\*\*Evidence to look for:\*\*  
\- A specific, time-bound business event tied to the deal (project kickoff, budget cycle, new exec starting, ERP migration, growth inflection)  
\- Evidence the prospect has referenced this event as a driver  
\- A mutual success plan that maps backwards from the event to contract signature

\*\*Grade criteria:\*\*  
\- \*\*Green\*\*: Specific compelling event identified, prospect has referenced it, and the deal timeline is anchored to it  
\- \*\*Yellow\*\*: General urgency ("we want to do something this year") but no specific event or deadline  
\- \*\*Red\*\*: No compelling event. The close date appears to be the rep's target, not the prospect's deadline.

\*\*Leader validation question:\*\* "What happens on the prospect's end if this deal doesn't close by \[close date\]? Is there a specific event driving their timeline, or is that our date?"

\*\*Why this matters to the leader:\*\* Deals without compelling events drift. If the close date is not anchored to something real on the prospect's side, it will move. This is the most common reason Commit deals slip.

\---

\#\#\# R \-- Risks

\*\*What to validate:\*\* Has the rep identified what could go wrong, and do they have a plan for it?

\*\*Common risks to check for:\*\*  
| Risk | What to Look For |  
|------|-----------------|  
| No EB access | Is the rep relying on a champion to "handle it"? |  
| Change management fear | Has the prospect expressed concern about field adoption? |  
| Competing priorities | Is the prospect juggling other initiatives? |  
| Loyalty to homegrown tools | Is someone internally attached to the current process? |  
| Sticker shock | Was pricing discussed early with ROI context, or dropped late? |

\*\*Grade criteria:\*\*  
\- \*\*Green\*\*: Risks identified and each has a plan. The rep can articulate what could kill the deal and what they are doing about it.  
\- \*\*Yellow\*\*: Some risks acknowledged but mitigations are vague ("we'll handle it if it comes up")  
\- \*\*Red\*\*: No risk assessment. The rep has not considered what could go wrong.

\*\*Leader validation question:\*\* "What's the most likely reason this deal doesn't close? What are you doing about it?"

\*\*Why this matters to the leader:\*\* A rep who cannot answer "what could kill this deal?" is not managing the deal \-- they are along for the ride.

\#\# Step 4: Present the Inspection Report

\#\#\# Deal Scorecard

| Dimension | Grade | One-Line Assessment |  
|-----------|-------|-------------------|  
| \*\*M\*\* \-- Metrics | | |  
| \*\*E\*\* \-- Economic Buyer | | |  
| \*\*D\*\* \-- Decision Process | | |  
| \*\*D\*\* \-- Decision Criteria | | |  
| \*\*P\*\* \-- Paper Process | | |  
| \*\*I\*\* \-- Implicated Pain | | |  
| \*\*C\*\* \-- Competition | | |  
| \*\*C\*\* \-- Champion | | |  
| \*\*C\*\* \-- Compelling Event | | |  
| \*\*R\*\* \-- Risks | | |

\#\#\# Overall Assessment

Provide a clear verdict:

\- \*\*Greens / Yellows / Reds\*\*: X / Y / Z  
\- \*\*Forecast reliability\*\*: Can this deal be counted in the forecast at the current category? Should it be upgraded, maintained, or downgraded?  
\- \*\*Deal health\*\*: On track, at risk, or in trouble  
\- \*\*Biggest gap\*\*: The single most dangerous weakness in this deal right now

\#\#\# Forecast Recommendation

Be direct:

\- \*\*"This deal is forecast-worthy at Commit"\*\* \-- strong MEDDPICCCR across the board, close date is anchored, execution is on track  
\- \*\*"Downgrade to Best Case"\*\* \-- too many Yellows or a critical Red that has not been addressed (e.g., no EB access on a large deal)  
\- \*\*"Downgrade to Pipeline"\*\* \-- multiple Reds, no compelling event, decision process unclear  
\- \*\*"Remove from forecast"\*\* \-- deal is stalled, no engagement, no champion, close date is fiction

\#\#\# Leader Intervention Playbook

Based on the inspection, recommend where the leader should personally get involved:

\*\*Should the leader step in?\*\* Yes or No, and specifically how:

\- \*\*Executive-to-executive outreach\*\*: If EB access is missing on a large deal, the leader can open the door with a peer-level touchpoint  
\- \*\*Join a call\*\*: If the deal is stuck or the rep is single-threaded, the leader's presence can reset momentum and signal seriousness  
\- \*\*Internal air cover\*\*: If the deal needs resources (SE time, legal fast-track, custom pricing), the leader can clear blockers  
\- \*\*Stay out\*\*: If the deal is well-run, leader involvement can actually hurt. Note when the rep has this handled.

\#\#\# Rep Coaching Takeaways

Identify 1-2 specific coaching points for the rep based on this deal:

\- What MEDDPICCCR dimensions are consistently weak for this rep (based on this deal and pattern if known)?  
\- What specific behavior should the rep change? (e.g., "Start every discovery call by asking about the decision process" or "Don't offer a proposal until the EB is identified")  
\- Is this a skill gap (doesn't know how) or an execution gap (knows but isn't doing it)?

\#\#\# Top 3 Next Actions

List the three most important things that need to happen to advance this deal, in priority order:

1\. \*\*\[Action\]\*\* \-- \[Who should do it: rep or leader\] \-- \[By when\]  
2\. \*\*\[Action\]\*\* \-- \[Who should do it\] \-- \[By when\]  
3\. \*\*\[Action\]\*\* \-- \[Who should do it\] \-- \[By when\]

\#\# Edge Cases

\- \*\*Early-stage deal\*\*: Some dimensions (Paper Process, Competition) may not be fully developed yet. Grade as "Too early to assess" but flag if the close date suggests the deal should be further along. Focus the inspection on Metrics, Pain, Champion, and Decision Criteria \-- the dimensions that should be established early.  
\- \*\*Small deal\*\*: Scale the inspection. A $10K deal does not need the same rigor as a $200K deal. Focus on the 3-4 most impactful dimensions rather than all 10\.  
\- \*\*Renewal or expansion\*\*: Adjust the lens. EB access and Champion are likely already established. Focus on Compelling Event (why expand now?), Metrics (ROI from current usage), and Competition (are they evaluating alternatives?).  
\- \*\*Rep pushback on grades\*\*: If the leader shares this report with the rep, Yellows and Reds should be framed as gaps to close, not criticisms. The goal is to help the rep win the deal.  
