// ── Parsed opportunity for CCWR processing ──
export interface CcwrOpp {
  name: string;
  discoveryDate: string;     // "YYYY-MM-DD" calendar date (timezone-stable)
  closeDate: string;         // "YYYY-MM-DD" calendar date (empty if no close date)
  stage: string;
  amount: number;
  recurringArr: number;      // Only meaningful for CW opps
  opportunitySource: string;
  oppSetType: string;
  industry: string;
  owner: string;
  sdrOwner: string;
  manager: string;
  segment: "MM" | "ENT";
}

// ── Monthly cohort row ──
export interface CcwrCohort {
  monthKey: string;          // "2025-01"
  monthLabel: string;        // "Jan-25"
  // Count mode
  totalCount: number;
  cwCount: number;
  clCount: number;
  openCount: number;
  ccwrCount: number;         // 0–1 (cwCount / totalCount)
  // Dollar mode
  totalAmount: number;       // Sum of Amount for all opps
  cwAmount: number;    // Sum of Amount for CW opps
  clAmount: number;          // Sum of Amount for CL opps
  openAmount: number;        // Sum of Amount for open opps
  ccwrDollar: number;        // 0–1 (cwAmount / totalAmount)
  // Maturity
  isMaturing: boolean;
}

// ── Dimension breakdown row ──
export interface CcwrBreakdownRow {
  label: string;
  totalCount: number;
  cwCount: number;
  ccwrCount: number;         // 0–1
  totalAmount: number;
  cwAmount: number;
  ccwrDollar: number;        // 0–1
}

// ── Trailing averages ──
export interface CcwrTrailingAverages {
  t3m: { count: number; dollar: number };   // 0–1
  t6m: { count: number; dollar: number };
  t12m: { count: number; dollar: number };
}

// ── Sales cycle by segment ──
export interface CcwrSalesCycle {
  mmDays: number;
  entDays: number;
  blendedDays: number;
}

// ── Monthly rolling sales cycle (for trend chart) ──
export interface SalesCycleTrendPoint {
  monthKey: string;          // "2025-01"
  monthLabel: string;        // "Jan-25"
  mmDays: number;
  entDays: number;
}

// ── Data quality issue (opp missing a key field) ──
export interface CcwrDataIssue {
  name: string;
  owner: string;
  stage: string;
  issue: string;         // e.g. "Missing Discovery Date"
}

// ── Full page state passed to client ──
export interface CcwrPageData {
  cohorts: CcwrCohort[];
  trailingAverages: CcwrTrailingAverages;
  rawTrailingAverages: CcwrTrailingAverages;  // includes maturing cohorts
  salesCycle: CcwrSalesCycle;
  salesCycleTrend: SalesCycleTrendPoint[];
  allOpps: CcwrOpp[];
  ccwrTarget: number;
  dataSourceLabel: string;
  dataIssues: CcwrDataIssue[];
}
