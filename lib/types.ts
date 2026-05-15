// Raw opportunity record from SFDC CSV
export interface RawOpportunity {
  "Opportunity Name": string;
  "Opportunity Owner": string;
  "Account Name": string;
  "SDR Owner": string;
  "Opportunity Source": string;
  Amount: string;
  "Created Date": string;       // SFDC Opportunity.CreatedDate — anchors first-touch SLA, regardless of stage
  "Discovery Date": string;
  "Evaluation Date": string;
  "Negotiation Date": string;
  "Close Date": string;
  "Stage Duration": string;     // days the opp has been in its current stage (Coefficient field)
  "Last Stage Change Date": string;
  "Annual Revenue": string;
  "Opportunity Owner: Manager": string;
  "Opp Set Type": string;
  Stage: string;
  "Account Segment": string;
  "Recurring ARR": string;
  "Primary Contact: P Level": string;
  Industry: string;
  "First NB Opp?": string;
  "Account: Last Activity": string;
  "Last Activity": string;
  "Discount Amount": string;
  "Discount Percentage": string;
  "Recurring Discount Percentage": string;
  "Opportunity BPS": string;
  Type: string;
  "Opportunity Record Type": string;
  "Opportunity ID (18 Char)": string;
  "Probability (%)": string;
  "Contract Term (Month)": string;
  "Payment Terms": string;
  "Invoice Frequency": string;
}

// Parsed and enriched opportunity
export interface Opportunity {
  oppId: string;                        // 18-char SFDC ID (for deep links)
  name: string;
  owner: string;
  sdrOwner: string;
  accountName: string;
  amount: number;
  createdDate: Date;                    // SFDC Opportunity.CreatedDate — anchors first-touch SLA, regardless of stage
  discoveryDate: Date;
  closeDate: Date | null;
  stageDurationDays: number;            // days in current stage; 0 if missing/blank
  lastStageChangeDate: Date | null;
  lastActivityDate: Date | null;       // opp-level Last Activity
  accountLastActivityDate: Date | null; // account-level Account: Last Activity
  annualRevenue: number;
  manager: string;
  oppSetType: string;
  stage: string;
  segment: "MM" | "ENT";
  source: SourceLabel;
  industry: string;  // NEW — needed for SAO Quality characteristics
}

// Source labels used in the report
export type SourceLabel =
  | "SDR Outbound"
  | "Inbound"
  | "Events"
  | "6sense/Warmly"
  | "AE Self-Set"
  | "Partner"
  | "Webinar";

// Owner group names
export type OwnerGroup = "Demand Gen" | "Marketing" | "SDR" | "Sales";

// MTD week row
export interface MtdWeekRow {
  weekLabel: string;
  weekStartIso: string;       // ISO date string for this Monday (clipped to month start)
  weekEndIso: string;         // ISO date string for this Sunday (clipped to month end)
  created: number;
  mmCreated: number;
  entCreated: number;
  cumulative: number;
  gapToTarget: number;
  isFocusWeek: boolean;
  isCurrentWeek: boolean;
}

/**
 * Per-owner-group monthly slice. Note: byGroup.ae.totalCreated is AE
 * upside, separate from the board-plan tracker — it does NOT roll into
 * the parent MtdMonth.totalCreated.
 */
export interface MtdGroupBreakdown {
  totalCreated: number;
  monthlyTarget: number;
  weeks: MtdWeekRow[];
}

// MTD month summary
export interface MtdMonth {
  month: string;
  year: number;
  monthlyTarget: number;
  weeks: MtdWeekRow[];
  totalCreated: number;
  pctHit: number;
  gapToTarget: number;
  // Per-owner-group breakdowns. Filled in process-pipeline.ts.
  //
  // Invariants worth knowing:
  //   - sum(byGroup[bdr+field+perf].totalCreated) === MtdMonth.totalCreated
  //     (the parent total excludes AE; byGroup.ae tracks it separately as upside)
  //   - sum(byGroup[bdr+field+perf].monthlyTarget) is ~$24-$76 less than
  //     MtdMonth.monthlyTarget due to small rounding in the source board plan
  //     (totalGoal is board-committed; component fields round independently).
  //     Consumers that need the authoritative board-plan denominator should
  //     prefer MtdMonth.monthlyTarget when the active filter equals {bdr,field,perf}.
  byGroup: Record<import("./config").GroupKey, MtdGroupBreakdown>;
  aeUpsideTarget: number; // AE_TARGET_INDEX × board plan total for this month
}

// Deal list row
export interface DealRow {
  oppId: string;                   // for SFDC deep link
  discoveryDateIso: string;        // ISO string for client-side sorting
  date: string;                    // display format, e.g. "4/7"
  name: string;
  amount: number;
  owner: string;
  sdrOwner: string;
  segment: "MM" | "ENT";
  stage: string;
  source: SourceLabel;
}

// ── Board-plan scoreboard types ──

/** Per-owner-group scoreboard card — used for BDR / Field / Perf. */
export interface GroupScoreCard {
  group: OwnerGroup;            // "SDR" | "Marketing" | "Demand Gen"
  displayLabel: string;         // "BDR Outbound" | "Field Marketing" | "Perf Marketing"
  owner: string;                // "Sadie Rankin", etc.
  color: string;                // CSS variable
  target: number;               // Weekly target (monthly goal / 4.33)
  created: number;              // This week's actual
  gap: number;                  // created - target
  pctHit: number;               // 0-100+
  oppCount: number;             // Number of opps in this owner group this week
  status: "green" | "yellow" | "red";
}

/** AE Self-Set card — actual + 10%-indexed stretch target. Treated as upside
 *  on top of the board plan rather than rolled into it. Same shape signals as
 *  GroupScoreCard so it can render with the same component. */
export interface UpsideCard {
  label: string;                // "AE Self-Set"
  owner: string;                // "Jeremy + Sean"
  created: number;              // This week's AE Self-Set pipeline
  oppCount: number;
  target: number;               // Weekly AE stretch target (10% of board plan / 4.33)
  pctHit: number;               // 0-100+
  status: "green" | "yellow" | "red";
}

/** Blended hero card — excludes AE Self-Set on both sides. */
export interface BlendedScoreCard {
  target: number;               // Current month totalGoal / 4.33
  created: number;              // Week's actual, AE-filtered
  gap: number;
  pctHit: number;
  status: "green" | "yellow" | "red";
  oppCount: number;
}

// ── Pacing (Q2'26 cumulative by owner group) ──

export interface PacingWeek {
  weekIndex: number;            // 1-13 of quarter
  weekLabel: string;            // "Apr 6" style
  weekStart: string;            // ISO date (serialized)
  cumulativeActual: {
    bdr: number;
    field: number;
    perf: number;
    ae: number;                 // AE Self-Set cumulative (no target line)
    total: number;              // bdr + field + perf (board plan only)
  };
  cumulativeTarget: {
    bdr: number;
    field: number;
    perf: number;
    total: number;
  };
  cumulativeOppCount: {         // Cumulative opp count per group (for chart hover)
    bdr: number;
    field: number;
    perf: number;
    ae: number;
    total: number;              // bdr + field + perf (board plan only)
  };
}

export interface QuarterSummary {
  quarterLabel: string;         // "Q2'26"
  quarterGoal: number;          // $7,849,437 for Q2'26
  actualToDate: number;         // Cumulative actual across all 3 board columns
  weeksElapsed: number;
  weeksRemaining: number;
  projectedEnd: number;         // Straight-line projection: actualToDate / weeksElapsed * 13
  paceStatus: "ahead" | "onPace" | "behind";
}

export interface PacingState {
  weeks: PacingWeek[];
  quarterSummary: QuarterSummary;
}

// ── Coverage diagnostic (replaces hidden 5.8× assumption) ──

export interface CoverageDiagnostic {
  impliedByMonth: Record<string, number>;  // { "2026-04": 3.53, ... }
  quotaByMonth: Record<string, number>;    // { "2026-04": 538396, ... } — live AE quota used for the ratio
  impliedQ2Avg: number;                    // Mean across months with goals in the quarter
  historicalBaseline: number;              // 5.8
}

// ── Meta (rollover banner state) ──

export interface DashboardMeta {
  lastLoadedGoalMonth: string | null;       // "2026-06"
  showRolloverBanner: boolean;              // true if within 14d of quarter end + next month has no goal
  nextUnloadedMonthKey: string | null;      // "2026-07" when banner is shown
}

// Full computed dashboard state
export interface DashboardState {
  focusWeekLabel: string;
  focusWeekStart: Date;
  focusWeekEnd: Date;
  latestDiscoveryDate: Date;
  renderedAt: Date;
  scoreboard: {
    blended: BlendedScoreCard;
    groups: {
      bdrOutbound: GroupScoreCard;
      fieldMarketing: GroupScoreCard;
      perfMarketing: GroupScoreCard;
    };
    aeUpside: UpsideCard;
  };
  pacing: PacingState;
  coverageDiagnostic: CoverageDiagnostic;
  meta: DashboardMeta;
  mtd: {
    current: MtdMonth;
    previous: MtdMonth;
  };
  deals: DealRow[];
  execSummary: {
    weekNarrative: string;
    mtdNarrative: string;
    gapNarrative: string;
  };
}

// ── Segment selector & segmented state ──

export type SegmentKey = "all" | "mm" | "ent";

/**
 * Wrapper that pre-computes each segment view server-side so the client
 * can swap instantly on toggle with no recompute.
 * - all: no segment filter (full board plan, all opps)
 * - mm:  opps filtered to segment === "MM"; targets scaled by MM's share of quota
 * - ent: opps filtered to segment === "ENT"; targets scaled by ENT's share of quota
 */
export interface SegmentedDashboardState {
  all: DashboardState;
  mm: DashboardState;
  ent: DashboardState;
}

// ── Coverage View Types ──

export type OpenStage = "Discovery" | "Evaluation" | "Contracts/Negotiation" | "Final Approvals";

export interface CoverageWindowRow {
  label: string;
  openPipeline: number;
  quota: number;
  coverageRatio: number;
  status: "green" | "yellow" | "red";
  oppCount: number;
  mmPipeline: number;
  entPipeline: number;
  mmOppCount: number;
  entOppCount: number;
}

export interface AgingBucket {
  label: string;
  amount: number;
  oppCount: number;
  color: string;
}

export interface SegmentAging {
  segment: "MM" | "ENT";
  total: number;
  oppCount: number;
  fresh: AgingBucket;
  aging: AgingBucket;
  stale: AgingBucket;
  threshold: number;
  freshVsThreshold: number; // fresh.amount / threshold
}

export interface StageBreakdown {
  stage: OpenStage;
  amount: number;
  oppCount: number;
  pctOfTotal: number;
}

export interface CoverageDeal {
  name: string;
  amount: number;
  owner: string;
  stage: string;
  closeDate: string;
  inactiveDays: number | null;
  segment: "MM" | "ENT";
  // Drill-in fields
  accountName: string;
  annualRevenue: number;
  discoveryDate: string;
  ownerFull: string;
}

export interface CloseDateHealth {
  pastDueCount: number;
  pastDueAmount: number;
  thisMonthByStage: StageBreakdown[];
  discoveryClosingSoon: number; // count of Discovery opps with close < 30 days
  discoveryClosingSoonAmount: number;
}

export interface MojoWeekRow {
  weekLabel: string;
  weekEnd: Date;
  newCreated: number;
  newCreatedCount: number;
  closedWon: number;
  closedWonCount: number;
  closedLost: number;
  closedLostCount: number;
  wentStale: number | null; // null for historical weeks (V1)
  wentStaleCount: number | null;
  totalIn: number;
  totalInCount: number;
  totalOut: number;
  totalOutCount: number;
  netChange: number;
  freshTotal: number;
}

export interface CoverageState {
  asOfDate: string;
  latestDiscoveryDate: Date;
  renderedAt: Date;
  windows: CoverageWindowRow[];
  aging: {
    mm: SegmentAging;
    ent: SegmentAging;
  };
  stageComposition: StageBreakdown[];
  topDeals: CoverageDeal[];
  closeDateHealth: CloseDateHealth;
  allOpps: Opportunity[];
}

// ── Scenarios View Types ──

export interface BacktestRow {
  monthLabel: string;       // "Jan-25", "Feb-25", etc.
  monthStart: Date;
  openPipeline: number;
  freshPipeline: number;
  closedWon: number;
  impliedMultipleAll: number | null;   // null if CW = 0
  impliedMultipleFresh: number | null;
  quota: number;
  attainment: number;       // CW / quota as pct
  mmOpenPipeline: number;
  entOpenPipeline: number;
  mmFreshPipeline: number;
  entFreshPipeline: number;
  mmClosedWon: number;
  entClosedWon: number;
}

export interface ScenarioSummary {
  currentFreshPipeline: number;
  coverageRatio: number;
  status: "green" | "yellow" | "red";
  weeklyCreationNeeded: number;
  monthlyQuota: number;
  blendedWinRate: number;
}

export interface ScenariosState {
  latestDiscoveryDate: Date;
  renderedAt: Date;
  backtest: BacktestRow[];       // one per month, Jan-25 through current
  allOpps: Opportunity[];        // full parsed set for client-side recomputation
}

// ── Deal Insight Panel Types ──

export interface DealInsightRequest {
  oppId?: string;                  // SFDC 18-char ID — when present, panel looks up Endgame inspection by oppId
  oppName: string;
  accountName: string;
  owner: string;
  amount: number;
  stage: string;
  closeDate: string;
  discoveryDate: string;
  inactiveDays: number | null;
  segment: "MM" | "ENT";
  annualRevenue: number;
}

// ── Endgame Inspection (Pulse new-this-week cache) ──

export type InspectionGrade = "red" | "yellow" | "green";

export interface InspectionDimGrade {
  grade: InspectionGrade;
  level: 1 | 2 | 3 | 4;
}

export interface InspectionEngagement {
  meetings: number;
  incomingEmails: number;
  slackMentions: number;
  windowDays: number;
}

export interface InspectionLatestSignal {
  date: string;
  speaker: string;
  quote: string;
}

export interface EndgameInspection {
  oppId: string;
  oppName: string;
  accountName: string;
  amount: number;
  stage: string;
  discoveryDate: string;
  owner: string;
  grades: {
    champion: InspectionDimGrade;
    economicBuyer: InspectionDimGrade;
    compellingEvent: InspectionDimGrade;
    decisionProcess: InspectionDimGrade;
  };
  engagement: InspectionEngagement;
  latestSignal: InspectionLatestSignal;
  twoThings: string[];
  coachTheRep: string[];
  forecastRead: "Pipeline" | "Best Case" | "Commit" | "Remove";
}

export interface InspectionCache {
  generatedAt: string;
  source: string;
  note: string;
  priorityRule?: string;
  inspections: Record<string, EndgameInspection>;
}

export interface SlackMessage {
  author: string;
  date: string;
  channel: string;
  text: string;
}

export interface DealForecast {
  confidence: number;
  label: "Strong" | "On Track" | "At Risk" | "Unlikely";
  narrative: string;
}

export interface DealInsightResponse {
  slackMessages: SlackMessage[];
  forecast: DealForecast;
}
