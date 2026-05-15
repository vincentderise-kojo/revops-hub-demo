import { RawCwOpportunity, CwOpportunity, PipelineOppForRevenue, BreakdownRow, SegmentBreakdownRow, ChannelBreakdownNode, ChannelTrendData, ChannelTrendSeries, FunnelData, FunnelStage, FUNNEL_STAGES, StageConversionTrend, StageConversionSeries, QuarterlyFunnel } from "./types-revenue";
import { RawOpportunity } from "./types";
import { MANAGER_SEGMENT_MAP, ENT_REVENUE_THRESHOLD, REVENUE_GROUP_META, REVENUE_GROUP_KEYS, revenueGroupKeyFromSource } from "./config";

// ── Parse raw CW opp into typed record ──
export function parseCwOpp(raw: RawCwOpportunity): CwOpportunity | null {
  const closeDateStr = raw["Close Date"];
  if (!closeDateStr) return null;

  const closeDate = new Date(closeDateStr);
  if (isNaN(closeDate.getTime())) return null;

  const recurringArr = parseFloat(raw["Recurring ARR"]) || 0;
  if (recurringArr <= 0) return null;

  const annualRevenue = parseFloat(raw["Annual Revenue"]) || 0;
  const manager = raw["Opportunity Owner: Manager"] || "";

  // Two-gate segmentation
  let segment: "MM" | "ENT" = annualRevenue >= ENT_REVENUE_THRESHOLD ? "ENT" : "MM";
  const managerSegment = MANAGER_SEGMENT_MAP[manager];
  if (managerSegment) {
    segment = managerSegment;
  }

  const createdDateStr = raw["Created Date"];
  let createdDate = new Date();
  if (createdDateStr) {
    const parsed = new Date(createdDateStr);
    if (!isNaN(parsed.getTime())) createdDate = parsed;
  }

  return {
    name: raw["Opportunity Name"] || "",
    sdrOwner: raw["SDR Owner"] || "",
    createdDate: createdDate.toISOString(),
    opportunitySource: raw["Opportunity Source"] || "",
    recurringArr,
    acceleratedArr: parseFloat(raw["Accelerated ARR"]) || 0,
    annualRevenue,
    amount: parseFloat(raw["Amount"]) || 0,
    owner: raw["Opportunity Owner"] || "",
    manager,
    closeDate: closeDate.toISOString(),
    oppSetType: raw["Opp Set Type"] || "",
    segment,
    oppId: raw["Opportunity ID"] || undefined,
  };
}

// ── Generic breakdown by any string field ──
export function computeBreakdown(
  opps: CwOpportunity[],
  getField: (opp: CwOpportunity) => string
): BreakdownRow[] {
  const totalArr = opps.reduce((s, o) => s + o.recurringArr, 0);
  const groups = new Map<string, { count: number; arr: number }>();

  for (const opp of opps) {
    const key = getField(opp) || "(blank)";
    const current = groups.get(key) || { count: 0, arr: 0 };
    current.count += 1;
    current.arr += opp.recurringArr;
    groups.set(key, current);
  }

  return [...groups.entries()]
    .map(([label, { count, arr }]) => ({
      label,
      count,
      arr,
      pctOfTotal: totalArr > 0 ? (arr / totalArr) * 100 : 0,
    }))
    .sort((a, b) => b.arr - a.arr);
}

// ── Segment breakdown with avg deal size ──
export function computeSegmentBreakdown(opps: CwOpportunity[]): SegmentBreakdownRow[] {
  const totalArr = opps.reduce((s, o) => s + o.recurringArr, 0);
  const segments = new Map<string, { count: number; arr: number }>();

  for (const opp of opps) {
    const current = segments.get(opp.segment) || { count: 0, arr: 0 };
    current.count += 1;
    current.arr += opp.recurringArr;
    segments.set(opp.segment, current);
  }

  // Fixed order: MM first, ENT second
  return ["MM", "ENT"].map((seg) => {
    const data = segments.get(seg) || { count: 0, arr: 0 };
    return {
      label: seg === "MM" ? "MidMarket" : "Enterprise",
      count: data.count,
      arr: data.arr,
      pctOfTotal: totalArr > 0 ? (data.arr / totalArr) * 100 : 0,
      avgDealSize: data.count > 0 ? data.arr / data.count : 0,
    };
  });
}

// ── Parse pipeline opp for revenue page (includes all stages) ──
export function parsePipelineOpp(raw: RawOpportunity): PipelineOppForRevenue | null {
  const discoveryDateStr = raw["Discovery Date"];
  if (!discoveryDateStr) return null;

  const discoveryDate = new Date(discoveryDateStr);
  if (isNaN(discoveryDate.getTime())) return null;

  const amount = parseFloat(raw.Amount) || 0;
  const annualRevenue = parseFloat(raw["Annual Revenue"]) || 0;
  const manager = raw["Opportunity Owner: Manager"] || "";

  let segment: "MM" | "ENT" = annualRevenue >= ENT_REVENUE_THRESHOLD ? "ENT" : "MM";
  const managerSegment = MANAGER_SEGMENT_MAP[manager];
  if (managerSegment) segment = managerSegment;

  const closeDateStr = raw["Close Date"];
  let closeDate = "";
  if (closeDateStr) {
    const parsed = new Date(closeDateStr);
    if (!isNaN(parsed.getTime())) closeDate = parsed.toISOString();
  }

  function parseOptional(s: string | undefined): string {
    if (!s) return "";
    const d = new Date(s);
    return isNaN(d.getTime()) ? "" : d.toISOString();
  }

  return {
    name: raw["Opportunity Name"] || "",
    oppId: raw["Opportunity ID (18 Char)"] || "",
    amount,
    discoveryDate: discoveryDate.toISOString(),
    evaluationDate: parseOptional(raw["Evaluation Date"]),
    negotiationDate: parseOptional(raw["Negotiation Date"]),
    closeDate,
    stage: raw.Stage || "",
    opportunitySource: raw["Opportunity Source"] || "",
    oppSetType: raw["Opp Set Type"] || "",
    owner: raw["Opportunity Owner"] || "",
    sdrOwner: raw["SDR Owner"] || "",
    manager,
    segment,
    industry: raw.Industry || "",
  };
}

// ── Group pipeline opps by dimension and summarize wins/losses/total/amount ──
function groupPipelineByField(
  pipelineOpps: PipelineOppForRevenue[],
  getField: (opp: PipelineOppForRevenue) => string
): Map<string, { won: number; lost: number; total: number; pipelineAmt: number }> {
  const groups = new Map<string, { won: number; lost: number; total: number; pipelineAmt: number }>();
  for (const opp of pipelineOpps) {
    const key = getField(opp) || "(blank)";
    const current = groups.get(key) || { won: 0, lost: 0, total: 0, pipelineAmt: 0 };
    if (opp.stage === "Closed Won") current.won += 1;
    else if (opp.stage === "Closed Lost") current.lost += 1;
    current.total += 1;
    current.pipelineAmt += opp.amount;
    groups.set(key, current);
  }
  return groups;
}

// Resolved win rate — wins ÷ (wins + losses). Used for Win Rate (Closed).
function winRatePct(won: number, lost: number): number | undefined {
  const total = won + lost;
  return total > 0 ? (won / total) * 100 : undefined;
}

// CCWR — wins ÷ total cohort (includes open opps in denominator). Matches /ccwr methodology.
function ccwrPct(won: number, total: number): number | undefined {
  return total > 0 ? (won / total) * 100 : undefined;
}

// ── Enrich breakdown rows with pipeline generated + both win rates ──
// cohortPipeline: filtered by Discovery Date in period (the existing filteredPipeline)
// closedPipeline: filtered by Close Date in period (new)
export function enrichBreakdown(
  rows: BreakdownRow[],
  cohortPipeline: PipelineOppForRevenue[],
  closedPipeline: PipelineOppForRevenue[],
  getField: (opp: PipelineOppForRevenue) => string
): BreakdownRow[] {
  const cohortGroups = groupPipelineByField(cohortPipeline, getField);
  const closedGroups = groupPipelineByField(closedPipeline, getField);

  return rows.map((row) => {
    const cohort = cohortGroups.get(row.label);
    const closed = closedGroups.get(row.label);
    return {
      ...row,
      pipelineGenerated: cohort?.pipelineAmt ?? 0,
      winRateCohort: cohort ? ccwrPct(cohort.won, cohort.total) : undefined,
      winRateClosed: closed ? winRatePct(closed.won, closed.lost) : undefined,
    };
  });
}

// ── Nested origination-channel breakdown ──
// Builds Parent Group → Source → Set Type tree. Set-Type children only appear
// when a Source has >1 Set Type feeding it (Inbound is the only one today).
// Parent + source aggregates are computed from underlying opps (not averaged
// percentages) so win rates roll up correctly.
type Bucket = { won: number; lost: number; total: number; pipelineAmt: number };

function emptyBucket(): Bucket {
  return { won: 0, lost: 0, total: 0, pipelineAmt: 0 };
}

function addToBucket(b: Bucket, opp: PipelineOppForRevenue): void {
  if (opp.stage === "Closed Won") b.won += 1;
  else if (opp.stage === "Closed Lost") b.lost += 1;
  b.total += 1;
  b.pipelineAmt += opp.amount;
}

function mergeBuckets(target: Bucket, source: Bucket): void {
  target.won += source.won;
  target.lost += source.lost;
  target.total += source.total;
  target.pipelineAmt += source.pipelineAmt;
}

export function computeChannelBreakdown(
  cwOpps: CwOpportunity[],
  cohortPipeline: PipelineOppForRevenue[],
  closedPipeline: PipelineOppForRevenue[]
): ChannelBreakdownNode[] {
  const totalArr = cwOpps.reduce((s, o) => s + o.recurringArr, 0);

  // Group by RAW (Opportunity Source, Opp Set Type) — same values the legacy
  // By Source / By Set Type tables render. Totals reconcile exactly.
  // Source determines the parent group via REVENUE_GROUP_META.
  type CwAgg = { count: number; arr: number; mmArr: number; entArr: number };
  const cwBySetType = new Map<string, CwAgg>();
  const cohortBySetType = new Map<string, Bucket>();
  const closedBySetType = new Map<string, Bucket>();

  function emptyCwAgg(): CwAgg {
    return { count: 0, arr: 0, mmArr: 0, entArr: 0 };
  }

  function bucketKey(parentKey: string, source: string, setType: string) {
    return `${parentKey}|${source}|${setType || "(blank)"}`;
  }

  for (const o of cwOpps) {
    const parent = revenueGroupKeyFromSource(o.opportunitySource);
    if (!parent) continue;
    const k = bucketKey(parent, o.opportunitySource, o.oppSetType);
    const agg = cwBySetType.get(k) || emptyCwAgg();
    agg.count += 1;
    agg.arr += o.recurringArr;
    if (o.segment === "MM") agg.mmArr += o.recurringArr;
    else agg.entArr += o.recurringArr;
    cwBySetType.set(k, agg);
  }

  for (const o of cohortPipeline) {
    const parent = revenueGroupKeyFromSource(o.opportunitySource);
    if (!parent) continue;
    const k = bucketKey(parent, o.opportunitySource, o.oppSetType);
    const b = cohortBySetType.get(k) || emptyBucket();
    addToBucket(b, o);
    cohortBySetType.set(k, b);
  }

  for (const o of closedPipeline) {
    const parent = revenueGroupKeyFromSource(o.opportunitySource);
    if (!parent) continue;
    const k = bucketKey(parent, o.opportunitySource, o.oppSetType);
    const b = closedBySetType.get(k) || emptyBucket();
    addToBucket(b, o);
    closedBySetType.set(k, b);
  }

  function makeLeafNode(
    key: string,
    label: string,
    level: 1 | 2,
    cw: CwAgg,
    coh: Bucket,
    cls: Bucket
  ): ChannelBreakdownNode {
    return {
      key,
      label,
      level,
      count: cw.count,
      arr: cw.arr,
      mmArr: cw.mmArr,
      entArr: cw.entArr,
      pctOfTotal: totalArr > 0 ? (cw.arr / totalArr) * 100 : 0,
      pipelineGenerated: coh.pipelineAmt,
      winRateClosed: (cls.won + cls.lost) > 0 ? (cls.won / (cls.won + cls.lost)) * 100 : undefined,
      winRateCohort: coh.total > 0 ? (coh.won / coh.total) * 100 : undefined,
    };
  }

  const parents: ChannelBreakdownNode[] = [];

  for (const parentKey of REVENUE_GROUP_KEYS) {
    const parentMeta = REVENUE_GROUP_META[parentKey];
    const parentCw: CwAgg = emptyCwAgg();
    const parentCohort = emptyBucket();
    const parentClosed = emptyBucket();
    const childNodes: ChannelBreakdownNode[] = [];

    for (const source of parentMeta.sources) {
      // Collect set types that appear under this source across any dataset
      const setTypes = new Set<string>();
      for (const m of [cwBySetType, cohortBySetType, closedBySetType]) {
        for (const k of m.keys()) {
          const [p, s, st] = k.split("|");
          if (p === parentKey && s === source) setTypes.add(st);
        }
      }

      if (setTypes.size === 0) continue; // no data — skip this source entirely

      // Aggregate source-level totals
      const sourceCw: CwAgg = emptyCwAgg();
      const sourceCohort = emptyBucket();
      const sourceClosed = emptyBucket();
      const setTypeNodes: ChannelBreakdownNode[] = [];

      for (const st of setTypes) {
        const k = bucketKey(parentKey, source, st);
        const cw = cwBySetType.get(k) || emptyCwAgg();
        const coh = cohortBySetType.get(k) || emptyBucket();
        const cls = closedBySetType.get(k) || emptyBucket();
        sourceCw.count += cw.count;
        sourceCw.arr += cw.arr;
        sourceCw.mmArr += cw.mmArr;
        sourceCw.entArr += cw.entArr;
        mergeBuckets(sourceCohort, coh);
        mergeBuckets(sourceClosed, cls);
        setTypeNodes.push(makeLeafNode(`${parentKey}|${source}|${st}`, st, 2, cw, coh, cls));
      }

      parentCw.count += sourceCw.count;
      parentCw.arr += sourceCw.arr;
      parentCw.mmArr += sourceCw.mmArr;
      parentCw.entArr += sourceCw.entArr;
      mergeBuckets(parentCohort, sourceCohort);
      mergeBuckets(parentClosed, sourceClosed);

      // Collapse rules:
      //   1. Source name == Parent name → render its set types directly under
      //      the parent (skip the Source layer entirely).
      //   2. Source has only 1 set type → render the Source as a leaf with no
      //      Set Type child (avoids "Source → Set Type" rows where they're
      //      effectively the same thing, e.g. Event → Event).
      //   3. Otherwise → render Source row + Set Type children (Perf Marketing
      //      → Inbound → AE Set / SDR Set; CS Source-Expansion siblings).
      const sourceNameMatchesParent = source.toLowerCase() === parentMeta.displayLabel.toLowerCase();
      if (sourceNameMatchesParent) {
        // Promote set types to the source level so they become direct children of parent
        for (const stNode of setTypeNodes) {
          childNodes.push({ ...stNode, level: 1 });
        }
      } else if (setTypeNodes.length === 1) {
        childNodes.push(makeLeafNode(`${parentKey}|${source}`, source, 1, sourceCw, sourceCohort, sourceClosed));
      } else {
        const sourceNode = makeLeafNode(`${parentKey}|${source}`, source, 1, sourceCw, sourceCohort, sourceClosed);
        sourceNode.children = setTypeNodes.sort((a, b) => b.arr - a.arr);
        childNodes.push(sourceNode);
      }
    }

    parents.push({
      key: parentKey,
      label: parentMeta.displayLabel,
      level: 0,
      count: parentCw.count,
      arr: parentCw.arr,
      mmArr: parentCw.mmArr,
      entArr: parentCw.entArr,
      pctOfTotal: totalArr > 0 ? (parentCw.arr / totalArr) * 100 : 0,
      pipelineGenerated: parentCohort.pipelineAmt,
      winRateClosed: (parentClosed.won + parentClosed.lost) > 0 ? (parentClosed.won / (parentClosed.won + parentClosed.lost)) * 100 : undefined,
      winRateCohort: parentCohort.total > 0 ? (parentCohort.won / parentCohort.total) * 100 : undefined,
      children: childNodes.sort((a, b) => b.arr - a.arr),
    });
  }

  return parents.sort((a, b) => b.arr - a.arr);
}

// ── Funnel conversion ──
// Determine whether an opp reached a given funnel stage.
//
// "Reached" rule per stage:
//   1. Stage-entry date is populated for this stage, OR
//   2. The opp's current Stage is downstream of this stage (because if you're
//      at a later stage, you must have passed through earlier ones).
//
// Why both: Negotiation Date isn't always filled in by reps for fast-moving
// deals, so a Closed Won opp can be missing its Negotiation Date even though
// it definitely passed through Contracts/Negotiation. Without rule 2 the
// funnel goes non-monotonic (e.g. 13 reached Contracts but 21 reached Final
// Approvals — impossible).
//
// Limitation: for Closed Lost / Unable to Qualify, current Stage doesn't
// tell us where the deal died, so we fall back to date-fields only. Closed
// Lost deals that died at Final Approvals (no date field for that stage)
// can't be detected and will undercount — flagged on the chart.
const FUNNEL_STAGE_INDEX: Record<string, number> = {
  "Discovery": 0,
  "Evaluation": 1,
  "Contracts/Negotiation": 2,
  "Final Approvals": 3,
  "Closed Won": 4,
};

function currentStageReaches(currentStage: string, target: FunnelStage): boolean {
  const targetIdx = FUNNEL_STAGE_INDEX[target];
  const currentIdx = FUNNEL_STAGE_INDEX[currentStage];
  if (currentIdx === undefined) return false; // Closed Lost / Unable to Qualify — not in the order
  return currentIdx >= targetIdx;
}

export function reachedStage(opp: PipelineOppForRevenue, stage: FunnelStage): boolean {
  switch (stage) {
    case "Discovery":
      return !!opp.discoveryDate;
    case "Evaluation":
      return !!opp.evaluationDate || currentStageReaches(opp.stage, "Evaluation");
    case "Contracts/Negotiation":
      return !!opp.negotiationDate || currentStageReaches(opp.stage, "Contracts/Negotiation");
    case "Final Approvals":
      return currentStageReaches(opp.stage, "Final Approvals");
    case "Closed Won":
      return opp.stage === "Closed Won";
  }
}

// Returns the highest funnel stage an opp reached, or "Pre-Discovery" if it
// never even hit Discovery. Used by the Funnel Deals table.
export function maxStageReached(opp: PipelineOppForRevenue): FunnelStage | "Pre-Discovery" {
  for (let i = FUNNEL_STAGES.length - 1; i >= 0; i -= 1) {
    if (reachedStage(opp, FUNNEL_STAGES[i])) return FUNNEL_STAGES[i];
  }
  return "Pre-Discovery";
}

export function computeFunnel(opps: PipelineOppForRevenue[]): FunnelData {
  const reached: number[] = FUNNEL_STAGES.map((stage) => opps.filter((o) => reachedStage(o, stage)).length);
  const rows = FUNNEL_STAGES.map((stage, i) => ({
    stage,
    reached: reached[i],
    conversionFromPrev: i === 0 ? null : reached[i - 1] > 0 ? (reached[i] / reached[i - 1]) * 100 : null,
  }));
  return { cohortSize: reached[0], rows };
}

// Quarterly funnel snapshots — one full FunnelData per quarter for the small-
// multiples chart. Reuses computeFunnel against each quarter's cohort so the
// math is identical to the static funnel chart.
export function computeQuarterlyFunnels(opps: PipelineOppForRevenue[]): QuarterlyFunnel[] {
  const byQuarter = new Map<string, PipelineOppForRevenue[]>();
  for (const o of opps) {
    const d = new Date(o.discoveryDate);
    if (isNaN(d.getTime())) continue;
    const q = Math.floor(d.getMonth() / 3) + 1;
    const quarter = `${d.getFullYear()}-Q${q}`;
    const arr = byQuarter.get(quarter) || [];
    arr.push(o);
    byQuarter.set(quarter, arr);
  }

  const now = new Date();
  const startYear = 2025, startQ = 1;
  const endYear = now.getFullYear();
  const endQ = Math.floor(now.getMonth() / 3) + 1;
  const quarters: string[] = [];
  for (let y = startYear; y <= endYear; y += 1) {
    const qStart = y === startYear ? startQ : 1;
    const qEnd = y === endYear ? endQ : 4;
    for (let q = qStart; q <= qEnd; q += 1) quarters.push(`${y}-Q${q}`);
  }

  function quarterEnd(quarter: string): Date {
    const [yStr, qPart] = quarter.split("-Q");
    return new Date(Number(yStr), Number(qPart) * 3, 0, 23, 59, 59, 999);
  }
  const todayMs = now.getTime();

  return quarters.map((quarter) => ({
    quarter,
    partial: quarterEnd(quarter).getTime() > todayMs,
    funnel: computeFunnel(byQuarter.get(quarter) || []),
  }));
}

// Stage-conversion trend: for each quarter cohort (by Discovery Date), compute
// the four adjacent-stage conversion rates and plot one line per transition.
// Each line is colored by its DESTINATION stage so the trend chart matches
// the funnel chart palette (cool at the top → green at the bottom). The
// overall Discovery → Closed Won line uses red because (a) it's the only
// color not already mapped to a stage and (b) it visually flags the
// headline aggregate against the per-stage transitions.
const STAGE_TRANSITION_COLORS: Record<string, string> = {
  "Discovery→Evaluation": "var(--teal)",
  "Evaluation→Contracts/Negotiation": "var(--yellow)",
  "Contracts/Negotiation→Final Approvals": "var(--kojo-yellow)",
  "Final Approvals→Closed Won": "var(--green)",
  "Discovery→Closed Won": "var(--red)",
};

export function computeStageConversionTrend(opps: PipelineOppForRevenue[]): StageConversionTrend {
  // Group opps by quarter (Discovery Date)
  const byQuarter = new Map<string, PipelineOppForRevenue[]>();
  for (const o of opps) {
    const d = new Date(o.discoveryDate);
    if (isNaN(d.getTime())) continue;
    const q = Math.floor(d.getMonth() / 3) + 1;
    const quarter = `${d.getFullYear()}-Q${q}`;
    const arr = byQuarter.get(quarter) || [];
    arr.push(o);
    byQuarter.set(quarter, arr);
  }

  const now = new Date();
  const startYear = 2025, startQ = 1;
  const endYear = now.getFullYear();
  const endQ = Math.floor(now.getMonth() / 3) + 1;
  const quarters: string[] = [];
  for (let y = startYear; y <= endYear; y += 1) {
    const qStart = y === startYear ? startQ : 1;
    const qEnd = y === endYear ? endQ : 4;
    for (let q = qStart; q <= qEnd; q += 1) quarters.push(`${y}-Q${q}`);
  }

  function quarterEnd(quarter: string): Date {
    const [yStr, qPart] = quarter.split("-Q");
    return new Date(Number(yStr), Number(qPart) * 3, 0, 23, 59, 59, 999);
  }
  const todayMs = now.getTime();

  const transitions: Array<[FunnelStage, FunnelStage]> = [
    ["Discovery", "Evaluation"],
    ["Evaluation", "Contracts/Negotiation"],
    ["Contracts/Negotiation", "Final Approvals"],
    ["Final Approvals", "Closed Won"],
    ["Discovery", "Closed Won"],
  ];

  const series: StageConversionSeries[] = transitions.map(([from, to]) => {
    const points = quarters.map((quarter) => {
      const cohort = byQuarter.get(quarter) || [];
      const reachedFrom = cohort.filter((o) => reachedStage(o, from)).length;
      const reachedTo = cohort.filter((o) => reachedStage(o, to)).length;
      const partial = quarterEnd(quarter).getTime() > todayMs;
      return {
        quarter,
        rate: reachedFrom > 0 ? (reachedTo / reachedFrom) * 100 : null,
        reachedFrom,
        reachedTo,
        partial,
      };
    });
    const key = `${from}→${to}`;
    return { fromStage: from, toStage: to, label: key, color: STAGE_TRANSITION_COLORS[key], points };
  });

  return { quarters, series };
}

// ── Channel trend (quarterly CW ARR by parent group) ──
// Always reads the full opp set (caller scopes by segment/dimension filters
// but NOT by period — the trend chart's whole purpose is long-run history).
export function computeChannelTrend(cwOpps: CwOpportunity[]): ChannelTrendData {
  // Bucket by (quarter, parentKey) → { arr, count }
  const buckets = new Map<string, { arr: number; count: number }>();
  const quartersSeen = new Set<string>();

  for (const o of cwOpps) {
    const parent = revenueGroupKeyFromSource(o.opportunitySource);
    if (!parent) continue;
    const d = new Date(o.closeDate);
    if (isNaN(d.getTime())) continue;
    const q = Math.floor(d.getMonth() / 3) + 1;
    const quarter = `${d.getFullYear()}-Q${q}`;
    quartersSeen.add(quarter);
    const k = `${quarter}|${parent}`;
    const cur = buckets.get(k) || { arr: 0, count: 0 };
    cur.arr += o.recurringArr;
    cur.count += 1;
    buckets.set(k, cur);
  }

  // Build the quarter axis from FY2025-Q1 → current quarter (filling gaps)
  const now = new Date();
  const startYear = 2025;
  const startQ = 1;
  const endYear = now.getFullYear();
  const endQ = Math.floor(now.getMonth() / 3) + 1;
  const quarters: string[] = [];
  for (let y = startYear; y <= endYear; y += 1) {
    const qStart = y === startYear ? startQ : 1;
    const qEnd = y === endYear ? endQ : 4;
    for (let q = qStart; q <= qEnd; q += 1) quarters.push(`${y}-Q${q}`);
  }

  function quarterEnd(quarter: string): Date {
    const [yStr, qPart] = quarter.split("-Q");
    const y = Number(yStr);
    const q = Number(qPart);
    return new Date(y, q * 3, 0, 23, 59, 59, 999);
  }
  const todayMs = now.getTime();

  const series: ChannelTrendSeries[] = REVENUE_GROUP_KEYS.map((parentKey) => {
    const meta = REVENUE_GROUP_META[parentKey];
    const points = quarters.map((quarter) => {
      const cell = buckets.get(`${quarter}|${parentKey}`) || { arr: 0, count: 0 };
      return {
        quarter,
        arr: cell.arr,
        count: cell.count,
        partial: quarterEnd(quarter).getTime() > todayMs,
      };
    });
    return { parentKey, label: meta.displayLabel, color: meta.color, points };
  });

  let maxArr = 0;
  for (const s of series) for (const p of s.points) if (p.arr > maxArr) maxArr = p.arr;

  return { quarters, series, maxArr };
}

// ── Enrich segment breakdown ──
export function enrichSegmentBreakdown(
  rows: SegmentBreakdownRow[],
  cohortPipeline: PipelineOppForRevenue[],
  closedPipeline: PipelineOppForRevenue[]
): SegmentBreakdownRow[] {
  const cohortGroups = groupPipelineByField(cohortPipeline, (o) => o.segment);
  const closedGroups = groupPipelineByField(closedPipeline, (o) => o.segment);

  return rows.map((row) => {
    const seg = row.label === "MidMarket" ? "MM" : "ENT";
    const cohort = cohortGroups.get(seg);
    const closed = closedGroups.get(seg);
    return {
      ...row,
      pipelineGenerated: cohort?.pipelineAmt ?? 0,
      winRateCohort: cohort ? ccwrPct(cohort.won, cohort.total) : undefined,
      winRateClosed: closed ? winRatePct(closed.won, closed.lost) : undefined,
    };
  });
}
