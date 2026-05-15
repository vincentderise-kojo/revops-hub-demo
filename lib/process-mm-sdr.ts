import { Opportunity } from "./types";
import { QuotaRecord } from "./types-sdr";

import {
  ParsedCall,
  ParsedSdrSet,
  MmSdrState,
  NorthStarBenchmarks,
  NorthStarMetrics,
  ActivityMetricsRow,
  ActivityMetricsState,
  TargetingRow,
  TargetingState,
  SaoAcceptanceRow,
  SaoDetailEntry,
  RejectionLogEntry,
  SaoPipelineState,
  AcceptedSaoEntry,
  SaoQualityState,
} from "./types-mm-sdr";
import { MM_SDR_TARGETS, MANAGER_SEGMENT_MAP, ENT_REVENUE_THRESHOLD, SDR_ENT_QUOTA, SDR_TL_QUOTA } from "./config";

// ── Helpers ──

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function weekLabel(monday: Date): string {
  const end = new Date(monday);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${fmt(monday)}–${fmt(end)}`;
}

function monthKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function getFocusWeek(): { focusMonday: Date; focusSunday: Date } {
  const today = new Date();
  const todayDay = today.getDay();
  let endSunday: Date;
  if (todayDay === 0) {
    endSunday = new Date(today);
    endSunday.setDate(today.getDate() - 7);
  } else {
    endSunday = new Date(today);
    endSunday.setDate(today.getDate() - todayDay);
  }
  const focusMonday = new Date(endSunday);
  focusMonday.setDate(endSunday.getDate() - 6);
  focusMonday.setHours(0, 0, 0, 0);

  const focusSunday = new Date(focusMonday);
  focusSunday.setDate(focusMonday.getDate() + 6);
  focusSunday.setHours(23, 59, 59, 999);

  return { focusMonday, focusSunday };
}

function getWeekMonday(offset: number, focusMonday: Date): Date {
  const monday = new Date(focusMonday);
  monday.setDate(monday.getDate() - offset * 7);
  return monday;
}

function isInWeek(date: Date, monday: Date): boolean {
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return date >= monday && date <= sunday;
}

// ── Build MM Roster for a given month ──
// Custom roster builder that includes team leads with individual quotas (e.g., Valeria).
// buildSdrRoster excludes anyone who appears as ownerManager for other SDRs,
// which drops player-coaches. We build directly from quota records instead.

function getMmRoster(quotaRecords: QuotaRecord[], monthKey: string): Set<string> {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);

  // Find reps who have transitioned to AE
  const aeOwners = new Set(
    quotaRecords
      .filter((r) => {
        if (!r.isActive) return false;
        if (r.forecastingType.toLowerCase().includes("sdr")) return false;
        const nextMonthEnd = new Date(year, month, 31);
        return r.startDate <= nextMonthEnd && r.endDate >= monthStart;
      })
      .map((r) => r.ownerName)
  );

  // Identify managers: anyone who appears as ownerManager for other SDR records
  const sdrManagers = new Set(
    quotaRecords
      .filter((r) => r.forecastingType.toLowerCase().includes("sdr") && r.ownerManager)
      .map((r) => r.ownerManager)
  );

  const mmNames = new Set<string>();
  for (const r of quotaRecords) {
    if (!r.isActive) continue;
    const ft = r.forecastingType.toLowerCase();
    if (!ft.includes("sdr")) continue;
    if (ft.includes("manager")) continue; // exclude manager-level forecasting types
    if (aeOwners.has(r.ownerName)) continue; // transitioned to AE
    if (r.startDate > monthEnd || r.endDate < monthStart) continue; // not active this month

    // Exclude pure managers (like Sadie) but keep player-coaches (like Valeria)
    // Player-coaches have SDR_TL_QUOTA (5) — they manage others but carry their own number
    if (sdrManagers.has(r.ownerName) && r.quotaQuantity !== SDR_TL_QUOTA) continue;

    // Segment by quota quantity: 6 = ENT, anything else = MM
    if (r.quotaQuantity === SDR_ENT_QUOTA) continue; // ENT SDR, skip

    mmNames.add(r.ownerName);
  }

  return mmNames;
}

// ── Filter: MM outbound opps from pipeline ──

function filterMmOutboundOpps(opps: Opportunity[]): Opportunity[] {
  return opps.filter(
    (o) => o.segment === "MM" && o.oppSetType === "SDR Set - Outbound"
  );
}

// ── Filter: MM outbound sdrSets ──
// Uses same two-gate segmentation as pipeline: revenue threshold + AE manager override

function filterMmOutboundSdrSets(records: ParsedSdrSet[], entAEs: Set<string>): ParsedSdrSet[] {
  return records.filter(
    (r) => r.oppSetType === "SDR Set - Outbound" && isMmSdrSet(r, entAEs)
  );
}

function isMmSdrSet(r: ParsedSdrSet, entAEs: Set<string>): boolean {
  // Gate 2: AE manager override (wins on conflict, same as pipeline)
  if (r.assignedAE && entAEs.has(r.assignedAE)) return false;

  // Gate 1: Revenue threshold
  if (r.annualRevenue >= ENT_REVENUE_THRESHOLD) return false;

  return true;
}

// Build set of ENT AEs from pipeline data (anyone with an ENT manager)
function buildEntAeSet(allOpps: Opportunity[]): Set<string> {
  const entAEs = new Set<string>();
  for (const o of allOpps) {
    const managerSegment = MANAGER_SEGMENT_MAP[o.manager];
    if (managerSegment === "ENT" && o.owner) {
      entAEs.add(o.owner);
    }
  }
  return entAEs;
}

// ── North Star Metrics ──

function computeBenchmarks(
  mmOutboundOpps: Opportunity[],
  allOpps: Opportunity[],
  calls: ParsedCall[],
  mmRoster: Set<string>
): NorthStarBenchmarks {
  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

  // MM outbound SAOs in trailing 12 months
  const trailing12mo = mmOutboundOpps.filter((o) => o.discoveryDate >= twelveMonthsAgo);

  // Count weeks in the 12-month window
  const totalWeeks = 52;

  // Avg weekly SAOs
  const avgWeeklySaos12mo = trailing12mo.length / totalWeeks;

  // Eval conversion (12mo)
  const evalStages = ["Evaluation", "Contracts/Negotiation", "Final Approvals", "Closed Won"];
  const atEval12mo = trailing12mo.filter((o) => evalStages.includes(o.stage));
  const evalPct12mo = trailing12mo.length > 0 ? atEval12mo.length / trailing12mo.length : 0;

  // CW conversion (12mo)
  const cw12mo = trailing12mo.filter((o) => o.stage === "Closed Won");
  const cwPct12mo = trailing12mo.length > 0 ? cw12mo.length / trailing12mo.length : 0;

  // Cross-channel eval rate (all non-outbound MM opps)
  const otherChannelOpps = allOpps.filter(
    (o) => o.segment === "MM" && o.oppSetType !== "SDR Set - Outbound" && o.discoveryDate >= twelveMonthsAgo
  );
  const otherAtEval = otherChannelOpps.filter((o) => evalStages.includes(o.stage));
  const evalPctOtherChannels = otherChannelOpps.length > 0 ? otherAtEval.length / otherChannelOpps.length : 0;

  // Dials per SAO (from calls tab — MM roster calls in trailing 12mo vs SAOs)
  const mmCalls12mo = calls.filter((c) => mmRoster.has(c.sdrName) && c.date >= twelveMonthsAgo);
  const dialsPerSao = trailing12mo.length > 0 ? mmCalls12mo.length / trailing12mo.length : 0;

  return {
    avgWeeklySaos12mo: Math.round(avgWeeklySaos12mo * 10) / 10,
    evalPct12mo,
    cwPct12mo,
    evalPctOtherChannels,
    dialsPerSao: Math.round(dialsPerSao),
    totalWeeks,
  };
}

function computeNorthStars(
  mmOutboundOpps: Opportunity[],
  allOpps: Opportunity[],
  calls: ParsedCall[],
  mmRoster: Set<string>,
  focusMonday: Date
): NorthStarMetrics {
  const benchmarks = computeBenchmarks(mmOutboundOpps, allOpps, calls, mmRoster);
  // Volume
  const weeklyCounts: number[] = [];
  for (let i = 0; i < 5; i++) {
    const monday = getWeekMonday(i, focusMonday);
    const count = mmOutboundOpps.filter((o) => isInWeek(o.discoveryDate, monday)).length;
    weeklyCounts.push(count);
  }
  const [thisWeek, lastWeek] = weeklyCounts;
  const fourWeekAvg =
    weeklyCounts.slice(1, 5).reduce((s, n) => s + n, 0) / Math.max(weeklyCounts.slice(1, 5).length, 1);

  const volume = {
    saosThisWeek: thisWeek,
    saosLastWeek: lastWeek,
    fourWeekAvg: Math.round(fourWeekAvg * 10) / 10,
    target: MM_SDR_TARGETS.saosPerWeek,
  };

  // Quality — Eval+ conversion
  // Lookback: all opps from the last 12 weeks for a stable denominator
  const qualityLookbackMonday = getWeekMonday(11, focusMonday);
  const qualityOpps = mmOutboundOpps.filter(
    (o) => o.discoveryDate >= qualityLookbackMonday
  );

  const evalStages = ["Evaluation", "Contracts/Negotiation", "Final Approvals", "Closed Won"];
  const atEval = qualityOpps.filter((o) => evalStages.includes(o.stage));

  // Weekly eval counts + created counts for this week + 4 prior
  const weeklyEvalCounts: number[] = [];
  const weeklyCreatedCounts: number[] = [];
  for (let i = 0; i < 5; i++) {
    const monday = getWeekMonday(i, focusMonday);
    const created = mmOutboundOpps.filter((o) => isInWeek(o.discoveryDate, monday));
    const evalCount = created.filter((o) => evalStages.includes(o.stage)).length;
    weeklyEvalCounts.push(evalCount);
    weeklyCreatedCounts.push(created.length);
  }
  const evalFourWeekAvg =
    weeklyEvalCounts.slice(1, 5).reduce((s, n) => s + n, 0) / Math.max(weeklyEvalCounts.slice(1, 5).length, 1);
  const createdFourWeekAvg =
    weeklyCreatedCounts.slice(1, 5).reduce((s, n) => s + n, 0) / Math.max(weeklyCreatedCounts.slice(1, 5).length, 1);

  const quality = {
    saosAtEvalThisWeek: weeklyEvalCounts[0],
    saosCreatedThisWeek: weeklyCreatedCounts[0],
    saosAtEvalFourWeekAvg: Math.round(evalFourWeekAvg * 10) / 10,
    saosCreatedFourWeekAvg: Math.round(createdFourWeekAvg * 10) / 10,
    evalConversionPct: qualityOpps.length > 0 ? atEval.length / qualityOpps.length : 0,
    totalSaosInPeriod: qualityOpps.length,
  };

  // Outcome — trailing 90 days
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
  const trailing90 = mmOutboundOpps.filter((o) => o.discoveryDate >= ninetyDaysAgo);
  const cw90 = trailing90.filter((o) => o.stage === "Closed Won");

  const outcome = {
    cwCount90d: cw90.length,
    cwRate90d: trailing90.length > 0 ? cw90.length / trailing90.length : 0,
    cwTarget: MM_SDR_TARGETS.cwConversionTarget,
    totalSaos90d: trailing90.length,
  };

  return { benchmarks, volume, quality, outcome };
}

// ── Activity Metrics (Section 2) ──

function computeActivityMetrics(
  calls: ParsedCall[],
  sdrSets: ParsedSdrSet[],
  mmOutboundOpps: Opportunity[],
  mmRosterCurrent: Set<string>,
  mmRosterPrior: Set<string>,
  entAEs: Set<string>,
  focusMonday: Date
): ActivityMetricsState {
  const focusSunday = new Date(focusMonday);
  focusSunday.setDate(focusMonday.getDate() + 6);
  focusSunday.setHours(23, 59, 59, 999);

  const priorMonday = getWeekMonday(1, focusMonday);
  const priorSunday = new Date(priorMonday);
  priorSunday.setDate(priorMonday.getDate() + 6);
  priorSunday.setHours(23, 59, 59, 999);

  // Filter MM outbound sdrSets for "Sets" column
  const mmOutboundSets = filterMmOutboundSdrSets(sdrSets, entAEs);

  function buildRow(sdrName: string, weekMonday: Date, weekSunday: Date): ActivityMetricsRow {
    // Calls: filtered by roster
    const sdrCalls = calls.filter(
      (c) => c.sdrName === sdrName && c.date >= weekMonday && c.date <= weekSunday
    );
    const callsMade = sdrCalls.length;
    const connects = sdrCalls.filter((c) => c.isConnect).length;

    // Sets: filtered by sdrSets fields (Account Segment + Opp Set Type)
    const sdrSetsInWeek = mmOutboundSets.filter(
      (s) => s.sdrOwner === sdrName && s.qualSetDate >= weekMonday && s.qualSetDate <= weekSunday
    );
    const sets = sdrSetsInWeek.length;

    // Meetings held = sets for now (v1, no cancellation tracking)
    const meetingsHeld = sets;

    // SAOs: filtered by pipeline opp-level attributes
    const sdrSaos = mmOutboundOpps.filter(
      (o) => o.sdrOwner === sdrName && isInWeek(o.discoveryDate, weekMonday)
    );
    const saosCreated = sdrSaos.length;

    return {
      sdrName,
      callsMade,
      connects,
      connectRate: callsMade > 0 ? connects / callsMade : 0,
      sets,
      setRate: connects > 0 ? sets / connects : 0,
      meetingsHeld,
      meetingHoldRate: sets > 0 ? meetingsHeld / sets : 0,
      saosCreated,
      saoRate: meetingsHeld > 0 ? saosCreated / meetingsHeld : 0,
    };
  }

  // Build rows for each current roster member
  const rosterNames = Array.from(mmRosterCurrent).sort();
  const rows = rosterNames.map((name) =>
    buildRow(name, focusMonday, focusSunday)
  );

  // Team total
  const teamTotal: ActivityMetricsRow = {
    sdrName: "Team Total",
    callsMade: rows.reduce((s, r) => s + r.callsMade, 0),
    connects: rows.reduce((s, r) => s + r.connects, 0),
    connectRate: 0,
    sets: rows.reduce((s, r) => s + r.sets, 0),
    setRate: 0,
    meetingsHeld: rows.reduce((s, r) => s + r.meetingsHeld, 0),
    meetingHoldRate: 0,
    saosCreated: rows.reduce((s, r) => s + r.saosCreated, 0),
    saoRate: 0,
  };
  teamTotal.connectRate = teamTotal.callsMade > 0 ? teamTotal.connects / teamTotal.callsMade : 0;
  teamTotal.setRate = teamTotal.connects > 0 ? teamTotal.sets / teamTotal.connects : 0;
  teamTotal.meetingHoldRate = teamTotal.sets > 0 ? teamTotal.meetingsHeld / teamTotal.sets : 0;
  teamTotal.saoRate = teamTotal.meetingsHeld > 0 ? teamTotal.saosCreated / teamTotal.meetingsHeld : 0;

  // WoW: compute prior week totals using prior roster
  const priorRosterNames = Array.from(mmRosterPrior);
  const priorRows = priorRosterNames.map((name) =>
    buildRow(name, priorMonday, priorSunday)
  );
  const priorTotal = {
    callsMade: priorRows.reduce((s, r) => s + r.callsMade, 0),
    connects: priorRows.reduce((s, r) => s + r.connects, 0),
    sets: priorRows.reduce((s, r) => s + r.sets, 0),
    saosCreated: priorRows.reduce((s, r) => s + r.saosCreated, 0),
  };
  const priorConnectRate = priorTotal.callsMade > 0 ? priorTotal.connects / priorTotal.callsMade : 0;

  const wow = {
    callsMade: teamTotal.callsMade - priorTotal.callsMade,
    connects: teamTotal.connects - priorTotal.connects,
    connectRate: teamTotal.connectRate - priorConnectRate,
    sets: teamTotal.sets - priorTotal.sets,
    saosCreated: teamTotal.saosCreated - priorTotal.saosCreated,
  };

  return { rows, teamTotal, wow };
}

// ── Account Targeting (Section 3) ──

function computeTargeting(
  calls: ParsedCall[],
  mmRosterCurrent: Set<string>,
  focusMonday: Date
): TargetingState {
  const focusSunday = new Date(focusMonday);
  focusSunday.setDate(focusMonday.getDate() + 6);
  focusSunday.setHours(23, 59, 59, 999);

  const thirtyDaysAgo = new Date(focusSunday);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // All calls from MM roster SDRs (full history for "no activity 30d" baseline)
  const mmCalls = calls.filter((c) => mmRosterCurrent.has(c.sdrName));

  function buildRow(sdrName: string): TargetingRow {
    // This week's calls for this SDR
    const weekCalls = mmCalls.filter(
      (c) => c.sdrName === sdrName && c.date >= focusMonday && c.date <= focusSunday
    );

    // Group by account
    const accountContacts = new Map<string, Set<string>>();
    for (const call of weekCalls) {
      if (!call.accountId) continue;
      if (!accountContacts.has(call.accountId)) accountContacts.set(call.accountId, new Set());
      if (call.contactName) accountContacts.get(call.accountId)!.add(call.contactName);
    }

    const uniqueAccountsTouched = accountContacts.size;
    const totalContacts = Array.from(accountContacts.values()).reduce((s, set) => s + set.size, 0);
    const avgContactsPerAccount = uniqueAccountsTouched > 0 ? totalContacts / uniqueAccountsTouched : 0;
    const accountsWith1Contact = Array.from(accountContacts.values()).filter((s) => s.size === 1).length;
    const accountsWith3Plus = Array.from(accountContacts.values()).filter((s) => s.size >= 3).length;

    // Accounts with no activity 30+ days (baseline: all accounts this SDR ever called)
    const allSdrCalls = mmCalls.filter((c) => c.sdrName === sdrName && c.accountId);
    const allAccounts = new Set(allSdrCalls.map((c) => c.accountId));
    const recentAccounts = new Set(
      allSdrCalls.filter((c) => c.date >= thirtyDaysAgo).map((c) => c.accountId)
    );
    const accountsNoActivity30d = Array.from(allAccounts).filter((a) => !recentAccounts.has(a)).length;

    return {
      sdrName,
      uniqueAccountsTouched,
      avgContactsPerAccount: Math.round(avgContactsPerAccount * 10) / 10,
      accountsWith1Contact,
      accountsWith3PlusContacts: accountsWith3Plus,
      accountsNoActivity30d,
    };
  }

  const rosterNames = Array.from(mmRosterCurrent).sort();
  const rows = rosterNames.map(buildRow);

  const teamTotal: TargetingRow = {
    sdrName: "Team Total",
    uniqueAccountsTouched: rows.reduce((s, r) => s + r.uniqueAccountsTouched, 0),
    avgContactsPerAccount: 0,
    accountsWith1Contact: rows.reduce((s, r) => s + r.accountsWith1Contact, 0),
    accountsWith3PlusContacts: rows.reduce((s, r) => s + r.accountsWith3PlusContacts, 0),
    accountsNoActivity30d: rows.reduce((s, r) => s + r.accountsNoActivity30d, 0),
  };
  const totalAccounts = rows.reduce((s, r) => s + r.uniqueAccountsTouched, 0);
  const totalContacts = rows.reduce((s, r) => s + r.uniqueAccountsTouched * r.avgContactsPerAccount, 0);
  teamTotal.avgContactsPerAccount = totalAccounts > 0
    ? Math.round((totalContacts / totalAccounts) * 10) / 10
    : 0;

  return { rows, teamTotal };
}

// ── SAO Pipeline (Section 4) ──

function computeSaoPipeline(
  sdrSets: ParsedSdrSet[],
  entAEs: Set<string>,
  focusMonday: Date
): SaoPipelineState {
  const focusSunday = new Date(focusMonday);
  focusSunday.setDate(focusMonday.getDate() + 6);
  focusSunday.setHours(23, 59, 59, 999);

  const mmOutboundSets = filterMmOutboundSdrSets(sdrSets, entAEs).filter(
    (s) => s.qualSetDate >= focusMonday && s.qualSetDate <= focusSunday
  );

  // Group by AE
  const byAe = new Map<string, ParsedSdrSet[]>();
  for (const s of mmOutboundSets) {
    const ae = s.assignedAE || "Unassigned";
    if (!byAe.has(ae)) byAe.set(ae, []);
    byAe.get(ae)!.push(s);
  }

  const acceptanceSummary: SaoAcceptanceRow[] = [];
  const rejectionLog: RejectionLogEntry[] = [];

  for (const [ae, records] of byAe) {
    const rejected = records.filter((r) => r.salesRejectedReason);
    const accepted = records.filter(
      (r) => !r.salesRejectedReason && r.stage !== "Discovery" && r.stage !== ""
    );
    const pending = records.length - accepted.length - rejected.length;

    acceptanceSummary.push({
      aeName: ae,
      saosReceived: records.length,
      accepted: accepted.length,
      rejected: rejected.length,
      acceptanceRate: records.length > 0 ? accepted.length / records.length : 0,
      pending,
    });

    for (const r of rejected) {
      rejectionLog.push({
        oppName: r.oppName,
        ae: r.assignedAE,
        sdr: r.sdrOwner,
        rejectionReason: r.salesRejectedReason,
        notes: r.salesRejectedNotes,
      });
    }
  }

  // Sort by SAOs received descending
  acceptanceSummary.sort((a, b) => b.saosReceived - a.saosReceived);

  const teamTotal: SaoAcceptanceRow = {
    aeName: "Team Total",
    saosReceived: acceptanceSummary.reduce((s, r) => s + r.saosReceived, 0),
    accepted: acceptanceSummary.reduce((s, r) => s + r.accepted, 0),
    rejected: acceptanceSummary.reduce((s, r) => s + r.rejected, 0),
    acceptanceRate: 0,
    pending: acceptanceSummary.reduce((s, r) => s + r.pending, 0),
  };
  teamTotal.acceptanceRate =
    teamTotal.saosReceived > 0 ? teamTotal.accepted / teamTotal.saosReceived : 0;

  // Build detail log — every record with opp link, amount, date, status
  const detailLog: SaoDetailEntry[] = mmOutboundSets.map((r) => {
    let status: SaoDetailEntry["status"];
    if (r.salesRejectedReason) {
      status = "Rejected";
    } else if (r.stage !== "Discovery" && r.stage !== "") {
      status = "Accepted";
    } else {
      status = "Pending";
    }
    return {
      oppName: r.oppName,
      oppId: r.oppId,
      ae: r.assignedAE,
      sdr: r.sdrOwner,
      amount: r.amount,
      qualSetDate: r.qualSetDate.toISOString(),
      stage: r.stage,
      status,
      rejectionReason: r.salesRejectedReason,
    };
  });

  return { acceptanceSummary, teamTotal, detailLog, rejectionLog };
}

// ── SAO Quality (Section 5) ──

function computeSaoQuality(
  mmOutboundOpps: Opportunity[],
  calls: ParsedCall[],
  focusMonday: Date
): SaoQualityState {
  const focusSunday = new Date(focusMonday);
  focusSunday.setDate(focusMonday.getDate() + 6);
  focusSunday.setHours(23, 59, 59, 999);

  // Accepted = in pipeline, not Closed Lost
  const accepted = mmOutboundOpps.filter(
    (o) =>
      o.discoveryDate >= focusMonday &&
      o.discoveryDate <= focusSunday &&
      o.stage !== "Closed Lost"
  );

  // Build account name → most recent contact title lookup from calls
  // Using account name as join key (fuzzy but best available — no shared Account ID between pipeline and calls)
  const accountTitleMap = new Map<string, string>();
  for (const call of calls) {
    if (call.accountName && call.contactTitle) {
      accountTitleMap.set(call.accountName.toLowerCase(), call.contactTitle);
    }
  }

  const acceptedSaos: AcceptedSaoEntry[] = accepted.map((o) => ({
    oppName: o.name,
    ae: o.owner,
    company: o.accountName,
    industry: o.industry,
    entryPointTitle: accountTitleMap.get(o.accountName.toLowerCase()) || "—",
    amount: o.amount,
  }));

  return { acceptedSaos };
}

// ── Main Processor ──

export function processMmSdr(
  allOpps: Opportunity[],
  calls: ParsedCall[],
  sdrSets: ParsedSdrSet[],
  quotaRecords: QuotaRecord[],
  weekOffset: number = 0
): MmSdrState {
  let focusMonday: Date;
  let focusSunday: Date;

  if (weekOffset === -1) {
    // Current in-progress week
    const today = new Date();
    const todayDay = today.getDay();
    focusMonday = new Date(today);
    focusMonday.setDate(today.getDate() - (todayDay === 0 ? 6 : todayDay - 1));
    focusMonday.setHours(0, 0, 0, 0);
    focusSunday = new Date(focusMonday);
    focusSunday.setDate(focusMonday.getDate() + 6);
    focusSunday.setHours(23, 59, 59, 999);
  } else {
    // Last complete week (offset 0) or further back
    const result = getFocusWeek();
    focusMonday = result.focusMonday;
    focusSunday = result.focusSunday;
    if (weekOffset > 0) {
      focusMonday.setDate(focusMonday.getDate() - weekOffset * 7);
      focusSunday.setDate(focusSunday.getDate() - weekOffset * 7);
    }
  }
  const focusLabel = weekLabel(focusMonday);
  const currentMonthKey = monthKeyFromDate(focusMonday);
  const priorMonday = getWeekMonday(1, focusMonday);
  const priorMonthKey = monthKeyFromDate(priorMonday);

  // Build MM rosters
  const mmRosterCurrent = getMmRoster(quotaRecords, currentMonthKey);
  const mmRosterPrior = getMmRoster(quotaRecords, priorMonthKey);
  const mmRosterNames = Array.from(mmRosterCurrent).sort();

  // Filter pipeline to MM outbound
  const mmOutboundOpps = filterMmOutboundOpps(allOpps);

  // Build ENT AE set for sdrSets filtering (manager-based override)
  const entAEs = buildEntAeSet(allOpps);

  // Compute all sections
  const northStars = computeNorthStars(mmOutboundOpps, allOpps, calls, mmRosterCurrent, focusMonday);
  const activity = computeActivityMetrics(
    calls, sdrSets, mmOutboundOpps, mmRosterCurrent, mmRosterPrior, entAEs, focusMonday
  );
  const targeting = computeTargeting(calls, mmRosterCurrent, focusMonday);
  const saoPipeline = computeSaoPipeline(sdrSets, entAEs, focusMonday);
  const saoQuality = computeSaoQuality(mmOutboundOpps, calls, focusMonday);

  return {
    focusWeekLabel: focusLabel,
    focusWeekStart: focusMonday.toISOString(),
    focusWeekEnd: focusSunday.toISOString(),
    mmRoster: mmRosterNames,
    northStars,
    activity,
    targeting,
    saoPipeline,
    saoQuality,
  };
}
