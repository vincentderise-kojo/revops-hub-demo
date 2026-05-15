// ── Raw CW opportunity from Google Sheets ──
export interface RawCwOpportunity {
  "Opportunity Name": string;
  "SDR Owner": string;
  "Created Date": string;
  "Opportunity Source": string;
  "Recurring ARR": string;
  "Accelerated ARR": string;
  "Competitive Vendors": string;
  "Type": string;
  "Annual Revenue": string;
  "Account Segment": string;
  "Amount": string;
  "Opportunity Owner": string;
  "Close Date": string;
  "Opp Set Type": string;
  "Opportunity Owner: Manager": string;
  "Opportunity ID": string;
}

// ── Parsed CW opportunity ──
export interface CwOpportunity {
  name: string;
  sdrOwner: string;
  createdDate: string;       // ISO string
  opportunitySource: string;
  recurringArr: number;
  acceleratedArr: number;
  annualRevenue: number;
  amount: number;
  owner: string;
  manager: string;
  closeDate: string;         // ISO string
  oppSetType: string;
  segment: "MM" | "ENT";
  oppId?: string;            // 18-char SFDC ID — hydrated server-side from pipeline tab when available
  industry?: string;         // hydrated server-side by matching to pipeline tab via oppId
}

// ── Pipeline opp (for win rate + pipeline generated + funnel on revenue page) ──
export interface PipelineOppForRevenue {
  name: string;
  oppId: string;             // 18-char SFDC ID — empty string if missing
  amount: number;
  discoveryDate: string;     // ISO string
  evaluationDate: string;    // ISO string ("" if never reached Evaluation)
  negotiationDate: string;   // ISO string ("" if never reached Contracts/Negotiation)
  closeDate: string;         // ISO string
  stage: string;
  opportunitySource: string;
  oppSetType: string;
  owner: string;
  sdrOwner: string;
  manager: string;
  segment: "MM" | "ENT";
  industry: string;
}

// ── Breakdown row (generic) ──
export interface BreakdownRow {
  label: string;
  count: number;
  arr: number;
  pctOfTotal: number; // 0–100
  pipelineGenerated?: number;
  winRateCohort?: number; // 0–100 — wins ÷ (wins + losses) on opps w/ Discovery Date in period
  winRateClosed?: number; // 0–100 — wins ÷ (wins + losses) on opps w/ Close Date in period
}

// ── Segment breakdown row (with avg deal size) ──
export interface SegmentBreakdownRow extends BreakdownRow {
  avgDealSize: number;
}

// ── Funnel conversion ──
// Canonical stage order for the funnel view. Pre-funnel (Qualification) and
// terminal exits (Closed Lost, Unable to Qualify) are not stages on this chart.
export const FUNNEL_STAGES = ["Discovery", "Evaluation", "Contracts/Negotiation", "Final Approvals", "Closed Won"] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export interface FunnelStageRow {
  stage: FunnelStage;
  reached: number;            // # opps in cohort whose max stage reached ≥ this stage
  conversionFromPrev: number | null;   // % vs the previous stage (null for first stage)
}

export interface FunnelData {
  cohortSize: number;
  rows: FunnelStageRow[];
}

export interface QuarterlyFunnel {
  quarter: string;       // "2025-Q1"
  partial: boolean;      // true if quarter end > today
  funnel: FunnelData;
}

export interface StageConversionPoint {
  quarter: string;
  rate: number | null;        // % (null when prior stage had 0 — undefined conversion)
  reachedFrom: number;        // # opps that reached the prior stage
  reachedTo: number;          // # opps that reached this stage
  partial: boolean;
}

export interface StageConversionSeries {
  fromStage: FunnelStage;
  toStage: FunnelStage;
  label: string;
  color: string;
  points: StageConversionPoint[];
}

export interface StageConversionTrend {
  quarters: string[];
  series: StageConversionSeries[];
}

// ── Channel trend (quarterly CW ARR per parent group) ──
export interface ChannelTrendPoint {
  quarter: string;       // "2025-Q1"
  arr: number;
  count: number;
  partial: boolean;      // true if quarter end > today (latest quarter still in flight)
}

export interface ChannelTrendSeries {
  parentKey: string;     // RevenueGroupKey
  label: string;
  color: string;         // CSS variable
  points: ChannelTrendPoint[];
}

export interface ChannelTrendData {
  quarters: string[];    // ordered axis labels
  series: ChannelTrendSeries[];
  maxArr: number;        // for y-axis scaling
}

// ── Nested origination-channel breakdown ──
// Parent group → Source → Set Type. Set-Type level only appears when a Source
// is fed by more than one Set Type (Inbound is the only one today).
export interface ChannelBreakdownNode {
  key: string;
  label: string;
  level: 0 | 1 | 2;
  count: number;
  arr: number;
  mmArr: number;       // for the per-row MM/ENT mix bar
  entArr: number;
  pctOfTotal: number;
  pipelineGenerated: number;
  winRateClosed: number | undefined;
  winRateCohort: number | undefined;
  children?: ChannelBreakdownNode[];
}

// ── Full page state passed to client ──
export interface RevenuePageData {
  opps: CwOpportunity[];
  dataSourceLabel: string;
}
