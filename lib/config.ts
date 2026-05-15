import { SourceLabel, OwnerGroup } from "./types";

// ── Monthly Quotas (100% Attainment) ──
export interface MonthlyQuota {
  totalQuota: number;
  mmQuota: number;
  entQuota: number;
}

export const MONTHLY_QUOTAS: Record<string, MonthlyQuota> = {
  "2026-01": { totalQuota: 662708, mmQuota: 321000, entQuota: 341708 },
  "2026-02": { totalQuota: 672708, mmQuota: 321000, entQuota: 351708 },
  "2026-03": { totalQuota: 682000, mmQuota: 321000, entQuota: 361000 },
};

// ── Coverage Multiple ──
export const COVERAGE_MULTIPLE = 5.8;
export const WEEKS_PER_MONTH = 4.33;
export const WEEKS_PER_QUARTER = 13;

// ── AE Self-Set Stretch Index ──
// AE Self-Set sits outside the board plan; we stretch-target it at 10% of the
// monthly board plan total (BDR + Field + Perf). Adopted in the 2026-04-27
// pipeline review. Dynamic — moves month-over-month with the board plan.
export const AE_TARGET_INDEX = 0.10;

// ── AE Performance Tab Configuration ──
// All thresholds for the AE Performance tab. Independent of channel-filter
// helpers (GroupKey, GROUP_META, groupKeyFromSource) — those are for
// Weekly Lookback and have different semantics.
export const AE_PERFORMANCE_CONFIG = {
  // SLAs (hours from Created Date to Last Activity)
  inboundSlaHours: 48,
  eventSlaHours: 48,

  // Staleness (no Last Activity Date touch within N days)
  qualificationStaleDays: 7,           // Section 1
  qualifiedStaleDaysDefault: 14,       // Section 2 default
  qualifiedStalePillOptions: [7, 14, 30] as const, // Section 2 pill choices

  // Outcome window (days a Qualification opp has to advance past Qualification)
  advanceOutWindowDays: 7,             // Section 1

  // Self-set
  selfSetMonthlyTarget: 3,             // Section 3 — count, not dollars

  // Cohort
  cohortRollingDays: 30,               // Section 1's denominators

  // Color thresholds — note opposing polarities:
  // slaPct: HIGHER is better (green ≥ 80%, yellow 70–80%, red < 70%)
  // qualifiedStalePct: LOWER is better (green ≤ 20%, yellow 20–30%, red > 30%)
  slaPctGreen: 0.80,
  slaPctYellow: 0.70,
  qualifiedStalePctGreen: 0.20,
  qualifiedStalePctYellow: 0.30,

  // Stages excluded from the qualified pipeline staleness denominator
  closedStages: ["Closed Won", "Closed Lost"] as const,
};

// ── External Links ──
export const SFDC_BASE_URL = "https://usekojo.lightning.force.com/lightning/r/Opportunity";

/** Build SFDC opportunity URL from an 18-char opportunity ID. */
export function sfdcOppUrl(oppId: string): string {
  return `${SFDC_BASE_URL}/${oppId}/view`;
}

// ── Monthly Pipeline Creation Goals (Board-Committed) ──
// Source: Q2'26 Board Pipeline Reporting.xlsx → Board sheet, rows 26-28
// Locked quarterly. AE Self-Set is explicitly excluded from board plan (treated as upside).
export interface MonthlyPipelineGoal {
  bdrOutbound: number;     // SDR group (Sadie): SDR Outbound + 6sense/Warmly
  fieldMarketing: number;  // Marketing group (Alex): Events + Partner + Webinar
  perfMarketing: number;   // Demand Gen group (Ali): Inbound
  totalGoal: number;       // Sum of 3 — excludes AE Self-Set per board plan
}

export const MONTHLY_PIPELINE_GOALS: Record<string, MonthlyPipelineGoal> = {
  "2026-04": { bdrOutbound: 1_039_274, fieldMarketing: 378_976, perfMarketing: 480_000,   totalGoal: 1_898_274 },
  "2026-05": { bdrOutbound: 1_234_022, fieldMarketing: 558_941, perfMarketing: 910_000,   totalGoal: 2_703_022 },
  "2026-06": { bdrOutbound: 1_429_141, fieldMarketing: 648_924, perfMarketing: 1_170_000, totalGoal: 3_248_141 },
};

// ── Source Win Rates & CW Shares ──
export interface SourceConfig {
  label: SourceLabel;
  winRate: number;
  cwShare: number;
  ownerGroup: OwnerGroup;
}

export const SOURCE_CONFIGS: SourceConfig[] = [
  { label: "SDR Outbound", winRate: 0.082, cwShare: 0.200, ownerGroup: "SDR" },
  { label: "Inbound", winRate: 0.261, cwShare: 0.325, ownerGroup: "Demand Gen" },
  { label: "Events", winRate: 0.113, cwShare: 0.176, ownerGroup: "Marketing" },
  { label: "6sense/Warmly", winRate: 0.139, cwShare: 0.144, ownerGroup: "SDR" },
  { label: "AE Self-Set", winRate: 0.244, cwShare: 0.121, ownerGroup: "Sales" },
  { label: "Partner", winRate: 0.250, cwShare: 0.026, ownerGroup: "Marketing" },
  { label: "Webinar", winRate: 0.111, cwShare: 0.002, ownerGroup: "Marketing" },
];

// ── Opp Set Type → Source Label Mapping ──
export const OPP_SET_TYPE_MAP: Record<string, SourceLabel> = {
  "SDR Set - Outbound": "SDR Outbound",
  "AE Set - Inbound": "Inbound",
  "SDR Set - Inbound": "Inbound",
  "6s": "6sense/Warmly",
  Event: "Events",
  Partner: "Partner",
  Webinar: "Webinar",
  "AE - Self Set": "AE Self-Set",
};

// ── Manager → Segment Override ──
// Per CLAUDE.md: "Sean Coyle = ENT, Jeremy Taylor or Jared Moor = MM"
export const MANAGER_SEGMENT_MAP: Record<string, "MM" | "ENT"> = {
  "Jeremy Taylor": "MM",
  "Jared Moor": "MM",
  "Sean Coyle": "ENT",
};

/**
 * Returns the segment ("MM" | "ENT") for an AE based on their manager,
 * or null if the manager isn't in the override map.
 *
 * AE Performance uses this to group AE rows by team membership.
 * The page judges AE behavior, so segmentation is by manager (team), NOT
 * by individual opp characteristics.
 */
export function aeSegmentFromManager(manager: string): "MM" | "ENT" | null {
  return MANAGER_SEGMENT_MAP[manager] ?? null;
}

// ── Segmentation Revenue Threshold ──
export const ENT_REVENUE_THRESHOLD = 75_000_000;

// ── Owner Group Definitions ──
export interface OwnerGroupConfig {
  group: OwnerGroup;
  owner: string;
  color: string; // CSS variable name
  sources: SourceLabel[];
}

export const OWNER_GROUPS: OwnerGroupConfig[] = [
  {
    group: "Demand Gen",
    owner: "Ali Karshenas",
    color: "var(--yellow)",
    sources: ["Inbound"],
  },
  {
    group: "Marketing",
    owner: "Alex Harmon",
    color: "var(--blue)",
    sources: ["Events", "Partner", "Webinar"],
  },
  {
    group: "SDR",
    owner: "Sadie Rankin",
    color: "var(--green)",
    sources: ["SDR Outbound", "6sense/Warmly"],
  },
  {
    group: "Sales",
    owner: "Jeremy Taylor & Sean Coyle",
    color: "var(--teal)",
    sources: ["AE Self-Set"],
  },
];

// ── UI-facing channel keys (used by pills + Scoreboard chips) ──
// `GroupKey` is the short UI key; `OwnerGroup` is the canonical processing
// label. Use GroupKey for client-side pill/chip UI; use OwnerGroup when
// calling getWeeklyGoalByGroup, ownerGroupFromSource, or anything in
// process-pipeline.ts.
//
// NOTE: GROUP_META.sources mirrors OWNER_GROUPS.sources by design. If a new
// SourceLabel is added, update both arrays — there is no compiler enforcement.

export type GroupKey = "bdr" | "field" | "perf" | "ae";

export const GROUP_KEYS: readonly GroupKey[] = ["bdr", "field", "perf", "ae"] as const;

export interface GroupMeta {
  displayLabel: string;
  color: string;        // CSS variable
  activeBg: string;     // background when pill is active
  sources: SourceLabel[];
  ownerGroup: OwnerGroup;
}

export const GROUP_META: Record<GroupKey, GroupMeta> = {
  bdr:   { displayLabel: "BDR Outbound",    color: "var(--green)",  activeBg: "rgba(34, 197, 94, 0.2)",  sources: ["SDR Outbound", "6sense/Warmly"], ownerGroup: "SDR" },
  field: { displayLabel: "Field Marketing", color: "var(--blue)",   activeBg: "rgba(59, 130, 246, 0.2)", sources: ["Events", "Partner", "Webinar"],  ownerGroup: "Marketing" },
  perf:  { displayLabel: "Perf Marketing",  color: "var(--yellow)", activeBg: "rgba(245, 158, 11, 0.2)", sources: ["Inbound"],                       ownerGroup: "Demand Gen" },
  ae:    { displayLabel: "AE Self-Set",     color: "var(--teal)",   activeBg: "rgba(78, 205, 196, 0.2)", sources: ["AE Self-Set"],                   ownerGroup: "Sales" },
};

/** Map an opportunity source label to its UI group key. Used by client filters and server precomputation. */
export function groupKeyFromSource(source: SourceLabel): GroupKey {
  for (const k of GROUP_KEYS) {
    if (GROUP_META[k].sources.includes(source)) return k;
  }
  // Unreachable when SourceLabel and GROUP_META.sources are in sync. If reached,
  // CSV data carries a label the union type has not been updated to include —
  // surface it instead of silently miscategorizing into AE.
  console.warn(`groupKeyFromSource: unmapped source "${source}" — falling back to "ae".`);
  return "ae";
}

// ── Revenue Breakdown parent grouping ──
// Maps raw SFDC `Opportunity Source` strings (NOT normalized SourceLabel values)
// to parent groups. The legacy By Source / By Set Type tables on the Revenue
// page render raw values, so the nested view groups by the same raw values to
// make totals reconcile exactly.
//
// Differs from Pulse's GROUP_META on purpose: Pulse normalizes via
// OPP_SET_TYPE_MAP and tracks AE Self-Set separately as upside vs. board plan.
// Revenue rolls everything that's not marketing-sourced or CS-driven into
// Outbound — including AE Self-Set (which lives inside the raw "Outbound"
// source as set type "AE - Self Set") and 6s Intent Signals.
export type RevenueGroupKey = "outbound" | "field" | "perf" | "cs";

export const REVENUE_GROUP_KEYS: readonly RevenueGroupKey[] = ["outbound", "field", "perf", "cs"] as const;

export interface RevenueGroupMeta {
  displayLabel: string;
  color: string;
  sources: string[]; // raw SFDC Opportunity Source values
}

export const REVENUE_GROUP_META: Record<RevenueGroupKey, RevenueGroupMeta> = {
  outbound: { displayLabel: "Outbound",            color: "var(--green)",  sources: ["Outbound", "6s Intent Signals"] },
  field:    { displayLabel: "Field Marketing",     color: "var(--blue)",   sources: ["Event", "Partner", "Webinar"] },
  perf:     { displayLabel: "Perf Marketing",      color: "var(--yellow)", sources: ["Inbound"] },
  cs:       { displayLabel: "CS Source-Expansion", color: "var(--teal)",   sources: ["CS Sourced", "Expansion", "Customer Referral"] },
};

export function revenueGroupKeyFromSource(source: string): RevenueGroupKey | null {
  for (const k of REVENUE_GROUP_KEYS) {
    if (REVENUE_GROUP_META[k].sources.includes(source)) return k;
  }
  return null;
}

// ── Helper: Get quota for a month key like "2026-03" ──
export function getMonthlyQuota(monthKey: string): MonthlyQuota {
  const quota = MONTHLY_QUOTAS[monthKey];
  if (!quota) {
    // Fall back to most recent known quota
    const keys = Object.keys(MONTHLY_QUOTAS).sort();
    return MONTHLY_QUOTAS[keys[keys.length - 1]];
  }
  return quota;
}

// ── Helper: Weekly blended target for a month ──
// Prefers board-plan totalGoal when present; falls back to legacy quota × 5.8 / 4.33.
export function getWeeklyTarget(monthKey: string): number {
  const goal = getMonthlyPipelineGoal(monthKey);
  if (goal) return goal.totalGoal / WEEKS_PER_MONTH;
  const q = getMonthlyQuota(monthKey);
  return (q.totalQuota * COVERAGE_MULTIPLE) / WEEKS_PER_MONTH;
}

// ── Helper: Monthly creation target ──
export function getMonthlyCreationTarget(monthKey: string): number {
  const q = getMonthlyQuota(monthKey);
  return q.totalQuota * COVERAGE_MULTIPLE;
}

// ── Board-plan helpers ──

/** Monthly board goal row, or null if not set. Null = fall back to legacy 5.8× formula. */
export function getMonthlyPipelineGoal(monthKey: string): MonthlyPipelineGoal | null {
  return MONTHLY_PIPELINE_GOALS[monthKey] ?? null;
}

/** Weekly target for a specific owner group. Returns 0 for "Sales" — use getAeWeeklyTarget for the AE stretch index. */
export function getWeeklyGoalByGroup(monthKey: string, group: OwnerGroup): number {
  const goal = getMonthlyPipelineGoal(monthKey);
  if (!goal) return 0;
  switch (group) {
    case "SDR": return goal.bdrOutbound / WEEKS_PER_MONTH;
    case "Marketing": return goal.fieldMarketing / WEEKS_PER_MONTH;
    case "Demand Gen": return goal.perfMarketing / WEEKS_PER_MONTH;
    case "Sales": return 0;
  }
}

/** AE Self-Set monthly stretch target = AE_TARGET_INDEX × board plan total. Returns 0 if no goal loaded. */
export function getAeMonthlyTarget(monthKey: string): number {
  const goal = getMonthlyPipelineGoal(monthKey);
  if (!goal) return 0;
  return goal.totalGoal * AE_TARGET_INDEX;
}

/** AE Self-Set weekly stretch target = monthly target / 4.33. Returns 0 if no goal loaded. */
export function getAeWeeklyTarget(monthKey: string): number {
  return getAeMonthlyTarget(monthKey) / WEEKS_PER_MONTH;
}

/** totalGoal / monthlyQuota. Returns null if either is missing. */
export function getImpliedCoverage(monthKey: string, monthlyQuotaTotal: number): number | null {
  const goal = getMonthlyPipelineGoal(monthKey);
  if (!goal || monthlyQuotaTotal <= 0) return null;
  return goal.totalGoal / monthlyQuotaTotal;
}

/** Last month (by key ascending) that has a goal row. Used for the rollover banner predicate. */
export function getLastLoadedGoalMonth(): string | null {
  const keys = Object.keys(MONTHLY_PIPELINE_GOALS).sort();
  return keys.length > 0 ? keys[keys.length - 1] : null;
}

// ── Coverage View Config ──
export const COVERAGE_CONFIG = {
  mm: {
    requiredPipeline: 1_369_459,
    freshDays: 40,
    agingDays: 70,
  },
  ent: {
    requiredPipeline: 1_888_110,
    freshDays: 90,
    agingDays: 150,
  },
  targetCoverageMultiple: 5.8,
};

export const OPEN_STAGES = ["Discovery", "Evaluation", "Contracts/Negotiation", "Final Approvals"] as const;

// ── CCWR Target ──
// Inverse of coverage multiple: 1/5.8 = 17.2%, rounded to 17%.
// Represents the blended win rate Luke's coverage model assumes.
export const CCWR_TARGET = 0.17;

// ── Scenarios View Config ──
export const SCENARIOS_CONFIG = {
  defaultStaleThresholdDays: 90,
  defaultCoverageTarget: 5.8,
  defaultWinRate: 0.154,      // blended from data
  mmWinRate: 0.185,
  entWinRate: 0.164,
};

// 2025 monthly quotas (operating plan — $563K/mo baseline)
export const MONTHLY_QUOTAS_2025: Record<string, number> = {
  "2025-01": 563000, "2025-02": 563000, "2025-03": 563000,
  "2025-04": 563000, "2025-05": 563000, "2025-06": 563000,
  "2025-07": 563000, "2025-08": 563000, "2025-09": 563000,
  "2025-10": 563000, "2025-11": 563000, "2025-12": 563000,
};

// 2025 segment split ratios (derived from 2026: MM $321K / $682K ≈ 47.1%, ENT ≈ 52.9%)
export const SEGMENT_QUOTA_SPLIT = { mm: 0.471, ent: 0.529 };

export function getQuotaForMonth(
  monthKey: string,
  segment: "All" | "MidMarket" | "Enterprise" = "All"
): number {
  let total: number;
  // Check 2025 quotas first
  if (MONTHLY_QUOTAS_2025[monthKey] !== undefined) {
    total = MONTHLY_QUOTAS_2025[monthKey];
    if (segment === "MidMarket") return Math.round(total * SEGMENT_QUOTA_SPLIT.mm);
    if (segment === "Enterprise") return Math.round(total * SEGMENT_QUOTA_SPLIT.ent);
    return total;
  }
  // 2026+ quotas — use actual MM/ENT split from config
  const q = getMonthlyQuota(monthKey);
  if (segment === "MidMarket") return q.mmQuota;
  if (segment === "Enterprise") return q.entQuota;
  return q.totalQuota;
}

// ── Helper: Source-adjusted weekly target for a source ──
export function getSourceWeeklyTarget(
  source: SourceConfig,
  quarterlyQuota: number
): number {
  const qCwNeed = quarterlyQuota * source.cwShare;
  const qPipeNeed = qCwNeed / source.winRate;
  return qPipeNeed / WEEKS_PER_QUARTER;
}

// ── Shared Spreadsheet Config ──
export const SPREADSHEET_ID = "139f4amjRpd-CuQwXfjCJ1oYJ4vbda68GdsSF7C3q6KU";
export const SHEET_GIDS = {
  pipeline: "1815244803",
  sdrSets: "1054512915",
  quotas: "1376126270",
  closedWon: "543999142",
  renewalsUpsells: "931327785",
  calls: "1568386432",
  qualification: "377243797",
};

// ── Role Quotas (from Sales Playbook) ──
// Reference only — ramp detection uses Is Ramping field from SFDC, not these values
export const ROLE_QUOTAS = {
  sdr: { monthly: 8, quarterly: 24 },
  sdrII: { monthly: 10, quarterly: 30 },
  entSdr: { monthly: 6, quarterly: 18 },
  aeI: { monthly: 25000 },
  aeII: { monthly: 29000 },
  srAeI: { monthly: 45333 },
  srAeII: { monthly: 51000 },
  srAeIII: { monthly: 53125 },
  entAeI: { monthly: 53125 },
  entAeII: { monthly: 58437 },
  srEntAeI: { monthly: 63750 },
  srEntAeII: { monthly: 69063 },
} as const;

// ── SDR Segment Detection (from quota quantity) ──
// Quota of 6 = ENT SDR, Quota of 5 = Valeria (TL, group with MM), Quota > 6 = MM SDR
export const SDR_ENT_QUOTA = 6;
export const SDR_TL_QUOTA = 5;

// ── MM SDR Outbound Targets ──
export const MM_SDR_TARGETS = {
  saosPerWeek: 8,           // Jared: "30/month (8/week)"
  saosPerMonth: 30,
  cwConversionTarget: 0.15, // 15% close-won conversion
};

// ── Call Result Classification ──
export const CALL_RESULT_CONNECT: string[] = [
  "Call - Connect",
  "Call - Meeting Confirmation",
  "Call - Pipeline Call",
  "Connect - Demo Scheduled",
  "Connect - Referral",
  "Connect - Requires Additional Info",
  "Rejected - Competitor",
  "Rejected - Elevator Pitch",
  "Rejected - Intro",
  "Rejected - Meeting Attempt",
  "Rejected - NINA",
  "Rejected - Non-ICP",
];

export const CALL_RESULT_NOT_CONNECT: string[] = [
  "Attempting Contact - Bad Number",
  "Attempting Contact - Gatekeeper",
  "Attempting Contact - Left Voicemail",
  "Attempting Contact - No Answer",
  "Attempting Contact - No Longer with Company",
];

// ── Account Intelligence ──

export const AI_CONFIG = {
  sheetGids: {
    customerAccounts: "1925406595",
    hierarchyProspects: "1703881391",
  },
  enrTagIdentifier: "ENR Top 600 | 2025",
  nonIcpFirmTypes: ["U", "O", "A", "X"] as const,
  nameStripSuffixes: [
    "inc", "inc.", "llc", "llc.", "corp", "corp.", "co", "co.",
    "ltd", "ltd.", "group", "holdings", "enterprises",
    "construction", "contracting", "services", "company",
  ],
  revenueDeltaThresholds: { accurate: 0.15, warning: 0.30 },
  exportPasscode: "revops2026",
  stateAbbreviations: {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
    "california": "CA", "calif.": "CA", "colorado": "CO", "colo.": "CO",
    "connecticut": "CT", "conn.": "CT", "delaware": "DE", "del.": "DE",
    "florida": "FL", "fla.": "FL", "georgia": "GA", "hawaii": "HI",
    "idaho": "ID", "illinois": "IL", "ill.": "IL", "indiana": "IN", "ind.": "IN",
    "iowa": "IA", "kansas": "KS", "kan.": "KS", "kentucky": "KY", "ky.": "KY",
    "louisiana": "LA", "maine": "ME", "maryland": "MD", "md.": "MD",
    "massachusetts": "MA", "mass.": "MA", "michigan": "MI", "mich.": "MI",
    "minnesota": "MN", "minn.": "MN", "mississippi": "MS", "miss.": "MS",
    "missouri": "MO", "mo.": "MO", "montana": "MT", "mont.": "MT",
    "nebraska": "NE", "neb.": "NE", "nevada": "NV", "nev.": "NV",
    "new hampshire": "NH", "n.h.": "NH", "new jersey": "NJ", "n.j.": "NJ",
    "new mexico": "NM", "n.m.": "NM", "new york": "NY", "n.y.": "NY",
    "north carolina": "NC", "n.c.": "NC", "north dakota": "ND", "n.d.": "ND",
    "ohio": "OH", "oklahoma": "OK", "okla.": "OK", "oregon": "OR", "ore.": "OR",
    "pennsylvania": "PA", "pa.": "PA", "rhode island": "RI", "r.i.": "RI",
    "south carolina": "SC", "s.c.": "SC", "south dakota": "SD", "s.d.": "SD",
    "tennessee": "TN", "tenn.": "TN", "texas": "TX", "utah": "UT",
    "vermont": "VT", "vt.": "VT", "virginia": "VA", "va.": "VA",
    "washington": "WA", "wash.": "WA", "west virginia": "WV", "w.va.": "WV",
    "wisconsin": "WI", "wis.": "WI", "wyoming": "WY", "wyo.": "WY",
    "district of columbia": "DC", "d.c.": "DC",
  } as Record<string, string>,
} as const;

// ── Upsell Signals ──

export const UPSELL_CONFIG = {
  discountThresholds: {
    strong: 0.30,
    moderate: 0.20,
  },
  vintageYearsForStrongDiscount: 1,
  optimalInvoiceFrequencies: ["annually", "upfront"],
  strongInvoiceFrequencies: ["monthly", "quarterly"],
  moderateInvoiceFrequencies: ["semi-annually", "custom"],
} as const;

// ── GMV / Size Signal (Phase 1, static snapshot) ──
// GMV = T12 product spend from Luke's Customer Summary sheet.
// Micah's heuristic (4/9 + 4/15): GMV ≈ 30% of Annual Construction Revenue when right-sized.
// Outside 25-35% fires the Size signal (alongside the existing ENR delta) with two motions:
//   >35% → Reprice (AR likely stale)
//   <25% → Wallet Share (low Kojo penetration)
// Strong/moderate tiers measure band distance so we can blend with ENR delta via max().
export const GMV_CONFIG = {
  lowerBand: 0.25,
  upperBand: 0.35,
  distanceThresholds: { strong: 0.15, moderate: 0.05 },
} as const;
