import {
  RawOpportunity,
  Opportunity,
  CoverageState,
  CoverageWindowRow,
  SegmentAging,
  AgingBucket,
  StageBreakdown,
  CoverageDeal,
  CloseDateHealth,
  OpenStage,
} from "./types";
import {
  COVERAGE_CONFIG,
  OPEN_STAGES,
} from "./config";
import { QuotaRecord } from "./types-sdr";
import { resolveMonthlyQuota } from "./quota-loader";
import { parseOpp } from "./process-pipeline";

// ── Helpers ──
function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function daysBetween(a: Date, b: Date): number {
  return Math.floor((b.getTime() - a.getTime()) / 86_400_000);
}

function isOpenStage(stage: string): boolean {
  return (OPEN_STAGES as readonly string[]).includes(stage);
}

function coverageStatus(ratio: number): "green" | "yellow" | "red" {
  if (ratio >= 5.8) return "green";
  if (ratio >= 3.0) return "yellow";
  return "red";
}

// ── Main Processing ──
export function processCoverage(rawOpps: RawOpportunity[], quotaRecords?: QuotaRecord[]): CoverageState {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Parse all opps
  const allOpps = rawOpps
    .map(parseOpp)
    .filter((o): o is Opportunity => o !== null);

  // Open opps only
  const openOpps = allOpps.filter((o) => isOpenStage(o.stage));

  // Latest discovery date
  const latestDiscoveryDate = allOpps.reduce(
    (max, o) => (o.discoveryDate > max ? o.discoveryDate : max),
    allOpps[0].discoveryDate
  );

  // ── Section 1: Coverage Scoreboard ──
  const thisMonthStart = startOfMonth(today);
  const thisMonthEnd = endOfMonth(today);

  const nextMonthDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const nextMonthEnd = endOfMonth(nextMonthDate);

  // Current quarter: figure out remaining months
  const qMonth = today.getMonth(); // 0-indexed
  const qStart = Math.floor(qMonth / 3) * 3; // 0, 3, 6, 9
  const qEndMonth = qStart + 2;
  const qEnd = new Date(today.getFullYear(), qEndMonth + 1, 0, 23, 59, 59, 999);

  function buildWindow(
    label: string,
    rangeStart: Date,
    rangeEnd: Date,
    quotaMonths: string[]
  ): CoverageWindowRow {
    const opps = openOpps.filter((o) => {
      if (!o.closeDate) return false;
      return o.closeDate >= rangeStart && o.closeDate <= rangeEnd;
    });
    const totalPipeline = opps.reduce((s, o) => s + o.amount, 0);
    const mmOpps = opps.filter((o) => o.segment === "MM");
    const entOpps = opps.filter((o) => o.segment === "ENT");
    const mmPipeline = mmOpps.reduce((s, o) => s + o.amount, 0);
    const entPipeline = entOpps.reduce((s, o) => s + o.amount, 0);

    const quota = quotaMonths.reduce((s, mk) => s + resolveMonthlyQuota(mk, quotaRecords).totalQuota, 0);
    const ratio = quota > 0 ? totalPipeline / quota : 0;

    return {
      label,
      openPipeline: totalPipeline,
      quota,
      coverageRatio: ratio,
      status: coverageStatus(ratio),
      oppCount: opps.length,
      mmPipeline,
      entPipeline,
      mmOppCount: mmOpps.length,
      entOppCount: entOpps.length,
    };
  }

  const thisMonthKey = monthKey(today);
  const nextMonthKey = monthKey(nextMonthDate);
  const quarterMonthKeys: string[] = [];
  for (let m = today.getMonth(); m <= qEndMonth; m++) {
    quarterMonthKeys.push(`${today.getFullYear()}-${String(m + 1).padStart(2, "0")}`);
  }

  const windows: CoverageWindowRow[] = [
    buildWindow("This Month", thisMonthStart, thisMonthEnd, [thisMonthKey]),
    buildWindow("Next Month", nextMonthDate, nextMonthEnd, [nextMonthKey]),
    buildWindow("This Quarter", thisMonthStart, qEnd, quarterMonthKeys),
  ];

  // ── Section 2: Pipeline Aging ──
  function buildAging(segment: "MM" | "ENT"): SegmentAging {
    const cfg = segment === "MM" ? COVERAGE_CONFIG.mm : COVERAGE_CONFIG.ent;
    const segOpps = openOpps.filter((o) => o.segment === segment);
    const total = segOpps.reduce((s, o) => s + o.amount, 0);

    const freshOpps = segOpps.filter((o) => daysBetween(o.discoveryDate, today) <= cfg.freshDays);
    const agingOpps = segOpps.filter((o) => {
      const age = daysBetween(o.discoveryDate, today);
      return age > cfg.freshDays && age <= cfg.agingDays;
    });
    const staleOpps = segOpps.filter((o) => daysBetween(o.discoveryDate, today) > cfg.agingDays);

    const makeBucket = (label: string, opps: Opportunity[], color: string): AgingBucket => ({
      label,
      amount: opps.reduce((s, o) => s + o.amount, 0),
      oppCount: opps.length,
      color,
    });

    const fresh = makeBucket("Fresh", freshOpps, "var(--green)");
    const aging = makeBucket("Aging", agingOpps, "var(--yellow)");
    const stale = makeBucket("Stale", staleOpps, "var(--red)");

    return {
      segment,
      total,
      oppCount: segOpps.length,
      fresh,
      aging,
      stale,
      threshold: cfg.requiredPipeline,
      freshVsThreshold: cfg.requiredPipeline > 0 ? fresh.amount / cfg.requiredPipeline : 0,
    };
  }

  // ── Section 3: Stage Composition (this month's close window) ──
  const thisMonthOpenOpps = openOpps.filter((o) => {
    if (!o.closeDate) return false;
    return o.closeDate >= thisMonthStart && o.closeDate <= thisMonthEnd;
  });
  const thisMonthTotal = thisMonthOpenOpps.reduce((s, o) => s + o.amount, 0);

  const stageComposition: StageBreakdown[] = (OPEN_STAGES as readonly string[]).map((stage) => {
    const stageOpps = thisMonthOpenOpps.filter((o) => o.stage === stage);
    const amount = stageOpps.reduce((s, o) => s + o.amount, 0);
    return {
      stage: stage as OpenStage,
      amount,
      oppCount: stageOpps.length,
      pctOfTotal: thisMonthTotal > 0 ? (amount / thisMonthTotal) * 100 : 0,
    };
  });

  // ── Section 4: Top Deals ──
  const dealPool = openOpps.filter((o) => {
    if (!o.closeDate) return false;
    return o.closeDate >= thisMonthStart && o.closeDate <= nextMonthEnd;
  });
  const topDeals: CoverageDeal[] = dealPool
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 20)
    .map((o) => ({
      name: o.name.replace(/ - (Electrical|Mechanical|New|New Business).*$/i, "").trim(),
      amount: o.amount,
      owner: formatOwnerShort(o.owner),
      stage: o.stage,
      closeDate: o.closeDate
        ? `${o.closeDate.getMonth() + 1}/${o.closeDate.getDate()}`
        : "—",
      inactiveDays: o.lastActivityDate ? daysBetween(o.lastActivityDate, today) : null,
      segment: o.segment,
      accountName: o.accountName,
      annualRevenue: o.annualRevenue,
      discoveryDate: o.discoveryDate
        ? `${o.discoveryDate.getMonth() + 1}/${o.discoveryDate.getDate()}/${o.discoveryDate.getFullYear()}`
        : "—",
      ownerFull: o.owner,
    }));

  // ── Section 5: Close Date Health ──
  const pastDue = openOpps.filter((o) => o.closeDate && o.closeDate < today);
  const thisMonthByStage: StageBreakdown[] = (OPEN_STAGES as readonly string[]).map((stage) => {
    const stageOpps = thisMonthOpenOpps.filter((o) => o.stage === stage);
    const amount = stageOpps.reduce((s, o) => s + o.amount, 0);
    return {
      stage: stage as OpenStage,
      amount,
      oppCount: stageOpps.length,
      pctOfTotal: thisMonthTotal > 0 ? (amount / thisMonthTotal) * 100 : 0,
    };
  });

  const thirtyDaysOut = new Date(today);
  thirtyDaysOut.setDate(today.getDate() + 30);
  const discoveryClosingSoon = openOpps.filter(
    (o) =>
      o.stage === "Discovery" &&
      o.closeDate &&
      o.closeDate >= today &&
      o.closeDate <= thirtyDaysOut
  );

  const closeDateHealth: CloseDateHealth = {
    pastDueCount: pastDue.length,
    pastDueAmount: pastDue.reduce((s, o) => s + o.amount, 0),
    thisMonthByStage,
    discoveryClosingSoon: discoveryClosingSoon.length,
    discoveryClosingSoonAmount: discoveryClosingSoon.reduce((s, o) => s + o.amount, 0),
  };

  const asOfDate = today.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  return {
    asOfDate,
    latestDiscoveryDate,
    renderedAt: new Date(),
    windows,
    aging: {
      mm: buildAging("MM"),
      ent: buildAging("ENT"),
    },
    stageComposition,
    topDeals,
    closeDateHealth,
    allOpps,
  };
}

function formatOwnerShort(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}. ${parts[parts.length - 1]}`;
  }
  return name;
}
