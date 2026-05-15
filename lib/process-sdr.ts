import { Opportunity } from "./types";
import {
  QuotaRecord,
  SdrMeeting,
  SdrRosterEntry,
  SdrWeekCell,
  SdrHeatmapRow,
  SdrRepDetail,
  SdrFunnelRow,
  SdrPerformanceState,
} from "./types-sdr";
import {
  WEEKS_PER_MONTH,
  SDR_ENT_QUOTA,
  SDR_TL_QUOTA,
} from "./config";
import { fmtK } from "./format";

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
  const fmt = (d: Date) =>
    `${d.getMonth() + 1}/${d.getDate()}`;
  return `${fmt(monday)}–${fmt(end)}`;
}

function getQuarterStart(d: Date): Date {
  const month = d.getMonth();
  const qStartMonth = month - (month % 3);
  return new Date(d.getFullYear(), qStartMonth, 1);
}

function weeksElapsedInQuarter(now: Date): number {
  const qStart = getQuarterStart(now);
  const diff = now.getTime() - qStart.getTime();
  return Math.max(1, Math.ceil(diff / (7 * 86_400_000)));
}

function monthKeyFromDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── Build SDR Roster from Quota Records ──

export function buildSdrRoster(records: QuotaRecord[], monthKey: string): SdrRosterEntry[] {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);

  // Find reps who have transitioned to AE — they have an AE quota in the
  // current or next month. Exclude them from the SDR roster even if their
  // SDR quota still overlaps the current month.
  const aeOwners = new Set(
    records
      .filter((r) => {
        if (!r.isActive) return false;
        if (r.forecastingType.toLowerCase().includes("sdr")) return false;
        // Check current month or next month overlap
        const nextMonthEnd = new Date(year, month, 31);
        return r.startDate <= nextMonthEnd && r.endDate >= monthStart;
      })
      .map((r) => r.ownerName)
  );

  // Identify managers: anyone who appears as ownerManager for other SDR records
  const sdrManagers = new Set(
    records
      .filter((r) => r.forecastingType.toLowerCase().includes("sdr") && r.ownerManager)
      .map((r) => r.ownerManager)
  );

  const sdrRecords = records.filter((r) => {
    if (!r.isActive) return false;
    const ft = r.forecastingType.toLowerCase();
    if (!ft.includes("sdr")) return false;
    if (ft.includes("manager")) return false; // exclude by forecasting type name
    if (sdrManagers.has(r.ownerName)) return false; // exclude anyone who manages SDRs
    if (aeOwners.has(r.ownerName)) return false; // transitioned to AE
    if (r.quotaQuantity === 0) return false; // departures (Marcus) + team transfers (Valeria) zero out their quota
    return r.startDate <= monthEnd && r.endDate >= monthStart;
  });

  return sdrRecords.map((r) => {
    const qty = r.quotaQuantity;
    let segment: "MM" | "ENT";
    let isTeamLead = false;

    if (qty === SDR_ENT_QUOTA) {
      segment = "ENT";
    } else if (qty === SDR_TL_QUOTA) {
      segment = "MM";
      isTeamLead = true;
    } else {
      segment = "MM";
    }

    return {
      name: r.ownerName,
      segment,
      monthlyQuota: qty,
      status: r.isRamping ? "Ramping" as const : "Ramped" as const,
      manager: r.ownerManager,
      isTeamLead,
    };
  });
}

// ── Group Items by SDR + Week ──

function groupByWeek<T>(
  items: T[],
  getDate: (item: T) => Date,
  getSdr: (item: T) => string,
  focusMonday: Date,
  numWeeks: number
): Map<string, Map<string, T[]>> {
  const result = new Map<string, Map<string, T[]>>();

  const weeks: { monday: Date; label: string }[] = [];
  for (let i = numWeeks - 1; i >= 0; i--) {
    const monday = new Date(focusMonday);
    monday.setDate(monday.getDate() - i * 7);
    weeks.push({ monday, label: weekLabel(monday) });
  }

  for (const item of items) {
    const date = getDate(item);
    const sdr = getSdr(item);
    if (!sdr) continue;

    const itemMonday = getMonday(date);

    const matchingWeek = weeks.find(
      (w) => w.monday.getTime() === itemMonday.getTime()
    );
    if (!matchingWeek) continue;

    if (!result.has(sdr)) result.set(sdr, new Map());
    const sdrMap = result.get(sdr)!;
    if (!sdrMap.has(matchingWeek.label)) sdrMap.set(matchingWeek.label, []);
    sdrMap.get(matchingWeek.label)!.push(item);
  }

  return result;
}

// ── Main Processor ──

export function processSdrPerformance(
  allOpps: Opportunity[],
  meetings: SdrMeeting[],
  quotaRecords: QuotaRecord[]
): SdrPerformanceState {
  // Focus week = last complete Mon-Sun relative to today
  const today = new Date();
  const todayDay = today.getDay(); // 0=Sun, 1=Mon, ...
  let endSunday: Date;
  if (todayDay === 0) {
    // Today is Sunday — last complete week ended yesterday (this Sunday is still "today")
    endSunday = new Date(today);
    endSunday.setDate(today.getDate() - 7);
  } else {
    // Most recent past Sunday
    endSunday = new Date(today);
    endSunday.setDate(today.getDate() - todayDay);
  }
  const focusMonday = new Date(endSunday);
  focusMonday.setDate(endSunday.getDate() - 6);
  focusMonday.setHours(0, 0, 0, 0);

  const focusLabel = weekLabel(focusMonday);
  const currentMonthKey = monthKeyFromDate(focusMonday);
  const NUM_WEEKS = 7;

  const roster = buildSdrRoster(quotaRecords, currentMonthKey);
  // Count ALL opps where SDR Owner is populated — SDRs work across source channels
  const sdrOpps = allOpps.filter((o) => o.sdrOwner);

  // ── Monthly Attainment (Sadie's team) ──
  // Numerator: sum of SAO Points Calculation on sdrSets where Meeting Held Date is in current month
  // Denominator: sum of monthlyQuota across full roster (ramped + ramping, MM + ENT)
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const monthLabel = monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const rosterNames = new Set(roster.map((r) => r.name));
  const monthlyQuotaTotal = roster.reduce((s, e) => s + e.monthlyQuota, 0);
  const monthlySaoTotal = meetings.reduce((sum, m) => {
    if (!m.meetingHeldDate) return sum;
    if (m.meetingHeldDate < monthStart || m.meetingHeldDate > monthEnd) return sum;
    if (!rosterNames.has(m.sdrOwner)) return sum;
    return sum + m.saoPoints;
  }, 0);
  const monthlyAttainment = {
    monthLabel,
    totalQuota: monthlyQuotaTotal,
    totalSaos: monthlySaoTotal,
    attainmentPercent: monthlyQuotaTotal > 0 ? (monthlySaoTotal / monthlyQuotaTotal) * 100 : 0,
  };

  const weekLabels: string[] = [];
  for (let i = NUM_WEEKS - 1; i >= 0; i--) {
    const monday = new Date(focusMonday);
    monday.setDate(monday.getDate() - i * 7);
    weekLabels.push(weekLabel(monday));
  }

  const saosByWeek = groupByWeek(
    sdrOpps,
    (o) => o.discoveryDate,
    (o) => o.sdrOwner,
    focusMonday,
    NUM_WEEKS
  );

  const meetingsByWeek = groupByWeek(
    meetings,
    (m) => m.qualificationSetDate,
    (m) => m.sdrOwner,
    focusMonday,
    NUM_WEEKS
  );

  // Use end of focus week (Sunday) as the reference for QTD calculations
  const focusSunday = new Date(focusMonday);
  focusSunday.setDate(focusMonday.getDate() + 6);
  const qStart = getQuarterStart(focusSunday);
  const weeksInQ = weeksElapsedInQuarter(focusSunday);

  const qtdSaos = new Map<string, number>();
  const qtdPipeline = new Map<string, number>();
  const qtdMeetings = new Map<string, number>();
  const cwDollars = new Map<string, number>();

  for (const opp of sdrOpps) {
    const sdr = opp.sdrOwner;
    if (opp.discoveryDate >= qStart) {
      qtdSaos.set(sdr, (qtdSaos.get(sdr) || 0) + 1);
      qtdPipeline.set(sdr, (qtdPipeline.get(sdr) || 0) + opp.amount);
    }
    if (opp.stage === "Closed Won" && opp.discoveryDate >= qStart) {
      cwDollars.set(sdr, (cwDollars.get(sdr) || 0) + opp.amount);
    }
  }

  for (const meeting of meetings) {
    if (meeting.qualificationSetDate >= qStart) {
      qtdMeetings.set(
        meeting.sdrOwner,
        (qtdMeetings.get(meeting.sdrOwner) || 0) + 1
      );
    }
  }

  // ── SAO Points by SDR (quota-attainment view) ──
  // Mirrors how Sadie's monthly attainment is measured: sum of SAO Points Calculation
  // on sdrSets, anchored on Meeting Held Date. Used for Rep Detail pace + row status.
  const qtdSaoPoints = new Map<string, number>();
  const weeklySaoPoints = new Map<string, Map<string, number>>(); // sdr -> weekLabel -> points
  for (const meeting of meetings) {
    if (!meeting.meetingHeldDate) continue;
    const sdr = meeting.sdrOwner;
    if (meeting.meetingHeldDate >= qStart) {
      qtdSaoPoints.set(sdr, (qtdSaoPoints.get(sdr) || 0) + meeting.saoPoints);
    }
    const monday = getMonday(meeting.meetingHeldDate);
    const wl = weekLabels.find((l) => l === weekLabel(monday));
    if (!wl) continue;
    if (!weeklySaoPoints.has(sdr)) weeklySaoPoints.set(sdr, new Map());
    const m = weeklySaoPoints.get(sdr)!;
    m.set(wl, (m.get(wl) || 0) + meeting.saoPoints);
  }

  function buildHeatmapRow(entry: SdrRosterEntry): SdrHeatmapRow {
    const sdrSaos = saosByWeek.get(entry.name) || new Map();
    const sdrMeetings = meetingsByWeek.get(entry.name) || new Map();
    const weeklyPace = entry.monthlyQuota / WEEKS_PER_MONTH;

    const weeks: SdrWeekCell[] = weekLabels.map((wl) => {
      const saos = sdrSaos.get(wl) || [];
      const mtgs = sdrMeetings.get(wl) || [];
      return {
        weekLabel: wl,
        saoCount: saos.length,
        pipelineDollars: (saos as Opportunity[]).reduce((sum, o) => sum + o.amount, 0),
        meetingsSet: mtgs.length,
        isCurrentWeek: wl === focusLabel,
      };
    });

    const completedWeeks = weeks.slice(0, -1).slice(-4);
    const rollingAvgSao =
      completedWeeks.length > 0
        ? completedWeeks.reduce((s, w) => s + w.saoCount, 0) / completedWeeks.length
        : 0;
    const rollingAvgPipeline =
      completedWeeks.length > 0
        ? completedWeeks.reduce((s, w) => s + w.pipelineDollars, 0) / completedWeeks.length
        : 0;

    let status: SdrHeatmapRow["status"];
    if (entry.status === "Ramping") {
      status = "Ramping";
    } else {
      // Status compares SAO Points (Meeting Held Date) to points-denominated pace,
      // matching the units of monthlyQuota.
      const qtd = qtdSaoPoints.get(entry.name) || 0;
      const reqQtd = (entry.monthlyQuota / WEEKS_PER_MONTH) * weeksInQ;
      const pct = reqQtd > 0 ? (qtd / reqQtd) * 100 : 100;
      if (pct >= 90) status = "On Pace";
      else if (pct >= 75) status = "At Risk";
      else status = "Behind";
    }

    void weeklyPace; // used for context only

    return {
      sdrName: entry.name,
      segment: entry.segment,
      status,
      isTeamLead: entry.isTeamLead,
      monthlyQuota: entry.monthlyQuota,
      weeks,
      rollingAvgSao,
      rollingAvgPipeline,
    };
  }

  const allRows = roster.map(buildHeatmapRow);
  const mmRows = allRows.filter((r) => r.segment === "MM" && r.status !== "Ramping");
  const entRows = allRows.filter((r) => r.segment === "ENT" && r.status !== "Ramping");
  const rampingRows = allRows.filter((r) => r.status === "Ramping");

  function buildSubtotals(rows: SdrHeatmapRow[]): SdrWeekCell[] {
    return weekLabels.map((wl, idx) => ({
      weekLabel: wl,
      saoCount: rows.reduce((s, r) => s + r.weeks[idx].saoCount, 0),
      pipelineDollars: rows.reduce((s, r) => s + r.weeks[idx].pipelineDollars, 0),
      meetingsSet: rows.reduce((s, r) => s + r.weeks[idx].meetingsSet, 0),
      isCurrentWeek: wl === focusLabel,
    }));
  }

  function buildRepDetail(entry: SdrRosterEntry): SdrRepDetail {
    const row = allRows.find((r) => r.sdrName === entry.name)!;
    const weeklyPace = entry.monthlyQuota / WEEKS_PER_MONTH;

    // All Rep Detail numerics use SAO Points anchored on Meeting Held Date
    // so they're apples-to-apples with the points-denominated monthly quota.
    const wpMap = weeklySaoPoints.get(entry.name);
    const focusWeekPts = wpMap?.get(focusLabel) || 0;
    const completedWeekLabels = weekLabels.slice(-5, -1); // 4 weeks before focus
    const last4WeeksPts = completedWeekLabels.reduce(
      (s, wl) => s + (wpMap?.get(wl) || 0),
      0
    );
    const avgPerWeek = completedWeekLabels.length > 0
      ? last4WeeksPts / completedWeekLabels.length
      : 0;

    const qtd = qtdSaoPoints.get(entry.name) || 0;
    const reqQtd = entry.status === "Ramping" ? 0 : weeklyPace * weeksInQ;
    const gap = entry.status === "Ramping" ? 0 : qtd - reqQtd;
    const pacePercent = reqQtd > 0 ? (qtd / reqQtd) * 100 : 0;

    return {
      sdrName: entry.name,
      segment: entry.segment,
      monthlyQuota: entry.monthlyQuota,
      reqPerWeek: weeklyPace,
      thisWeekSaos: focusWeekPts,
      avgPerWeek,
      qtdSaos: qtd,
      reqQtd: Math.round(reqQtd),
      gap,
      pacePercent: Math.round(pacePercent),
      status: row.status,
    };
  }

  const mmDetails = roster.filter((e) => e.segment === "MM" && e.status !== "Ramping").map(buildRepDetail);
  const entDetails = roster.filter((e) => e.segment === "ENT" && e.status !== "Ramping").map(buildRepDetail);
  const rampingDetails = roster.filter((e) => e.status === "Ramping").map(buildRepDetail);

  function sumRepDetails(details: SdrRepDetail[], label: string): SdrRepDetail {
    return {
      sdrName: label,
      segment: "MM",
      monthlyQuota: details.reduce((s, d) => s + d.monthlyQuota, 0),
      reqPerWeek: details.reduce((s, d) => s + d.reqPerWeek, 0),
      thisWeekSaos: details.reduce((s, d) => s + d.thisWeekSaos, 0),
      avgPerWeek: details.reduce((s, d) => s + d.avgPerWeek, 0),
      qtdSaos: details.reduce((s, d) => s + d.qtdSaos, 0),
      reqQtd: details.reduce((s, d) => s + d.reqQtd, 0),
      gap: details.reduce((s, d) => s + d.gap, 0),
      pacePercent:
        details.reduce((s, d) => s + d.reqQtd, 0) > 0
          ? Math.round(
              (details.reduce((s, d) => s + d.qtdSaos, 0) /
                details.reduce((s, d) => s + d.reqQtd, 0)) *
                100
            )
          : 0,
      status: "On Pace",
    };
  }

  function buildFunnelRow(entry: SdrRosterEntry): SdrFunnelRow {
    const mSet = qtdMeetings.get(entry.name) || 0;
    const saoCount = qtdSaos.get(entry.name) || 0;
    const pipeline = qtdPipeline.get(entry.name) || 0;
    const cw = cwDollars.get(entry.name) || 0;

    return {
      sdrName: entry.name,
      segment: entry.segment,
      meetingsSet: mSet,
      saos: saoCount,
      conversionRate: mSet > 0 ? saoCount / mSet : 0,
      pipelineDollars: pipeline,
      avgDealSize: saoCount > 0 ? pipeline / saoCount : 0,
      closedWonDollars: cw,
    };
  }

  const rampedRoster = roster.filter((e) => e.status !== "Ramping");
  const mmFunnel = rampedRoster.filter((e) => e.segment === "MM").map(buildFunnelRow);
  const entFunnel = rampedRoster.filter((e) => e.segment === "ENT").map(buildFunnelRow);

  function sumFunnelRows(rows: SdrFunnelRow[], label: string, segment: "MM" | "ENT"): SdrFunnelRow {
    const mSet = rows.reduce((s, r) => s + r.meetingsSet, 0);
    const saos = rows.reduce((s, r) => s + r.saos, 0);
    const pipeline = rows.reduce((s, r) => s + r.pipelineDollars, 0);
    const cw = rows.reduce((s, r) => s + r.closedWonDollars, 0);
    return {
      sdrName: label,
      segment,
      meetingsSet: mSet,
      saos,
      conversionRate: mSet > 0 ? saos / mSet : 0,
      pipelineDollars: pipeline,
      avgDealSize: saos > 0 ? pipeline / saos : 0,
      closedWonDollars: cw,
    };
  }

  const mmFunnelTotals = sumFunnelRows(mmFunnel, "MM Total", "MM");
  const entFunnelTotals = sumFunnelRows(entFunnel, "ENT Total", "ENT");
  const teamFunnelTotal = sumFunnelRows([...mmFunnel, ...entFunnel], "Team Total", "MM");

  const thisWeekIdx = weekLabels.length - 1;
  const lastWeekIdx = weekLabels.length - 2;

  const thisWeekSaos = allRows
    .filter((r) => r.status !== "Ramping")
    .reduce((s, r) => s + r.weeks[thisWeekIdx].saoCount, 0);
  const lastWeekSaos = lastWeekIdx >= 0
    ? allRows.filter((r) => r.status !== "Ramping").reduce((s, r) => s + r.weeks[lastWeekIdx].saoCount, 0)
    : 0;

  const thisWeekPipeline = allRows
    .filter((r) => r.status !== "Ramping")
    .reduce((s, r) => s + r.weeks[thisWeekIdx].pipelineDollars, 0);
  const lastWeekPipeline = lastWeekIdx >= 0
    ? allRows.filter((r) => r.status !== "Ramping").reduce((s, r) => s + r.weeks[lastWeekIdx].pipelineDollars, 0)
    : 0;

  const thisWeekMeetings = allRows.reduce((s, r) => s + r.weeks[thisWeekIdx].meetingsSet, 0);
  const lastWeekMeetings = lastWeekIdx >= 0
    ? allRows.reduce((s, r) => s + r.weeks[lastWeekIdx].meetingsSet, 0)
    : 0;

  const thisWeekConv = thisWeekMeetings > 0 ? thisWeekSaos / thisWeekMeetings : 0;
  const lastWeekConv = lastWeekMeetings > 0 ? lastWeekSaos / lastWeekMeetings : 0;

  // Exec summary + KPI cards measure attainment in SAO Points (Meeting Held Date)
  // to stay apples-to-apples with the points-denominated quota.
  const rampedRows = allRows.filter((r) => r.status !== "Ramping");
  const ptsForRowInWeek = (r: SdrHeatmapRow, label: string) =>
    weeklySaoPoints.get(r.sdrName)?.get(label) || 0;
  const focusWeekPtsTeam = rampedRows.reduce((s, r) => s + ptsForRowInWeek(r, focusLabel), 0);
  const lastWeekLabel = lastWeekIdx >= 0 ? weekLabels[lastWeekIdx] : "";
  const priorWeekPtsTeam = lastWeekLabel
    ? rampedRows.reduce((s, r) => s + ptsForRowInWeek(r, lastWeekLabel), 0)
    : 0;

  const teamPace = roster
    .filter((e) => e.status !== "Ramping")
    .reduce((s, e) => s + e.monthlyQuota / WEEKS_PER_MONTH, 0);
  const paceGap = focusWeekPtsTeam - teamPace;
  const aboveOrAt = paceGap >= 0;
  const headlineColor = aboveOrAt ? "var(--green)" : "#ff6b6b";

  const sortedByPts = [...rampedRows].sort(
    (a, b) => ptsForRowInWeek(b, focusLabel) - ptsForRowInWeek(a, focusLabel)
  );
  const top = sortedByPts[0];
  const bottom = sortedByPts[sortedByPts.length - 1];

  const topPts = top ? ptsForRowInWeek(top, focusLabel) : 0;
  const topPipeline = top ? top.weeks[thisWeekIdx].pipelineDollars : 0;
  const bottomQtd = bottom ? (qtdSaoPoints.get(bottom.sdrName) || 0) : 0;
  const bottomReqQtd = bottom
    ? ((roster.find((e) => e.name === bottom.sdrName)?.monthlyQuota || 0) /
        WEEKS_PER_MONTH) *
      weeksInQ
    : 0;
  const bottomGap = bottomQtd - bottomReqQtd;

  let execSummary = `SDR team booked <span style="color:${headlineColor};font-weight:700">${focusWeekPtsTeam.toFixed(2)} SAO points</span> last week`;
  if (aboveOrAt) {
    execSummary += ` — <span style="color:var(--green);font-weight:700">${paceGap.toFixed(2)} above pace</span> of ${teamPace.toFixed(1)}.`;
  } else {
    execSummary += ` against a pace of ${teamPace.toFixed(1)} — <span style="color:var(--red);font-weight:700">${Math.abs(paceGap).toFixed(2)} behind</span>.`;
  }

  if (top && topPts > 0) {
    execSummary += ` <span style="color:var(--green);font-weight:700">${top.sdrName}</span> led with ${topPts.toFixed(2)} SAO points and <span style="color:var(--green);font-weight:700">${fmtK(topPipeline)}</span> in pipeline.`;
  }
  if (bottom && bottom.sdrName !== top?.sdrName && bottom.status === "Behind") {
    execSummary += ` <span style="color:var(--red);font-weight:700">${bottom.sdrName}</span> is <span style="color:var(--red);font-weight:700">${Math.abs(bottomGap).toFixed(1)} points behind QTD pace</span>.`;
  }

  execSummary += ` Team conversion rate is <span style="color:var(--kojo-yellow);font-weight:700">${Math.round(teamFunnelTotal.conversionRate * 100)}%</span>.`;

  return {
    focusWeekLabel: focusLabel,
    filterLabel: "All Sources by SDR Owner",
    execSummary,
    monthlyAttainment,
    kpiCards: {
      saosThisWeek: focusWeekPtsTeam,
      saosWow: focusWeekPtsTeam - priorWeekPtsTeam,
      pipelineThisWeek: thisWeekPipeline,
      pipelineWow: thisWeekPipeline - lastWeekPipeline,
      meetingsThisWeek: thisWeekMeetings,
      meetingsWow: thisWeekMeetings - lastWeekMeetings,
      conversionRate: thisWeekConv,
      conversionWow: thisWeekConv - lastWeekConv,
    },
    heatmap: {
      mm: mmRows,
      ent: entRows,
      ramping: rampingRows,
      mmSubtotals: buildSubtotals(mmRows),
      entSubtotals: buildSubtotals(entRows),
    },
    repDetail: {
      mm: mmDetails,
      ent: entDetails,
      ramping: rampingDetails,
      mmTotals: sumRepDetails(mmDetails, "MM Total"),
      entTotals: sumRepDetails(entDetails, "ENT Total"),
    },
    funnel: {
      teamTotals: {
        meetingsSet: teamFunnelTotal.meetingsSet,
        saos: teamFunnelTotal.saos,
        conversionRate: teamFunnelTotal.conversionRate,
        pipelineDollars: teamFunnelTotal.pipelineDollars,
        closedWonDollars: teamFunnelTotal.closedWonDollars,
      },
      mm: mmFunnel,
      ent: entFunnel,
      mmTotals: mmFunnelTotals,
      entTotals: entFunnelTotals,
      teamTotal: teamFunnelTotal,
    },
  };
}
