// ── Raw Call Record (from Coefficient calls tab) ──

export interface RawCallRecord {
  Assigned: string;
  "Call Result": string;
  "Activity Type": string;
  Subject: string;
  Date: string;
  Status: string;
  "Company / Account": string;
  Contact: string;
  "Activity ID (18 Char)": string;
  "Account ID": string;
  "Parent Account ID": string;
  "Account Owner": string;
  "Account Type": string;
  "Parent Account": string;
  "Call Type": string;
  "Task Subtype": string;
  "Primary Contact Title": string;
  "Activity ID": string;
}

// ── Parsed Call ──

export interface ParsedCall {
  sdrName: string;
  callResult: string;
  isConnect: boolean;
  date: Date;
  accountName: string;
  contactName: string;
  accountId: string;
  contactTitle: string;
}

// ── Updated SDR Set Record (with new fields) ──

export interface RawSdrSetRecord {
  "SDR Owner": string;
  "Assigned Account Executive": string;
  "Opportunity Name": string;
  "Created Date": string;
  "Qualification Set Date": string;
  "Qualification Scheduled Date": string;
  Industry: string;
  Amount: string;
  Stage: string;
  "Fiscal Period": string;
  "Sales Rejected Reason": string;
  "Sales Rejected Notes": string;
  "Account Name": string;
  "Account ID": string;
  "Opportunity ID": string;
  "Annual Revenue": string;
  "Account Segment": string;
  "Opp Set Type": string;
}

export interface ParsedSdrSet {
  sdrOwner: string;
  assignedAE: string;
  oppName: string;
  qualSetDate: Date;
  amount: number;
  stage: string;
  industry: string;
  salesRejectedReason: string;
  salesRejectedNotes: string;
  accountName: string;
  accountId: string;
  oppId: string;
  annualRevenue: number;
  accountSegment: string;
  oppSetType: string;
}

// ── North Star Metrics ──

export interface NorthStarVolume {
  saosThisWeek: number;
  saosLastWeek: number;
  fourWeekAvg: number;
  target: number;
}

export interface NorthStarQuality {
  saosAtEvalThisWeek: number;
  saosCreatedThisWeek: number;
  saosAtEvalFourWeekAvg: number;
  saosCreatedFourWeekAvg: number;
  evalConversionPct: number;
  totalSaosInPeriod: number;
}

export interface NorthStarOutcome {
  cwCount90d: number;
  cwRate90d: number;
  cwTarget: number;
  totalSaos90d: number;
}

export interface NorthStarBenchmarks {
  avgWeeklySaos12mo: number;
  evalPct12mo: number;
  cwPct12mo: number;
  evalPctOtherChannels: number;
  dialsPerSao: number;
  totalWeeks: number; // how many weeks of data the 12mo baseline covers
}

export interface NorthStarMetrics {
  benchmarks: NorthStarBenchmarks;
  volume: NorthStarVolume;
  quality: NorthStarQuality;
  outcome: NorthStarOutcome;
}

// ── Activity Metrics (Section 2) ──

export interface ActivityMetricsRow {
  sdrName: string;
  callsMade: number;
  connects: number;
  connectRate: number;
  sets: number;
  setRate: number;
  meetingsHeld: number;
  meetingHoldRate: number;
  saosCreated: number;
  saoRate: number;
}

export interface ActivityMetricsWow {
  callsMade: number;
  connects: number;
  connectRate: number;
  sets: number;
  saosCreated: number;
}

export interface ActivityMetricsState {
  rows: ActivityMetricsRow[];
  teamTotal: ActivityMetricsRow;
  wow: ActivityMetricsWow;
}

// ── Account Targeting (Section 3) ──

export interface TargetingRow {
  sdrName: string;
  uniqueAccountsTouched: number;
  avgContactsPerAccount: number;
  accountsWith1Contact: number;
  accountsWith3PlusContacts: number;
  accountsNoActivity30d: number;
}

export interface TargetingState {
  rows: TargetingRow[];
  teamTotal: TargetingRow;
}

// ── SAO Pipeline (Section 4) ──

export interface SaoAcceptanceRow {
  aeName: string;
  saosReceived: number;
  accepted: number;
  rejected: number;
  acceptanceRate: number;
  pending: number;
}

export interface RejectionLogEntry {
  oppName: string;
  ae: string;
  sdr: string;
  rejectionReason: string;
  notes: string;
}

export interface SaoDetailEntry {
  oppName: string;
  oppId: string;
  ae: string;
  sdr: string;
  amount: number;
  qualSetDate: string; // ISO string
  stage: string;
  status: "Accepted" | "Rejected" | "Pending";
  rejectionReason: string;
}

export interface SaoPipelineState {
  acceptanceSummary: SaoAcceptanceRow[];
  teamTotal: SaoAcceptanceRow;
  detailLog: SaoDetailEntry[];
  rejectionLog: RejectionLogEntry[];
}

// ── SAO Quality (Section 5) ──

export interface AcceptedSaoEntry {
  oppName: string;
  ae: string;
  company: string;
  industry: string;
  entryPointTitle: string;
  amount: number;
}

export interface SaoQualityState {
  acceptedSaos: AcceptedSaoEntry[];
}

// ── Full Page State ──

export interface MmSdrState {
  focusWeekLabel: string;
  focusWeekStart: string;
  focusWeekEnd: string;
  mmRoster: string[];
  northStars: NorthStarMetrics;
  activity: ActivityMetricsState;
  targeting: TargetingState;
  saoPipeline: SaoPipelineState;
  saoQuality: SaoQualityState;
}
