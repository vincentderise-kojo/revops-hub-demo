import {
  CcwrOpp,
  CcwrCohort,
  CcwrBreakdownRow,
  CcwrTrailingAverages,
  CcwrSalesCycle,
  CcwrPageData,
  CcwrDataIssue,
  SalesCycleTrendPoint,
} from "./types-ccwr";
import { RawOpportunity } from "./types";
import {
  MANAGER_SEGMENT_MAP,
  ENT_REVENUE_THRESHOLD,
  OPEN_STAGES,
  CCWR_TARGET,
} from "./config";

// ── Helpers ──

function isOpenStage(stage: string): boolean {
  return (OPEN_STAGES as readonly string[]).includes(stage);
}

function monthKey(y: number, m: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

function shortMonthLabel(y: number, m: number): string {
  const names = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  return `${names[m]}-${String(y).slice(2)}`;
}

/**
 * Parse a "M/D/YYYY" or "YYYY-MM-DD..." string into a "YYYY-MM-DD" calendar date.
 * Returns null if the input doesn't match either shape.
 *
 * Calendar-date storage avoids a timezone bug: `new Date("10/1/2025").toISOString()`
 * on a UTC server produces "2025-10-01T00:00:00.000Z", which `new Date(...).getMonth()`
 * on a client west of UTC returns as September. Storing "YYYY-MM-DD" and extracting
 * month/year via string split keeps cohort assignment timezone-stable.
 */
function toYmd(input: string): string | null {
  const trimmed = input.trim();
  // ISO datetime or date — take the date portion
  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  // M/D/YYYY (US-style; what Google Sheets exports)
  const usMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const [, m, d, y] = usMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return null;
}

/** Parse a "YYYY-MM-DD" calendar date as UTC midnight, for whole-day arithmetic. */
function ymdToUtcDate(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/** Last day of a given month, anchored to UTC. */
function lastDayOfMonth(y: number, m: number): Date {
  return new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999));
}

/** Whole-day difference (floor). */
function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

// ── 1. Parse raw opp ──

export function parseCcwrOpp(raw: RawOpportunity): CcwrOpp | null {
  const discoveryDateStr = raw["Discovery Date"];
  if (!discoveryDateStr) return null;

  const discoveryDate = toYmd(discoveryDateStr);
  if (!discoveryDate) return null;

  const amount = parseFloat(raw.Amount) || 0;
  if (amount <= 0) return null;

  const annualRevenue = parseFloat(raw["Annual Revenue"]) || 0;
  const manager = raw["Opportunity Owner: Manager"] || "";

  // Two-gate segmentation
  let segment: "MM" | "ENT" = annualRevenue >= ENT_REVENUE_THRESHOLD ? "ENT" : "MM";
  const managerSegment = MANAGER_SEGMENT_MAP[manager];
  if (managerSegment) {
    segment = managerSegment;
  }

  const recurringArr = parseFloat(raw["Recurring ARR"]) || 0;

  const closeDateStr = raw["Close Date"];
  const closeDate = closeDateStr ? toYmd(closeDateStr) ?? "" : "";

  return {
    name: raw["Opportunity Name"] || "",
    discoveryDate,
    closeDate,
    stage: raw.Stage || "",
    amount,
    recurringArr,
    opportunitySource: raw["Opportunity Source"] || "",
    oppSetType: raw["Opp Set Type"] || "",
    industry: raw.Industry || "",
    owner: raw["Opportunity Owner"] || "",
    sdrOwner: raw["SDR Owner"] || "",
    manager,
    segment,
  };
}

// ── 2. Build cohorts ──

export function buildCohorts(opps: CcwrOpp[]): CcwrCohort[] {
  const now = new Date();
  const startYear = 2025;
  const startMonth = 0; // January

  const cohorts: CcwrCohort[] = [];

  for (let y = startYear; y <= now.getFullYear(); y++) {
    const mStart = y === startYear ? startMonth : 0;
    const mEnd = y === now.getFullYear() ? now.getMonth() : 11;

    for (let m = mStart; m <= mEnd; m++) {
      const mk = monthKey(y, m);
      const ml = shortMonthLabel(y, m);

      // Opps whose Discovery Date falls in this month.
      // Compare via string slice — never round-trip through Date, which would
      // re-introduce the UTC/local boundary bug for "M/1/YYYY" opps.
      const cohortOpps = opps.filter((o) => o.discoveryDate.slice(0, 7) === mk);

      const cwOpps = cohortOpps.filter((o) => o.stage === "Closed Won");
      const clOpps = cohortOpps.filter((o) => o.stage === "Closed Lost");
      const openOpps = cohortOpps.filter((o) => isOpenStage(o.stage));

      // Count mode
      const totalCount = cohortOpps.length;
      const cwCount = cwOpps.length;
      const clCount = clOpps.length;
      const openCount = openOpps.length;
      const ccwrCount = totalCount > 0 ? cwCount / totalCount : 0;

      // Dollar mode: Amount / Amount (same field both sides)
      const totalAmount = cohortOpps.reduce((s, o) => s + o.amount, 0);
      const cwAmount = cwOpps.reduce((s, o) => s + o.amount, 0);
      const clAmount = clOpps.reduce((s, o) => s + o.amount, 0);
      const openAmount = openOpps.reduce((s, o) => s + o.amount, 0);
      const ccwrDollar = totalAmount > 0 ? cwAmount / totalAmount : 0;

      cohorts.push({
        monthKey: mk,
        monthLabel: ml,
        totalCount,
        cwCount,
        clCount,
        openCount,
        ccwrCount,
        totalAmount,
        cwAmount,
        clAmount,
        openAmount,
        ccwrDollar,
        isMaturing: false, // set later by flagMaturing
      });
    }
  }

  return cohorts;
}

// ── 3. Compute sales cycle ──

export function computeSalesCycle(opps: CcwrOpp[]): CcwrSalesCycle {
  const now = new Date();
  const t12mCutoff = new Date(
    Date.UTC(now.getUTCFullYear() - 1, now.getUTCMonth(), now.getUTCDate())
  );

  const cwOpps = opps.filter((o) => {
    if (o.stage !== "Closed Won") return false;
    if (!o.closeDate) return false;
    const cd = ymdToUtcDate(o.closeDate);
    return cd >= t12mCutoff && cd <= now;
  });

  const mmDays: number[] = [];
  const entDays: number[] = [];

  for (const opp of cwOpps) {
    const days = daysBetween(ymdToUtcDate(opp.discoveryDate), ymdToUtcDate(opp.closeDate));
    if (days < 0) continue; // skip bad data
    if (opp.segment === "MM") mmDays.push(days);
    else entDays.push(days);
  }

  const avg = (arr: number[]): number =>
    arr.length > 0 ? arr.reduce((s, v) => s + v, 0) / arr.length : 90;

  const allDays = [...mmDays, ...entDays];

  return {
    mmDays: Math.round(avg(mmDays)),
    entDays: Math.round(avg(entDays)),
    blendedDays: Math.round(avg(allDays)),
  };
}

// ── 3b. Rolling sales cycle trend (T12M as of each month end) ──

export function computeSalesCycleTrend(opps: CcwrOpp[]): SalesCycleTrendPoint[] {
  const cwOpps = opps.filter((o) => o.stage === "Closed Won" && o.closeDate);
  const now = new Date();
  const points: SalesCycleTrendPoint[] = [];
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  for (let y = 2025; y <= now.getFullYear(); y++) {
    const mEnd = y === now.getFullYear() ? now.getMonth() : 11;
    for (let m = 0; m <= mEnd; m++) {
      const asOf = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59, 999)); // last day of month
      const t12mStart = new Date(Date.UTC(y, m - 11, 1)); // 12 months back

      const mmDays: number[] = [];
      const entDays: number[] = [];

      for (const opp of cwOpps) {
        const cd = ymdToUtcDate(opp.closeDate);
        if (cd < t12mStart || cd > asOf) continue;
        const days = daysBetween(ymdToUtcDate(opp.discoveryDate), cd);
        if (days < 0) continue;
        if (opp.segment === "MM") mmDays.push(days);
        else entDays.push(days);
      }

      const avg = (arr: number[]) => arr.length > 0 ? Math.round(arr.reduce((s, v) => s + v, 0) / arr.length) : 0;

      points.push({
        monthKey: monthKey(y, m),
        monthLabel: `${names[m]}-${String(y).slice(2)}`,
        mmDays: avg(mmDays),
        entDays: avg(entDays),
      });
    }
  }

  return points;
}

// ── 4. Flag maturing cohorts ──

export function flagMaturing(
  cohorts: CcwrCohort[],
  salesCycle: CcwrSalesCycle,
  segmentFilter?: "MM" | "ENT"
): CcwrCohort[] {
  const now = new Date();

  // Determine threshold
  let threshold: number;
  if (segmentFilter === "MM") {
    threshold = salesCycle.mmDays;
  } else if (segmentFilter === "ENT") {
    threshold = salesCycle.entDays;
  } else {
    // Conservative: use the higher of MM/ENT
    threshold = Math.max(salesCycle.mmDays, salesCycle.entDays);
  }

  return cohorts.map((c) => {
    // Parse monthKey to get last day of that month
    const [yearStr, monthStr] = c.monthKey.split("-");
    const y = parseInt(yearStr, 10);
    const m = parseInt(monthStr, 10) - 1; // 0-indexed
    const endOfMonth = lastDayOfMonth(y, m);

    const daysSinceEnd = daysBetween(endOfMonth, now);
    const isMaturing = daysSinceEnd < threshold;

    return { ...c, isMaturing };
  });
}

// ── 5. Trailing averages ──

export function computeTrailingAverages(cohorts: CcwrCohort[]): CcwrTrailingAverages {
  // Filter to mature cohorts only, sort newest-first
  const mature = cohorts
    .filter((c) => !c.isMaturing)
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey));

  const computeWeighted = (slice: CcwrCohort[]): { count: number; dollar: number } => {
    if (slice.length === 0) return { count: 0, dollar: 0 };

    const totalCount = slice.reduce((s, c) => s + c.totalCount, 0);
    const cwCount = slice.reduce((s, c) => s + c.cwCount, 0);

    const totalAmount = slice.reduce((s, c) => s + c.totalAmount, 0);
    const cwAmount = slice.reduce((s, c) => s + c.cwAmount, 0);

    return {
      count: totalCount > 0 ? cwCount / totalCount : 0,
      dollar: totalAmount > 0 ? cwAmount / totalAmount : 0,
    };
  };

  return {
    t3m: computeWeighted(mature.slice(0, 3)),
    t6m: computeWeighted(mature.slice(0, 6)),
    t12m: computeWeighted(mature.slice(0, 12)),
  };
}

// ── 5b. Raw trailing averages (includes maturing cohorts) ──

export function computeRawTrailingAverages(cohorts: CcwrCohort[]): CcwrTrailingAverages {
  // All cohorts (no maturity filter), sort newest-first
  const sorted = [...cohorts].sort((a, b) => b.monthKey.localeCompare(a.monthKey));

  const computeWeighted = (slice: CcwrCohort[]): { count: number; dollar: number } => {
    if (slice.length === 0) return { count: 0, dollar: 0 };

    const totalCount = slice.reduce((s, c) => s + c.totalCount, 0);
    const cwCount = slice.reduce((s, c) => s + c.cwCount, 0);

    const totalAmount = slice.reduce((s, c) => s + c.totalAmount, 0);
    const cwAmount = slice.reduce((s, c) => s + c.cwAmount, 0);

    return {
      count: totalCount > 0 ? cwCount / totalCount : 0,
      dollar: totalAmount > 0 ? cwAmount / totalAmount : 0,
    };
  };

  return {
    t3m: computeWeighted(sorted.slice(0, 3)),
    t6m: computeWeighted(sorted.slice(0, 6)),
    t12m: computeWeighted(sorted.slice(0, 12)),
  };
}

// ── 5c. Extract data quality issues ──

export function extractDataIssues(rawOpps: RawOpportunity[]): CcwrDataIssue[] {
  const issues: CcwrDataIssue[] = [];

  for (const raw of rawOpps) {
    const name = raw["Opportunity Name"] || "(unnamed)";
    const owner = raw["Opportunity Owner"] || "";
    const stage = raw.Stage || "";

    if (!raw["Discovery Date"] || isNaN(new Date(raw["Discovery Date"]).getTime())) {
      issues.push({ name, owner, stage, issue: "Missing Discovery Date" });
    } else if (!raw["Opportunity Source"]) {
      issues.push({ name, owner, stage, issue: "Missing Opportunity Source" });
    } else if (!raw.Industry) {
      issues.push({ name, owner, stage, issue: "Missing Industry" });
    } else if (!raw["Opp Set Type"]) {
      issues.push({ name, owner, stage, issue: "Missing Opp Set Type" });
    } else if (!raw.Amount || parseFloat(raw.Amount) <= 0) {
      issues.push({ name, owner, stage, issue: "Missing or zero Amount" });
    }
  }

  return issues;
}

// ── 6. Breakdown by dimension ──

export function computeCcwrBreakdown(
  opps: CcwrOpp[],
  getField: (opp: CcwrOpp) => string
): CcwrBreakdownRow[] {
  const groups = new Map<
    string,
    {
      totalCount: number;
      cwCount: number;
      totalAmount: number;
      cwAmount: number;
    }
  >();

  for (const opp of opps) {
    const key = getField(opp) || "(blank)";
    const current = groups.get(key) || {
      totalCount: 0,
      cwCount: 0,
      totalAmount: 0,
      cwAmount: 0,
    };

    current.totalCount += 1;
    current.totalAmount += opp.amount;

    if (opp.stage === "Closed Won") {
      current.cwCount += 1;
      current.cwAmount += opp.amount;
    }

    groups.set(key, current);
  }

  return [...groups.entries()]
    .map(([label, data]) => ({
      label,
      totalCount: data.totalCount,
      cwCount: data.cwCount,
      ccwrCount: data.totalCount > 0 ? data.cwCount / data.totalCount : 0,
      totalAmount: data.totalAmount,
      cwAmount: data.cwAmount,
      ccwrDollar: data.totalAmount > 0 ? data.cwAmount / data.totalAmount : 0,
    }))
    .sort((a, b) => b.totalCount - a.totalCount);
}

// ── 7. Orchestrator ──

export function processCcwr(rawOpps: RawOpportunity[]): CcwrPageData {
  // Parse all opps
  const allOpps = rawOpps
    .map(parseCcwrOpp)
    .filter((o): o is CcwrOpp => o !== null);

  // Compute sales cycle + trend (needs all opps for T12M CW filter)
  const salesCycle = computeSalesCycle(allOpps);
  const salesCycleTrend = computeSalesCycleTrend(allOpps);

  // Build cohorts → flag maturing → compute trailing averages
  const rawCohorts = buildCohorts(allOpps);
  const cohorts = flagMaturing(rawCohorts, salesCycle);
  const trailingAverages = computeTrailingAverages(cohorts);
  const rawTrailingAverages = computeRawTrailingAverages(cohorts);

  // Data quality
  const dataIssues = extractDataIssues(rawOpps);

  return {
    cohorts,
    trailingAverages,
    rawTrailingAverages,
    salesCycle,
    salesCycleTrend,
    allOpps,
    ccwrTarget: CCWR_TARGET,
    dataSourceLabel: "Google Sheets",
    dataIssues,
  };
}
