import {
  RawOpportunity,
  Opportunity,
  BacktestRow,
  ScenariosState,
} from "./types";
import { getQuotaForMonth, OPEN_STAGES } from "./config";
import { parseOpp } from "./process-pipeline";
import { QuotaRecord } from "./types-sdr";
import { resolveQuotaForMonth } from "./quota-loader";

function isOpenStage(stage: string): boolean {
  return (OPEN_STAGES as readonly string[]).includes(stage);
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

function monthKey(y: number, m: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

function shortMonthLabel(y: number, m: number): string {
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${names[m]}-${String(y).slice(2)}`;
}

/**
 * Compute the backtest for a given stale threshold and optional segment filter.
 * Exported so the client component can recompute when sliders change.
 */
export function computeBacktest(
  opps: Opportunity[],
  staleThresholdDays: number,
  segmentFilter: "All" | "MidMarket" | "Enterprise" = "All",
  quotaRecords?: QuotaRecord[]
): BacktestRow[] {
  const filtered = segmentFilter === "All"
    ? opps
    : opps.filter((o) => o.segment === (segmentFilter === "MidMarket" ? "MM" : "ENT"));

  const rows: BacktestRow[] = [];

  // Jan 2025 through current month
  const now = new Date();
  const startYear = 2025;
  const startMonth = 0; // January

  for (let y = startYear; y <= now.getFullYear(); y++) {
    const mStart = y === startYear ? startMonth : 0;
    const mEnd = y === now.getFullYear() ? now.getMonth() : 11;

    for (let m = mStart; m <= mEnd; m++) {
      const ms = new Date(y, m, 1);
      const me = new Date(y, m + 1, 0, 23, 59, 59, 999);
      const mk = monthKey(y, m);

      // Open pipeline at month start:
      // Discovery Date < month start AND (Close Date >= month start OR still open)
      const openAtStart = filtered.filter((o) => {
        if (o.discoveryDate >= ms) return false;
        if (isOpenStage(o.stage)) return true;
        if (o.closeDate && o.closeDate >= ms) return true;
        return false;
      });

      const openPipeline = openAtStart.reduce((s, o) => s + o.amount, 0);

      // Fresh pipeline: use Discovery Date age for historical accuracy
      // (Last Activity is a current-state field, not point-in-time)
      const freshAtStart = openAtStart.filter((o) => {
        return daysBetween(o.discoveryDate, ms) <= staleThresholdDays;
      });
      const freshPipeline = freshAtStart.reduce((s, o) => s + o.amount, 0);

      // Closed Won in this month
      const cw = filtered.filter((o) => {
        if (o.stage !== "Closed Won") return false;
        if (!o.closeDate) return false;
        return o.closeDate >= ms && o.closeDate <= me;
      });
      const closedWon = cw.reduce((s, o) => s + o.amount, 0);

      const quota = quotaRecords ? resolveQuotaForMonth(mk, segmentFilter, quotaRecords) : getQuotaForMonth(mk, segmentFilter);

      // Segment splits
      const mmOpen = openAtStart.filter((o) => o.segment === "MM");
      const entOpen = openAtStart.filter((o) => o.segment === "ENT");
      const mmFresh = freshAtStart.filter((o) => o.segment === "MM");
      const entFresh = freshAtStart.filter((o) => o.segment === "ENT");
      const mmCw = cw.filter((o) => o.segment === "MM");
      const entCw = cw.filter((o) => o.segment === "ENT");

      rows.push({
        monthLabel: shortMonthLabel(y, m),
        monthStart: ms,
        openPipeline,
        freshPipeline,
        closedWon,
        impliedMultipleAll: closedWon > 0 ? openPipeline / closedWon : null,
        impliedMultipleFresh: closedWon > 0 ? freshPipeline / closedWon : null,
        quota,
        attainment: quota > 0 ? (closedWon / quota) * 100 : 0,
        mmOpenPipeline: mmOpen.reduce((s, o) => s + o.amount, 0),
        entOpenPipeline: entOpen.reduce((s, o) => s + o.amount, 0),
        mmFreshPipeline: mmFresh.reduce((s, o) => s + o.amount, 0),
        entFreshPipeline: entFresh.reduce((s, o) => s + o.amount, 0),
        mmClosedWon: mmCw.reduce((s, o) => s + o.amount, 0),
        entClosedWon: entCw.reduce((s, o) => s + o.amount, 0),
      });
    }
  }

  return rows;
}

export function processScenarios(rawOpps: RawOpportunity[], quotaRecords?: QuotaRecord[]): ScenariosState {
  const allOpps = rawOpps
    .map(parseOpp)
    .filter((o): o is Opportunity => o !== null);

  const latestDiscoveryDate = allOpps.reduce(
    (max, o) => (o.discoveryDate > max ? o.discoveryDate : max),
    allOpps[0].discoveryDate
  );

  // Default backtest at 90-day stale threshold
  const backtest = computeBacktest(allOpps, 90, "All", quotaRecords);

  return {
    latestDiscoveryDate,
    renderedAt: new Date(),
    backtest,
    allOpps,
  };
}
