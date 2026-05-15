import {
  RawOpportunity,
  Opportunity,
  SourceLabel,
  DashboardState,
  SegmentedDashboardState,
  MtdWeekRow,
  MtdMonth,
  MtdGroupBreakdown,
  DealRow,
} from "./types";
import type {
  BlendedScoreCard,
  GroupScoreCard,
  UpsideCard,
  PacingState,
  PacingWeek,
  QuarterSummary,
  CoverageDiagnostic,
  DashboardMeta,
  OwnerGroup,
} from "./types";
import {
  OPP_SET_TYPE_MAP,
  MANAGER_SEGMENT_MAP,
  ENT_REVENUE_THRESHOLD,
  COVERAGE_MULTIPLE,
  WEEKS_PER_MONTH,
  OWNER_GROUPS,
  getMonthlyPipelineGoal,
  getMonthlyCreationTarget,
  getWeeklyGoalByGroup,
  getImpliedCoverage,
  getLastLoadedGoalMonth,
  MONTHLY_PIPELINE_GOALS,
  groupKeyFromSource,
  GROUP_KEYS,
  GROUP_META,
  getAeMonthlyTarget,
  getAeWeeklyTarget,
  type GroupKey,
} from "./config";
import { QuotaRecord } from "./types-sdr";
import { buildMonthlyQuotaFromRecords } from "./quota-loader";

// ── Step 1: Parse raw opp into enriched Opportunity ──
export function parseOpp(raw: RawOpportunity): Opportunity | null {
  const discoveryDateStr = raw["Discovery Date"];
  if (!discoveryDateStr) return null;

  const discoveryDate = new Date(discoveryDateStr);
  if (isNaN(discoveryDate.getTime())) return null;

  // Created Date — anchors first-touch SLA. Falls back to Discovery Date for
  // backwards-compat if the column is missing/blank on legacy data.
  const createdDateStr = raw["Created Date"];
  let createdDate = discoveryDate;
  if (createdDateStr) {
    const parsed = new Date(createdDateStr);
    if (!isNaN(parsed.getTime())) createdDate = parsed;
  }

  const amount = parseFloat(raw.Amount) || 0;
  const annualRevenue = parseFloat(raw["Annual Revenue"]) || 0;
  const manager = raw["Opportunity Owner: Manager"] || "";
  const oppSetType = raw["Opp Set Type"] || "";

  // Source mapping
  const source = OPP_SET_TYPE_MAP[oppSetType];
  if (!source) return null;

  // Two-gate segmentation
  let segment: "MM" | "ENT" = annualRevenue >= ENT_REVENUE_THRESHOLD ? "ENT" : "MM";

  // Manager override (gate 2 wins on conflict)
  const managerSegment = MANAGER_SEGMENT_MAP[manager];
  if (managerSegment) {
    segment = managerSegment;
  }

  // Opp-level last activity
  const oppLastActivityStr = raw["Last Activity"];
  let lastActivityDate: Date | null = null;
  if (oppLastActivityStr) {
    const parsed = new Date(oppLastActivityStr);
    if (!isNaN(parsed.getTime())) lastActivityDate = parsed;
  }

  // Account-level last activity
  const acctLastActivityStr = raw["Account: Last Activity"];
  let accountLastActivityDate: Date | null = null;
  if (acctLastActivityStr) {
    const parsed = new Date(acctLastActivityStr);
    if (!isNaN(parsed.getTime())) accountLastActivityDate = parsed;
  }

  return {
    oppId: raw["Opportunity ID (18 Char)"] || "",
    name: raw["Opportunity Name"],
    owner: raw["Opportunity Owner"],
    sdrOwner: raw["SDR Owner"] || "",
    accountName: raw["Account Name"],
    amount,
    createdDate,
    discoveryDate,
    closeDate: raw["Close Date"] ? new Date(raw["Close Date"]) : null,
    stageDurationDays: parseFloat(raw["Stage Duration"]) || 0,
    lastStageChangeDate: raw["Last Stage Change Date"] ? new Date(raw["Last Stage Change Date"]) : null,
    lastActivityDate,
    accountLastActivityDate,
    annualRevenue,
    manager,
    oppSetType,
    stage: raw.Stage,
    segment,
    source,
    industry: raw.Industry || "",
  };
}

// ── Step 2: Determine focus week (most recent complete Mon–Sun) ──
function getFocusWeek(
  opps: Opportunity[],
  overrideDate?: Date
): { start: Date; end: Date } {
  // If override provided, treat it as the Monday of the desired week
  if (overrideDate) {
    const start = new Date(overrideDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }

  // Use today's date to determine the focus week — the calendar knows
  // whether a week is complete, not the data. The latest Discovery Date
  // is used for the "Data through" label, not focus week selection.
  const ref = new Date();
  const day = ref.getDay(); // 0=Sun, 1=Mon, ...

  // If ref is a Sunday, the completed week ended the previous Sunday
  // (because that Sunday's week isn't fully "past" yet — we want the
  // most recent *complete* Mon–Sun). If ref is Mon–Sat, the last
  // complete week ended on the most recent past Sunday.
  let endSunday: Date;
  if (day === 0) {
    // ref is Sunday — last *complete* week ended the prior Sunday
    endSunday = new Date(ref);
    endSunday.setDate(ref.getDate() - 7);
  } else {
    // Most recent Sunday before ref
    endSunday = new Date(ref);
    endSunday.setDate(ref.getDate() - day);
  }
  endSunday.setHours(23, 59, 59, 999);

  const startMonday = new Date(endSunday);
  startMonday.setDate(endSunday.getDate() - 6);
  startMonday.setHours(0, 0, 0, 0);

  return { start: startMonday, end: endSunday };
}

// ── Helper: filter opps in a date range ──
function oppsInRange(opps: Opportunity[], start: Date, end: Date): Opportunity[] {
  return opps.filter((o) => {
    const d = o.discoveryDate;
    return d >= start && d <= end;
  });
}

// ── Helper: get Monday of the week for a date ──
export function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

// ── Helper: format currency ──
function fmtK(n: number): string {
  if (Math.abs(n) >= 1_000_000) {
    return `$${(n / 1_000_000).toFixed(1)}M`;
  }
  return `$${Math.round(n / 1000)}K`;
}

// ── Board-plan helper: status from pct ──
function statusFromPct(pctHit: number): "green" | "yellow" | "red" {
  if (pctHit >= 95) return "green";
  if (pctHit >= 70) return "yellow";
  return "red";
}

// ── Board-plan helper: map source → owner group ──
function ownerGroupFromSource(source: SourceLabel): OwnerGroup {
  for (const g of OWNER_GROUPS) {
    if (g.sources.includes(source)) return g.group;
  }
  return "Sales"; // safe default
}

// ── Board-plan helper: blended + group cards + AE upside ──
function buildBlendedAndGroupCards(
  focusWeekOpps: Opportunity[],
  monthKey: string,
  segmentRatio: number = 1
): {
  blended: BlendedScoreCard;
  groups: { bdrOutbound: GroupScoreCard; fieldMarketing: GroupScoreCard; perfMarketing: GroupScoreCard };
  aeUpside: UpsideCard;
} {
  const boardOpps = focusWeekOpps.filter((o) => ownerGroupFromSource(o.source) !== "Sales");
  const aeOpps = focusWeekOpps.filter((o) => ownerGroupFromSource(o.source) === "Sales");

  const blendedCreated = boardOpps.reduce((s, o) => s + o.amount, 0);
  const goal = getMonthlyPipelineGoal(monthKey);
  const blendedTarget = (goal ? goal.totalGoal / WEEKS_PER_MONTH : 0) * segmentRatio;
  const blendedPctHit = blendedTarget > 0 ? (blendedCreated / blendedTarget) * 100 : 0;

  const blended: BlendedScoreCard = {
    target: blendedTarget,
    created: blendedCreated,
    gap: blendedCreated - blendedTarget,
    pctHit: blendedPctHit,
    status: statusFromPct(blendedPctHit),
    oppCount: boardOpps.length,
  };

  const makeGroupCard = (
    group: OwnerGroup,
    displayLabel: string,
    owner: string,
    color: string
  ): GroupScoreCard => {
    const groupOpps = boardOpps.filter((o) => ownerGroupFromSource(o.source) === group);
    const created = groupOpps.reduce((s, o) => s + o.amount, 0);
    const target = getWeeklyGoalByGroup(monthKey, group) * segmentRatio;
    const pctHit = target > 0 ? (created / target) * 100 : 0;
    return {
      group,
      displayLabel,
      owner,
      color,
      target,
      created,
      gap: created - target,
      pctHit,
      oppCount: groupOpps.length,
      status: statusFromPct(pctHit),
    };
  };

  const groups = {
    bdrOutbound: makeGroupCard("SDR", "BDR Outbound", "Sadie Rankin", "var(--green)"),
    fieldMarketing: makeGroupCard("Marketing", "Field Marketing", "Alex Harmon", "var(--blue)"),
    perfMarketing: makeGroupCard("Demand Gen", "Perf Marketing", "Ali Karshenas", "var(--yellow)"),
  };

  const aeWeeklyTarget = getAeWeeklyTarget(monthKey) * segmentRatio;
  const aeCreated = aeOpps.reduce((s, o) => s + o.amount, 0);
  const aePctHit = aeWeeklyTarget > 0 ? (aeCreated / aeWeeklyTarget) * 100 : 0;
  const aeUpside: UpsideCard = {
    label: "AE Self-Set",
    owner: "Jeremy + Sean",
    created: aeCreated,
    oppCount: aeOpps.length,
    target: aeWeeklyTarget,
    pctHit: aePctHit,
    status: statusFromPct(aePctHit),
  };

  return { blended, groups, aeUpside };
}

// ── Board-plan helper: quarterly pacing state ──
function buildPacingState(
  allOpps: Opportunity[],
  quarterStart: Date,
  today: Date,
  segmentRatioFn: (monthKey: string) => number = () => 1
): PacingState {
  const weeks: PacingWeek[] = [];
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  // Monday of the week containing quarterStart
  const firstMonday = new Date(quarterStart);
  const day = firstMonday.getDay();
  const daysToMonday = day === 0 ? -6 : 1 - day;
  firstMonday.setDate(firstMonday.getDate() + daysToMonday);
  firstMonday.setHours(0, 0, 0, 0);

  const cumActual = { bdr: 0, field: 0, perf: 0, ae: 0, total: 0 };
  const cumTarget = { bdr: 0, field: 0, perf: 0, total: 0 };
  const cumOppCount = { bdr: 0, field: 0, perf: 0, ae: 0, total: 0 };

  // Pre-pass: count how many of the 13 pacing weeks resolve to each month (via
  // Thursday midpoint). Used as the divisor so per-week targets accumulate
  // EXACTLY to each month's monthly goal — avoids the rounding error from
  // using a flat 4.33-weeks-per-month divisor when the actual distribution is
  // 5 + 4 + 4 across Apr / May / Jun.
  const weeksPerMonth: Record<string, number> = {};
  for (let w = 1; w <= 13; w++) {
    const ws = new Date(firstMonday.getTime() + (w - 1) * weekMs);
    const mid = new Date(ws.getTime() + 3 * 86_400_000);
    const mk = `${mid.getFullYear()}-${String(mid.getMonth() + 1).padStart(2, "0")}`;
    weeksPerMonth[mk] = (weeksPerMonth[mk] ?? 0) + 1;
  }

  for (let w = 1; w <= 13; w++) {
    const weekStart = new Date(firstMonday.getTime() + (w - 1) * weekMs);
    const weekEnd = new Date(weekStart.getTime() + weekMs - 1);
    const weekOpps = allOpps.filter(
      (o) => o.discoveryDate >= weekStart && o.discoveryDate <= weekEnd &&
             o.discoveryDate >= quarterStart // clip to actual quarter boundary — don't count Q1 opps in week 1
    );
    // Resolve month from the week's midpoint (Thursday), not its Monday.
    const weekMidpoint = new Date(weekStart.getTime() + 3 * 86_400_000);
    const mk = `${weekMidpoint.getFullYear()}-${String(weekMidpoint.getMonth() + 1).padStart(2, "0")}`;

    const ratio = segmentRatioFn(mk);
    const goal = getMonthlyPipelineGoal(mk);
    const weeksInMk = weeksPerMonth[mk] ?? 1;
    // Per-week target = (monthly goal for this group) / (actual weeks resolving
    // to this month in the quarter), then scaled by segment ratio. Summed over
    // the month's weeks, cumulative target equals the monthly goal exactly.
    const bdrWeekly = goal ? (goal.bdrOutbound / weeksInMk) * ratio : 0;
    const fieldWeekly = goal ? (goal.fieldMarketing / weeksInMk) * ratio : 0;
    const perfWeekly = goal ? (goal.perfMarketing / weeksInMk) * ratio : 0;
    cumTarget.bdr += bdrWeekly;
    cumTarget.field += fieldWeekly;
    cumTarget.perf += perfWeekly;
    cumTarget.total = cumTarget.bdr + cumTarget.field + cumTarget.perf;

    for (const o of weekOpps) {
      const g = ownerGroupFromSource(o.source);
      if (g === "SDR") { cumActual.bdr += o.amount; cumOppCount.bdr += 1; }
      else if (g === "Marketing") { cumActual.field += o.amount; cumOppCount.field += 1; }
      else if (g === "Demand Gen") { cumActual.perf += o.amount; cumOppCount.perf += 1; }
      else if (g === "Sales") { cumActual.ae += o.amount; cumOppCount.ae += 1; }
    }
    cumActual.total = cumActual.bdr + cumActual.field + cumActual.perf;
    cumOppCount.total = cumOppCount.bdr + cumOppCount.field + cumOppCount.perf;

    weeks.push({
      weekIndex: w,
      weekLabel: weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      weekStart: weekStart.toISOString(),
      cumulativeActual: { ...cumActual },
      cumulativeTarget: { ...cumTarget },
      cumulativeOppCount: { ...cumOppCount },
    });
  }

  const weeksElapsed = weeks.filter((w) => new Date(w.weekStart) <= today).length;
  const weeksRemaining = 13 - weeksElapsed;
  const finalWeek = weeks[12];
  const quarterGoal = finalWeek.cumulativeTarget.total;
  const actualToDate = weeksElapsed > 0 ? weeks[weeksElapsed - 1].cumulativeActual.total : 0;
  const projectedEnd = weeksElapsed > 0 ? (actualToDate / weeksElapsed) * 13 : 0;
  const expectedByNow = weeksElapsed > 0 ? weeks[weeksElapsed - 1].cumulativeTarget.total : 0;
  const paceStatus: "ahead" | "onPace" | "behind" =
    actualToDate >= expectedByNow * 1.02 ? "ahead" :
    actualToDate >= expectedByNow * 0.95 ? "onPace" : "behind";

  const quarterSummary: QuarterSummary = {
    quarterLabel: "Q2'26",
    quarterGoal,
    actualToDate,
    weeksElapsed,
    weeksRemaining,
    projectedEnd,
    paceStatus,
  };

  return { weeks, quarterSummary };
}

// ── Board-plan helper: coverage diagnostic ──
function buildCoverageDiagnostic(quotaMap: Record<string, { totalQuota: number }>): CoverageDiagnostic {
  const impliedByMonth: Record<string, number> = {};
  const quotaByMonth: Record<string, number> = {};
  const q2Keys = ["2026-04", "2026-05", "2026-06"];
  for (const mk of Object.keys(MONTHLY_PIPELINE_GOALS)) {
    const q = quotaMap[mk];
    if (!q) continue;
    quotaByMonth[mk] = q.totalQuota;
    const implied = getImpliedCoverage(mk, q.totalQuota);
    if (implied !== null) impliedByMonth[mk] = implied;
  }
  const q2Values = q2Keys.map((k) => impliedByMonth[k]).filter((v): v is number => v !== undefined);
  const impliedQ2Avg = q2Values.length > 0 ? q2Values.reduce((a, b) => a + b, 0) / q2Values.length : 0;
  return {
    impliedByMonth,
    quotaByMonth,
    impliedQ2Avg,
    historicalBaseline: COVERAGE_MULTIPLE,
  };
}

// ── Board-plan helper: meta / rollover banner ──
function buildMeta(today: Date): DashboardMeta {
  const lastLoadedGoalMonth = getLastLoadedGoalMonth();
  if (!lastLoadedGoalMonth) {
    return { lastLoadedGoalMonth: null, showRolloverBanner: false, nextUnloadedMonthKey: null };
  }
  const [ly, lm] = lastLoadedGoalMonth.split("-").map(Number);
  const endOfLastMonth = new Date(ly, lm, 0);
  endOfLastMonth.setHours(23, 59, 59, 999);
  const nextDate = new Date(ly, lm, 1);
  const nextMonthKey = `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, "0")}`;
  const nextGoal = getMonthlyPipelineGoal(nextMonthKey);
  const fourteenDaysBefore = new Date(endOfLastMonth.getTime() - 14 * 24 * 60 * 60 * 1000);
  const showBanner = today >= fourteenDaysBefore && !nextGoal;
  return {
    lastLoadedGoalMonth,
    showRolloverBanner: showBanner,
    nextUnloadedMonthKey: showBanner ? nextMonthKey : null,
  };
}


// ── Step 5: Compute MTD tracking ──
function computeMtd(
  opps: Opportunity[],
  focusWeekStart: Date,
  quotaRecords?: QuotaRecord[],
  segmentRatioFn: (monthKey: string) => number = () => 1
): DashboardState["mtd"] {
  const focusWeekEnd = new Date(focusWeekStart);
  focusWeekEnd.setDate(focusWeekStart.getDate() + 6);
  focusWeekEnd.setHours(23, 59, 59, 999);

  function buildMonth(
    year: number,
    month: number,
    focusStart: Date,
    cutoffDate: Date | null // null = include all weeks (completed month)
  ): MtdMonth {
    const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;
    // MTD target: board goal if loaded, otherwise legacy quota × 5.8 fallback.
    // Scaled by segmentRatio (1.0 for All; MM/ENT share of quota for segmented views).
    const mtdGoal = getMonthlyPipelineGoal(monthKey);
    const rawMonthlyTarget = mtdGoal ? mtdGoal.totalGoal : getMonthlyCreationTarget(monthKey);
    const monthlyTarget = rawMonthlyTarget * segmentRatioFn(monthKey);
    const monthName = new Date(year, month).toLocaleString("en-US", { month: "long" });

    const monthStart = new Date(year, month, 1);
    const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999);

    const weeks: MtdWeekRow[] = [];
    let weekStart = getMonday(monthStart);
    // If the Monday before the 1st is in the prior month and the partial week
    // is just 1 day (e.g. Mar 1 is a Sunday), skip it — start from next Monday
    if (weekStart < monthStart) {
      const daysBefore = (monthStart.getTime() - weekStart.getTime()) / 86400000;
      if (daysBefore >= 6) {
        // The week mostly belongs to the prior month, skip
        weekStart = new Date(weekStart);
        weekStart.setDate(weekStart.getDate() + 7);
      }
    }

    while (weekStart <= monthEnd) {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);

      // Clip to month boundaries
      const clipStart = weekStart < monthStart ? monthStart : weekStart;
      const clipEnd = weekEnd > monthEnd ? monthEnd : weekEnd;

      // For current month: only include weeks up to and including focus week
      if (cutoffDate && weekStart > cutoffDate) break;

      if (clipStart <= monthEnd && clipEnd >= monthStart) {
        // Exclude AE Self-Set for board-plan parity (MTD tracks board-plan sources only)
        const weekOpps = oppsInRange(opps, clipStart, clipEnd).filter(
          (o) => ownerGroupFromSource(o.source) !== "Sales"
        );
        const created = weekOpps.reduce((s, o) => s + o.amount, 0);
        const mmCreated = weekOpps
          .filter((o) => o.segment === "MM")
          .reduce((s, o) => s + o.amount, 0);
        const entCreated = weekOpps
          .filter((o) => o.segment === "ENT")
          .reduce((s, o) => s + o.amount, 0);

        const isFocusWeek = focusStart.getTime() === weekStart.getTime();
        const isCurrentWeek = cutoffDate !== null && weekStart > focusStart;

        const label = `${clipStart.getMonth() + 1}/${clipStart.getDate()}–${clipEnd.getMonth() + 1}/${clipEnd.getDate()}`;

        weeks.push({
          weekLabel: label,
          weekStartIso: clipStart.toISOString(),
          weekEndIso: clipEnd.toISOString(),
          created,
          mmCreated,
          entCreated,
          cumulative: 0,
          gapToTarget: 0,
          isFocusWeek,
          isCurrentWeek,
        });
      }

      weekStart = new Date(weekStart);
      weekStart.setDate(weekStart.getDate() + 7);
    }

    // Compute cumulative
    let cumulative = 0;
    for (const w of weeks) {
      cumulative += w.created;
      w.cumulative = cumulative;
      w.gapToTarget = monthlyTarget - cumulative;
    }

    // Per-owner-group breakdown for the channel filter on the client.
    const monthOpps = opps.filter((o) => {
      const d = o.discoveryDate;
      return d >= monthStart && d <= monthEnd;
    });

    const byGroup = {} as Record<GroupKey, MtdGroupBreakdown>;
    for (const k of GROUP_KEYS) {
      const groupOpps = monthOpps.filter((o) => groupKeyFromSource(o.source) === k);
      const groupWeeks: MtdWeekRow[] = weeks.map((w) => {
        const wkStart = new Date(w.weekStartIso);
        const wkEnd = new Date(w.weekEndIso);
        const wkOpps = groupOpps.filter(
          (o) => o.discoveryDate >= wkStart && o.discoveryDate <= wkEnd
        );
        const wkCreated = wkOpps.reduce((s, o) => s + o.amount, 0);
        const wkMm = wkOpps.filter((o) => o.segment === "MM").reduce((s, o) => s + o.amount, 0);
        const wkEnt = wkOpps.filter((o) => o.segment === "ENT").reduce((s, o) => s + o.amount, 0);
        return {
          weekLabel: w.weekLabel,
          weekStartIso: w.weekStartIso,
          weekEndIso: w.weekEndIso,
          created: wkCreated,
          mmCreated: wkMm,
          entCreated: wkEnt,
          cumulative: 0,        // filled below
          gapToTarget: 0,       // not used at the per-group week level
          isFocusWeek: w.isFocusWeek,
          isCurrentWeek: w.isCurrentWeek,
        };
      });
      let grpCum = 0;
      for (const wk of groupWeeks) {
        grpCum += wk.created;
        wk.cumulative = grpCum;
      }
      const groupTotalCreated = groupWeeks.reduce((s, w) => s + w.created, 0);
      const groupMonthlyTarget =
        k === "ae"
          ? getAeMonthlyTarget(monthKey) * segmentRatioFn(monthKey)
          : getWeeklyGoalByGroup(monthKey, GROUP_META[k].ownerGroup) * WEEKS_PER_MONTH * segmentRatioFn(monthKey);
      byGroup[k] = {
        totalCreated: groupTotalCreated,
        monthlyTarget: groupMonthlyTarget,
        weeks: groupWeeks,
      };
    }

    const aeUpsideTarget = getAeMonthlyTarget(monthKey) * segmentRatioFn(monthKey);

    return {
      month: monthName,
      year,
      monthlyTarget,
      weeks,
      totalCreated: cumulative,
      pctHit: monthlyTarget > 0 ? (cumulative / monthlyTarget) * 100 : 0,
      gapToTarget: monthlyTarget - cumulative,
      byGroup,
      aeUpsideTarget,
    };
  }

  const focusMonth = focusWeekStart.getMonth();
  const focusYear = focusWeekStart.getFullYear();

  // Current month: include weeks up to and including the current (incomplete) week
  const currentWeekMonday = getMonday(new Date());
  const current = buildMonth(focusYear, focusMonth, focusWeekStart, currentWeekMonday);

  // Previous month: include all weeks (completed month)
  const prevMonth = focusMonth === 0 ? 11 : focusMonth - 1;
  const prevYear = focusMonth === 0 ? focusYear - 1 : focusYear;
  const previous = buildMonth(prevYear, prevMonth, focusWeekStart, null);

  return { current, previous };
}

// ── Step 6: Build deal list (pool spans all period filters) ──
function buildDealList(opps: Opportunity[]): DealRow[] {
  return opps
    .sort((a, b) => b.discoveryDate.getTime() - a.discoveryDate.getTime())
    .map((o) => ({
      oppId: o.oppId,
      discoveryDateIso: o.discoveryDate.toISOString(),
      date: `${o.discoveryDate.getMonth() + 1}/${o.discoveryDate.getDate()}`,
      name: o.name.replace(/ - (Electrical|Mechanical|New|New Business).*$/i, "").trim(),
      amount: o.amount,
      owner: formatOwnerShort(o.owner),
      sdrOwner: o.sdrOwner ? formatOwnerShort(o.sdrOwner) : "",
      segment: o.segment,
      stage: o.stage,
      source: o.source,
    }));
}

function formatOwnerShort(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}. ${parts[parts.length - 1]}`;
  }
  return name;
}

// ── Step 7: Generate executive summary narratives ──
function generateExecSummary(
  scoreboard: DashboardState["scoreboard"],
  mtd: DashboardState["mtd"],
  focusWeekLabel: string
): DashboardState["execSummary"] {
  const { blended, groups, aeUpside } = scoreboard;

  // Week narrative: board-plan framing (BDR + Field + Perf), AE Self-Set as upside
  const hitOrMiss = blended.pctHit >= 100
    ? `hitting ${Math.round(blended.pctHit)}% of goal`
    : `${Math.round(blended.pctHit)}% to goal (${fmtK(Math.abs(blended.gap))} gap)`;
  const upsidePart = aeUpside.created > 0
    ? ` AE Self-Set upside: ${fmtK(aeUpside.created)} tracked separately.`
    : "";
  const weekNarrative = `Board-plan pipeline this week: ${fmtK(blended.created)} (BDR + Field + Perf) against a ${fmtK(blended.target)} weekly target — ${hitOrMiss}.${upsidePart}`;

  // MTD narrative: Q2'26 plan framing, no 5.8x / coverage multiple references
  const cur = mtd.current;
  const prev = mtd.previous;
  const weeksCompleted = cur.weeks.filter(
    (w) => w.created > 0 && !w.isCurrentWeek
  ).length;
  const monthlyTarget = cur.monthlyTarget;
  const remaining = WEEKS_PER_MONTH - weeksCompleted;
  const neededPerWeek =
    remaining > 0 ? (monthlyTarget - cur.totalCreated) / remaining : 0;

  const mtdNarrative = `${cur.month} has created ${fmtK(cur.totalCreated)} through ${weeksCompleted === 1 ? "one week" : weeksCompleted === 2 ? "two weeks" : `${weeksCompleted} weeks`} — ${Math.round(cur.pctHit)}% of the ${fmtK(monthlyTarget)} Q2'26 plan monthly target. To hit plan, we need ~${fmtK(neededPerWeek)}/wk for the remaining ${remaining.toFixed(1)} weeks. ${prev.month} closed at ${fmtK(prev.totalCreated)} (${Math.round(prev.pctHit)}% of its ${fmtK(prev.monthlyTarget)} target)${prev.weeks.length >= 3 ? `, with weeks 3 (${fmtK(prev.weeks[2]?.created || 0)}) and 4 (${fmtK(prev.weeks[3]?.created || 0)}) doing the heavy lifting` : ""}.`;

  // Gap narrative: owner-group pacing
  const groupCards = [groups.bdrOutbound, groups.fieldMarketing, groups.perfMarketing];
  const parts = groupCards.map((g) => {
    if (g.pctHit >= 100) return `${g.displayLabel} is on pace (${Math.round(g.pctHit)}%)`;
    if (g.pctHit >= 70) return `${g.displayLabel} is close at ${Math.round(g.pctHit)}%`;
    return `${g.displayLabel} is trailing at ${Math.round(g.pctHit)}% (${fmtK(Math.abs(g.gap))} gap)`;
  });
  const gapNarrative = parts.join("; ") + ".";

  return { weekNarrative, mtdNarrative, gapNarrative };
}


// ── Main Processing Function ──
export function processPipeline(
  rawOpps: RawOpportunity[],
  focusWeekOverride?: Date,
  quotaRecords?: QuotaRecord[],
  segment: "MM" | "ENT" | null = null
): DashboardState {
  // Parse all opps
  const allParsed = rawOpps
    .map(parseOpp)
    .filter((o): o is Opportunity => o !== null);

  // Segment filter (opps). Null = no filter (All view).
  const opps = segment ? allParsed.filter((o) => o.segment === segment) : allParsed;

  // Segment ratio function — 1.0 for All view, else segment's share of quota per month.
  const segmentRatioFn: (monthKey: string) => number = (monthKey: string) => {
    if (!segment) return 1;
    const q = buildMonthlyQuotaFromRecords(quotaRecords ?? [], monthKey);
    if (q.totalQuota <= 0) return 0;
    return segment === "MM" ? q.mmQuota / q.totalQuota : q.entQuota / q.totalQuota;
  };

  // Determine focus week — use ALL parsed opps to anchor the focus week consistently
  // across segments (same week range regardless of MM/ENT toggle).
  const { start: focusWeekStart, end: focusWeekEnd } = getFocusWeek(
    allParsed,
    focusWeekOverride
  );

  const monthKey = `${focusWeekStart.getFullYear()}-${String(focusWeekStart.getMonth() + 1).padStart(2, "0")}`;

  // Focus week opps (segment-filtered)
  const weekOpps = oppsInRange(opps, focusWeekStart, focusWeekEnd);

  // Format week label
  const startMonth = focusWeekStart.toLocaleString("en-US", { month: "long" });
  const endMonth = focusWeekEnd.toLocaleString("en-US", { month: "long" });
  const focusWeekLabel =
    startMonth === endMonth
      ? `${startMonth} ${focusWeekStart.getDate()}–${focusWeekEnd.getDate()}`
      : `${startMonth} ${focusWeekStart.getDate()}–${endMonth} ${focusWeekEnd.getDate()}`;

  // Latest discovery date across ALL opps (segment-invariant "last updated" display)
  const latestDiscoveryDate = allParsed.reduce(
    (max, o) => (o.discoveryDate > max ? o.discoveryDate : max),
    allParsed[0].discoveryDate
  );

  // Compute all sections (segment-scaled where applicable)
  const mtd = computeMtd(opps, focusWeekStart, quotaRecords, segmentRatioFn);

  // Deals pool — widen from focus-week-only to cover all period filters
  // (current week, last week, this month, last month, current quarter).
  // The earliest needed start = min(start of last month, start of current quarter).
  const now = new Date();
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const qMonth = Math.floor(now.getMonth() / 3) * 3;
  const startOfCurrentQuarter = new Date(now.getFullYear(), qMonth, 1);
  const poolStart = startOfLastMonth < startOfCurrentQuarter ? startOfLastMonth : startOfCurrentQuarter;
  const poolEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  const dealsPoolOpps = oppsInRange(opps, poolStart, poolEnd);
  const deals = buildDealList(dealsPoolOpps);

  const today = new Date();
  // Build quota map for months with board goals (for implied-coverage diagnostic).
  // Diagnostic uses ALL-quota/ALL-goal so implied multiple is segment-invariant
  // (scaling numerator and denominator by the same ratio cancels out).
  const quotaMapForCoverage: Record<string, { totalQuota: number }> = {};
  for (const mk of Object.keys(MONTHLY_PIPELINE_GOALS)) {
    quotaMapForCoverage[mk] = buildMonthlyQuotaFromRecords(quotaRecords ?? [], mk);
  }
  const boardCards = buildBlendedAndGroupCards(weekOpps, monthKey, segmentRatioFn(monthKey));
  const scoreboard: DashboardState["scoreboard"] = {
    blended: boardCards.blended,
    groups: boardCards.groups,
    aeUpside: boardCards.aeUpside,
  };
  const quarterStart = new Date(2026, 3, 1); // Apr 1, 2026 (month 3 = April)
  const pacing = buildPacingState(opps, quarterStart, today, segmentRatioFn);
  const coverageDiagnostic = buildCoverageDiagnostic(quotaMapForCoverage);
  const meta = buildMeta(today);

  const execSummary = generateExecSummary(
    scoreboard,
    mtd,
    focusWeekLabel
  );

  return {
    focusWeekLabel,
    focusWeekStart,
    focusWeekEnd,
    latestDiscoveryDate,
    renderedAt: today,
    scoreboard,
    pacing,
    coverageDiagnostic,
    meta,
    mtd,
    deals,
    execSummary,
  };
}

// ── Segmented wrapper — pre-computes All / MM / ENT views server-side ──
export function processPipelineSegmented(
  rawOpps: RawOpportunity[],
  focusWeekOverride?: Date,
  quotaRecords?: QuotaRecord[]
): SegmentedDashboardState {
  return {
    all: processPipeline(rawOpps, focusWeekOverride, quotaRecords, null),
    mm: processPipeline(rawOpps, focusWeekOverride, quotaRecords, "MM"),
    ent: processPipeline(rawOpps, focusWeekOverride, quotaRecords, "ENT"),
  };
}
