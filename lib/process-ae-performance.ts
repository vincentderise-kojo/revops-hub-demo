import type {
  AeOpp,
  AeMatrixRow,
  AeMetricCell,
  AePerformanceState,
  AeDrillDownOpp,
  AeOppTag,
} from "./types-ae-performance";
import type { Opportunity } from "./types";
import type { QuotaRecord } from "./types-sdr";
import { aeSegmentFromManager, AE_PERFORMANCE_CONFIG } from "./config";

export interface SpeedMetricsResult {
  pctWithinSla: number | null;         // null when denominator = 0
  /**
   * Median hours from createdDate → first activity, computed over ALL touched opps
   * (success + failure, not just success). Captures actual cadence including the
   * slow ones — an AE who touched 9/10 opps fast but ghosted 1 should not look
   * good on this metric. Null when no opps have been touched.
   */
  medianHoursToFirstTouch: number | null;
  denominator: number;                 // count of opps included in pctWithinSla
  successOppIds: string[];             // touched within SLA
  failureOppIds: string[];             // outside SLA OR null-activity past SLA window
  excludedOppIds: string[];            // null-activity still inside SLA window (insufficient data)
}

const MS_PER_HOUR = 1000 * 60 * 60;

export function computeSpeedMetrics(
  opps: AeOpp[],
  slaHours: number,
  now: Date
): SpeedMetricsResult {
  const successOppIds: string[] = [];
  const failureOppIds: string[] = [];
  const excludedOppIds: string[] = [];
  const ttfHoursList: number[] = [];

  for (const opp of opps) {
    if (opp.lastActivityDate) {
      // SFDC has no dedicated "first activity" field; LastActivityDate is the
      // proxy. For freshly-created opps this approximates first-touch well; for
      // older opps with multiple activities, it understates true response time.
      // Acceptable v1 trade-off — the rolling 30-day cohort filters most of
      // the long-tail opps out anyway.
      const ttfHours = (opp.lastActivityDate.getTime() - opp.createdDate.getTime()) / MS_PER_HOUR;
      ttfHoursList.push(ttfHours);
      if (ttfHours <= slaHours) {
        successOppIds.push(opp.oppId);
      } else {
        failureOppIds.push(opp.oppId);
      }
    } else {
      const hoursSinceCreation = (now.getTime() - opp.createdDate.getTime()) / MS_PER_HOUR;
      if (hoursSinceCreation > slaHours) {
        failureOppIds.push(opp.oppId);
      } else {
        excludedOppIds.push(opp.oppId);
      }
    }
  }

  const denominator = successOppIds.length + failureOppIds.length;
  const pctWithinSla = denominator === 0 ? null : successOppIds.length / denominator;

  let medianHoursToFirstTouch: number | null = null;
  if (ttfHoursList.length > 0) {
    const sorted = [...ttfHoursList].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianHoursToFirstTouch =
      sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
  }

  return {
    pctWithinSla,
    medianHoursToFirstTouch,
    denominator,
    successOppIds,
    failureOppIds,
    excludedOppIds,
  };
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

export interface StaleResult {
  count: number;
  staleOppIds: string[];
}

/**
 * Stale = stage === "Qualification" AND no Last Activity Date touch in N+ days.
 * Opps with no Last Activity Date are stale only if their createdDate is N+ days ago.
 */
export function computeStaleQualificationOpps(
  opps: AeOpp[],
  staleDaysThreshold: number,
  now: Date
): StaleResult {
  const staleOppIds: string[] = [];

  for (const opp of opps) {
    if (opp.stage !== "Qualification") continue;

    const referenceDate = opp.lastActivityDate ?? opp.createdDate;
    const daysSince = (now.getTime() - referenceDate.getTime()) / MS_PER_DAY;
    if (daysSince >= staleDaysThreshold) {
      staleOppIds.push(opp.oppId);
    }
  }

  return { count: staleOppIds.length, staleOppIds };
}

export interface AdvancedOutResult {
  pctAdvanced: number | null;          // null when denominator = 0
  denominator: number;
  advancedOppIds: string[];            // stage !== "Qualification"
  notAdvancedOppIds: string[];         // still in Qualification past the window
}

/**
 * % of opps created N+ days ago that have advanced past the Qualification stage.
 * Recently-created opps (< N days old) are excluded — they haven't had time to advance.
 */
export function computeAdvancedOutPercent(
  opps: AeOpp[],
  windowDays: number,
  now: Date
): AdvancedOutResult {
  const advancedOppIds: string[] = [];
  const notAdvancedOppIds: string[] = [];

  for (const opp of opps) {
    const ageDays = (now.getTime() - opp.createdDate.getTime()) / MS_PER_DAY;
    if (ageDays < windowDays) continue;

    if (opp.stage === "Qualification") {
      notAdvancedOppIds.push(opp.oppId);
    } else {
      advancedOppIds.push(opp.oppId);
    }
  }

  const denominator = advancedOppIds.length + notAdvancedOppIds.length;
  const pctAdvanced = denominator === 0 ? null : advancedOppIds.length / denominator;

  return { pctAdvanced, denominator, advancedOppIds, notAdvancedOppIds };
}

export interface QualifiedStalenessResult {
  count: number;
  staleOppIds: string[];
  totalOpen: number;                   // denominator for pctStale
  pctStale: number | null;             // null when totalOpen = 0
}

/**
 * Pipeline staleness for opps in Discovery+. "Open" = stage not in closedStages.
 * Stale = no Last Activity Date touch in `staleDaysThreshold`+ days. Never-touched opps
 * are stale relative to their createdDate.
 */
export function computeQualifiedStaleness(
  opps: AeOpp[],
  staleDaysThreshold: number,
  now: Date,
  closedStages: readonly string[]
): QualifiedStalenessResult {
  const staleOppIds: string[] = [];
  let totalOpen = 0;

  for (const opp of opps) {
    if (closedStages.includes(opp.stage)) continue;
    totalOpen++;

    const referenceDate = opp.lastActivityDate ?? opp.createdDate;
    const daysSince = (now.getTime() - referenceDate.getTime()) / MS_PER_DAY;
    if (daysSince >= staleDaysThreshold) {
      staleOppIds.push(opp.oppId);
    }
  }

  const pctStale = totalOpen === 0 ? null : staleOppIds.length / totalOpen;
  return { count: staleOppIds.length, staleOppIds, totalOpen, pctStale };
}

export interface SelfSetMonthlyResult {
  count: number;
  oppIds: string[];
}

/** Counts AE Self-Set opps created in the same calendar month as `now`. */
export function computeSelfSetMonthlyCount(opps: AeOpp[], now: Date): SelfSetMonthlyResult {
  const targetYear = now.getUTCFullYear();
  const targetMonth = now.getUTCMonth();

  const oppIds = opps
    .filter(
      (opp) =>
        opp.source === "AE Self-Set" &&
        opp.createdDate.getUTCFullYear() === targetYear &&
        opp.createdDate.getUTCMonth() === targetMonth
    )
    .map((opp) => opp.oppId);

  return { count: oppIds.length, oppIds };
}

export interface RosterEntry {
  ae: string;
  segment: "MM" | "ENT";
}

/**
 * Derives the active AE roster from the Forecasting Quotas tab — the same
 * source-of-truth used by the SDR Performance tab and Pulse quota loading.
 *
 * Filters:
 *   - active in the given month (`isActive` + month overlap)
 *   - AE forecasting type (NOT including "sdr")
 *   - exclude managers (anyone who appears as `ownerManager` for another AE record)
 *   - resolvable team via `aeSegmentFromManager` — drops orphans
 *
 * This is the right source of truth: an AE on the Hub today is the AE who
 * has an active AE quota right now, not "anyone who has ever owned an opp."
 */
export function buildAeRosterFromQuotas(
  records: readonly QuotaRecord[],
  monthKey: string
): RosterEntry[] {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);

  // Anyone listed as an AE's `ownerManager` is a manager themselves —
  // exclude them from the IC AE roster (matches the SDR processor pattern).
  const aeManagers = new Set(
    records
      .filter((r) => !r.forecastingType.toLowerCase().includes("sdr") && r.ownerManager)
      .map((r) => r.ownerManager)
  );

  const seen = new Map<string, "MM" | "ENT">();
  for (const r of records) {
    if (!r.isActive) continue;
    if (r.forecastingType.toLowerCase().includes("sdr")) continue;
    if (r.startDate > monthEnd || r.endDate < monthStart) continue;
    if (!r.ownerName) continue;
    if (aeManagers.has(r.ownerName)) continue;
    if (seen.has(r.ownerName)) continue;

    const segment = aeSegmentFromManager(r.ownerManager);
    if (segment === null) continue;

    seen.set(r.ownerName, segment);
  }

  return Array.from(seen.entries())
    .map(([ae, segment]) => ({ ae, segment }))
    .sort((a, b) => a.ae.localeCompare(b.ae));
}

/**
 * Maps an Opportunity (from the pipeline tab) into the AeOpp shape used by
 * the AE Performance metrics. Uses the real Created Date (not the discoveryDate
 * proxy) — needed for accurate SLA / TTF / Advanced metrics on opps that have
 * moved past Qualification. parseOpp falls back to discoveryDate if Created Date
 * is missing on legacy rows.
 */
export function opportunityToAeOpp(opp: Opportunity): AeOpp {
  return {
    oppId: opp.oppId,
    name: opp.name,
    owner: opp.owner,
    manager: opp.manager,
    source: opp.source,
    oppSetType: opp.oppSetType,
    stage: opp.stage,
    createdDate: opp.createdDate,
    closeDate: opp.closeDate,
    lastActivityDate: opp.lastActivityDate,
    amount: opp.amount,
    annualRevenue: opp.annualRevenue,
    segment: opp.segment,
    stageDurationDays: opp.stageDurationDays,
  };
}

// ── Color / Format Helpers ──

type ColorBand = "green" | "yellow" | "red" | "neutral";

function colorForSlaPct(pct: number | null): ColorBand {
  if (pct === null) return "neutral";
  if (pct >= AE_PERFORMANCE_CONFIG.slaPctGreen) return "green";
  if (pct >= AE_PERFORMANCE_CONFIG.slaPctYellow) return "yellow";
  return "red";
}

function colorForStaleQualCount(count: number): ColorBand {
  if (count === 0) return "green";
  if (count <= 2) return "yellow";
  return "red";
}

function colorForStaleQualifiedCount(count: number): ColorBand {
  if (count === 0) return "green";
  if (count <= 3) return "yellow";
  return "red";
}

function colorForQualifiedStalePct(pct: number | null): ColorBand {
  if (pct === null) return "neutral";
  if (pct <= AE_PERFORMANCE_CONFIG.qualifiedStalePctGreen) return "green";
  if (pct <= AE_PERFORMANCE_CONFIG.qualifiedStalePctYellow) return "yellow";
  return "red";
}

function colorForSelfSetCount(count: number, target: number): ColorBand {
  if (count >= target) return "green";
  if (count >= target - 1) return "yellow";
  return "red";
}

function formatPct(pct: number | null): string {
  if (pct === null) return "—";
  return `${Math.round(pct * 100)}%`;
}

/** "67% (4/6)" — gives the reader sample-size context so 0% red on a 1-opp denominator isn't confused with 0% red on a 10-opp denominator. */
function formatPctWithDenom(numerator: number, denominator: number): string {
  if (denominator === 0) return "—";
  const pct = numerator / denominator;
  return `${Math.round(pct * 100)}% (${numerator}/${denominator})`;
}

function formatHours(hours: number | null): string {
  if (hours === null) return "—";
  if (hours < 24) return `${hours.toFixed(1)}h`;
  return `${(hours / 24).toFixed(1)}d`;
}

// ── Source-Filter Helpers ──

const ROLLING_WINDOW_MS = AE_PERFORMANCE_CONFIG.cohortRollingDays * MS_PER_DAY;

function inRollingWindow(opp: AeOpp, now: Date): boolean {
  return now.getTime() - opp.createdDate.getTime() <= ROLLING_WINDOW_MS;
}

function filterInbound(opps: AeOpp[], now: Date): AeOpp[] {
  return opps.filter((o) => o.source === "Inbound" && inRollingWindow(o, now));
}

function filterEvent(opps: AeOpp[], now: Date): AeOpp[] {
  return opps.filter((o) => o.source === "Events" && inRollingWindow(o, now));
}

function filterByAe(opps: AeOpp[], ae: string): AeOpp[] {
  return opps.filter((o) => o.owner === ae);
}

// ── Per-AE Row Builders ──

function buildSpeedRow(
  ae: string,
  segment: "MM" | "ENT",
  opps: AeOpp[],
  slaHours: number,
  now: Date,
  section: "inbound" | "event"
): { row: AeMatrixRow; tags: Map<string, AeOppTag[]> } {
  const tags = new Map<string, AeOppTag[]>();
  const aeOpps = filterByAe(opps, ae);

  const speed = computeSpeedMetrics(aeOpps, slaHours, now);
  const stale = computeStaleQualificationOpps(aeOpps, AE_PERFORMANCE_CONFIG.qualificationStaleDays, now);
  const advanced = computeAdvancedOutPercent(aeOpps, AE_PERFORMANCE_CONFIG.advanceOutWindowDays, now);

  const cells: Record<string, AeMetricCell> = {
    oppCount: {
      value: aeOpps.length,
      display: String(aeOpps.length),
      color: "neutral",
      oppIds: aeOpps.map((o) => o.oppId),
    },
    pctWithinSla: {
      value: speed.pctWithinSla,
      display: formatPctWithDenom(speed.successOppIds.length, speed.denominator),
      color: colorForSlaPct(speed.pctWithinSla),
      // Drill to the full SLA denominator (success + failure), so the (M/N) the
      // user sees on the cell matches the count of opps in the drill-down table.
      // Excluded opps (still inside the SLA window) are intentionally NOT in the drill.
      oppIds: [...speed.successOppIds, ...speed.failureOppIds],
    },
    medianTtfHours: {
      value: speed.medianHoursToFirstTouch,
      display: formatHours(speed.medianHoursToFirstTouch),
      color: "neutral",
      oppIds: aeOpps.filter((o) => o.lastActivityDate).map((o) => o.oppId),
    },
    staleCount: {
      value: stale.count,
      display: String(stale.count),
      color: colorForStaleQualCount(stale.count),
      oppIds: stale.staleOppIds,
    },
    pctAdvanced: {
      value: advanced.pctAdvanced,
      display: formatPctWithDenom(advanced.advancedOppIds.length, advanced.denominator),
      color: colorForSlaPct(advanced.pctAdvanced),
      // Drill to the full "eligible" denominator (advanced + not-advanced), matching the (M/N) display.
      oppIds: [...advanced.advancedOppIds, ...advanced.notAdvancedOppIds],
    },
  };

  // Tag every opp into the cells it contributes to (drill-down click-from-cell)
  for (const [metric, cell] of Object.entries(cells)) {
    for (const oppId of cell.oppIds) {
      const existing = tags.get(oppId) ?? [];
      existing.push({ section, ae, metric });
      tags.set(oppId, existing);
    }
  }

  return { row: { ae, segment, metrics: cells }, tags };
}

function buildQualifiedRow(
  ae: string,
  segment: "MM" | "ENT",
  opps: AeOpp[],
  threshold: 7 | 14 | 30,
  now: Date,
  closedStages: readonly string[]
): { row: AeMatrixRow; tags: Map<string, AeOppTag[]> } {
  const tags = new Map<string, AeOppTag[]>();
  const aeOpps = filterByAe(opps, ae);
  const stale = computeQualifiedStaleness(aeOpps, threshold, now, closedStages);

  const openOppIds = aeOpps.filter((o) => !closedStages.includes(o.stage)).map((o) => o.oppId);

  const cells: Record<string, AeMetricCell> = {
    totalOpen: {
      value: stale.totalOpen,
      display: String(stale.totalOpen),
      color: "neutral",
      oppIds: openOppIds,
    },
    staleCount: {
      value: stale.count,
      display: String(stale.count),
      color: colorForStaleQualifiedCount(stale.count),
      oppIds: stale.staleOppIds,
    },
    pctStale: {
      value: stale.pctStale,
      display: formatPctWithDenom(stale.count, stale.totalOpen),
      color: colorForQualifiedStalePct(stale.pctStale),
      // Drill to the full open-pipeline denominator, matching the (M/N) display.
      oppIds: openOppIds,
    },
  };

  // Tag every opp into the cells it contributes to. Mirrors buildSpeedRow's pattern
  // so the inline expansion + drill-down can find them by section. Without this,
  // open-but-not-stale opps would never get a `qualified` tag and would vanish
  // from the per-AE expansion view.
  for (const [metric, cell] of Object.entries(cells)) {
    for (const oppId of cell.oppIds) {
      const existing = tags.get(oppId) ?? [];
      existing.push({ section: "qualified", ae, metric, thresholdDays: threshold });
      tags.set(oppId, existing);
    }
  }

  return { row: { ae, segment, metrics: cells }, tags };
}

function buildSelfSetRow(
  ae: string,
  segment: "MM" | "ENT",
  opps: AeOpp[],
  now: Date
): { row: AeMatrixRow; tags: Map<string, AeOppTag[]> } {
  const tags = new Map<string, AeOppTag[]>();
  const aeOpps = filterByAe(opps, ae);
  const result = computeSelfSetMonthlyCount(aeOpps, now);
  const target = AE_PERFORMANCE_CONFIG.selfSetMonthlyTarget;

  const cells: Record<string, AeMetricCell> = {
    selfSetMtd: {
      value: result.count,
      display: String(result.count),
      color: colorForSelfSetCount(result.count, target),
      oppIds: result.oppIds,
    },
    vsTarget: {
      value: result.count - target,
      display: result.count >= target ? `+${result.count - target}` : String(result.count - target),
      color: colorForSelfSetCount(result.count, target),
      oppIds: result.oppIds,
    },
  };

  for (const oppId of result.oppIds) {
    const existing = tags.get(oppId) ?? [];
    existing.push({ section: "self-set", ae, metric: "selfSetMtd" });
    existing.push({ section: "self-set", ae, metric: "vsTarget" });
    tags.set(oppId, existing);
  }

  return { row: { ae, segment, metrics: cells }, tags };
}

// ── Top-Level State Builder ──

export interface BuildAePerformanceStateInput {
  qualificationOpps: AeOpp[];          // from qualification-data-loader
  pipelineOpps: AeOpp[];               // from pipeline tab via opportunityToAeOpp
  qualificationDataAvailable: boolean;
  quotaRecords: readonly QuotaRecord[]; // active AE roster source of truth (Forecasting Quotas tab)
  now?: Date;                          // injectable for tests; defaults to new Date()
}

export function buildAePerformanceState(input: BuildAePerformanceStateInput): AePerformanceState {
  const now = input.now ?? new Date();
  const allOpps = [...input.qualificationOpps, ...input.pipelineOpps];
  const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const roster = buildAeRosterFromQuotas(input.quotaRecords, monthKey);

  // Section 1 cohort = union of qualification tab + pipeline tab opps for the source,
  // filtered to the rolling 30-day created window. Qualification tab carries the
  // still-stuck opps; pipeline tab carries the ones that already advanced. Without
  // both, the SLA / TTF / Advanced metrics are survivorship-biased — they'd only
  // see the laggards. Dedup by oppId in case the same opp appears in both feeds.
  const dedupBySource = (a: AeOpp[], b: AeOpp[]): AeOpp[] => {
    const seen = new Set<string>();
    const merged: AeOpp[] = [];
    for (const o of [...a, ...b]) {
      if (seen.has(o.oppId)) continue;
      seen.add(o.oppId);
      merged.push(o);
    }
    return merged;
  };
  const section1Pool = dedupBySource(input.qualificationOpps, input.pipelineOpps);
  const inboundOpps = filterInbound(section1Pool, now);
  const eventOpps = filterEvent(section1Pool, now);

  // Aggregate tags across all per-row builders so we can build the drill-down list.
  const allTags = new Map<string, AeOppTag[]>();
  function mergeTags(part: Map<string, AeOppTag[]>) {
    for (const [oppId, tags] of part.entries()) {
      const existing = allTags.get(oppId) ?? [];
      existing.push(...tags);
      allTags.set(oppId, existing);
    }
  }

  const inboundRows: AeMatrixRow[] = [];
  const eventRows: AeMatrixRow[] = [];
  const selfSetRows: AeMatrixRow[] = [];
  const qualifiedRowsByThreshold: Record<7 | 14 | 30, AeMatrixRow[]> = { 7: [], 14: [], 30: [] };

  for (const { ae, segment } of roster) {
    const inb = buildSpeedRow(ae, segment, inboundOpps, AE_PERFORMANCE_CONFIG.inboundSlaHours, now, "inbound");
    inboundRows.push(inb.row);
    mergeTags(inb.tags);

    const evt = buildSpeedRow(ae, segment, eventOpps, AE_PERFORMANCE_CONFIG.eventSlaHours, now, "event");
    eventRows.push(evt.row);
    mergeTags(evt.tags);

    for (const threshold of AE_PERFORMANCE_CONFIG.qualifiedStalePillOptions) {
      const q = buildQualifiedRow(ae, segment, input.pipelineOpps, threshold, now, AE_PERFORMANCE_CONFIG.closedStages);
      qualifiedRowsByThreshold[threshold].push(q.row);
      mergeTags(q.tags);
    }

    const ss = buildSelfSetRow(ae, segment, input.pipelineOpps, now);
    selfSetRows.push(ss.row);
    mergeTags(ss.tags);
  }

  // Build drill-down opp list (every opp tagged anywhere on the page)
  const oppById = new Map<string, AeOpp>();
  for (const opp of allOpps) oppById.set(opp.oppId, opp);

  const drillDownOpps: AeDrillDownOpp[] = [];
  for (const [oppId, tags] of allTags.entries()) {
    const opp = oppById.get(oppId);
    if (!opp || opp.segment === null) continue;
    const daysSince = opp.lastActivityDate
      ? Math.floor((now.getTime() - opp.lastActivityDate.getTime()) / MS_PER_DAY)
      : Math.floor((now.getTime() - opp.createdDate.getTime()) / MS_PER_DAY);
    drillDownOpps.push({
      oppId: opp.oppId,
      name: opp.name,
      ae: opp.owner,
      segment: opp.segment,
      source: opp.source ?? opp.oppSetType ?? "Unknown",
      stage: opp.stage,
      createdDate: opp.createdDate.toISOString(),
      closeDate: opp.closeDate ? opp.closeDate.toISOString() : null,
      lastActivityDate: opp.lastActivityDate ? opp.lastActivityDate.toISOString() : null,
      daysSinceLastActivity: daysSince,
      amount: opp.amount,
      annualRevenue: opp.annualRevenue,
      stageDurationDays: opp.stageDurationDays,
      appearsIn: tags,
    });
  }
  // Sort by days since last activity descending (worst offenders first)
  drillDownOpps.sort((a, b) => (b.daysSinceLastActivity ?? 0) - (a.daysSinceLastActivity ?? 0));

  return {
    inboundRows,
    eventRows,
    qualifiedRowsByThreshold,
    selfSetRows,
    drillDownOpps,
    qualificationDataAvailable: input.qualificationDataAvailable,
    generatedAt: now.toISOString(),
  };
}
