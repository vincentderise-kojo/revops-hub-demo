"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import {
  CoverageState,
  CoverageWindowRow,
  SegmentAging,
  AgingBucket,
  StageBreakdown,
  CoverageDeal,
  Opportunity,
  MojoWeekRow,
  DealInsightRequest,
} from "@/lib/types";
import DealInsightPanel from "@/components/deal-insight-panel";
import ExportButton from "@/components/export-button";
import { fmtK } from "@/lib/format";
import { COVERAGE_CONFIG, OPEN_STAGES, getMonthlyQuota } from "@/lib/config";

const statusColors: Record<string, string> = { green: "var(--green)", yellow: "var(--yellow)", red: "var(--red)" };

function fmtRatio(n: number): string { return `${n.toFixed(1)}×`; }
function fmtM(n: number): string { return `$${(n / 1_000_000).toFixed(1)}M`; }

function isOpenStage(stage: string): boolean {
  return (OPEN_STAGES as readonly string[]).includes(stage);
}

function rehydrateOpps(opps: Opportunity[]): Opportunity[] {
  return opps.map((o) => ({
    ...o,
    discoveryDate: new Date(o.discoveryDate),
    closeDate: o.closeDate ? new Date(o.closeDate) : null,
    lastActivityDate: o.lastActivityDate ? new Date(o.lastActivityDate) : null,
    accountLastActivityDate: o.accountLastActivityDate ? new Date(o.accountLastActivityDate) : null,
  }));
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

// ── Client-side aging computation ──
function computeAging(
  openOpps: Opportunity[],
  segment: "MM" | "ENT",
  staleThreshold: number,
  today: Date
): SegmentAging {
  const cfg = segment === "MM" ? COVERAGE_CONFIG.mm : COVERAGE_CONFIG.ent;
  const segOpps = openOpps.filter((o) => o.segment === segment);
  const total = segOpps.reduce((s, o) => s + o.amount, 0);

  // Use Last Activity for current-state freshness
  const halfThreshold = Math.floor(staleThreshold / 2);

  const freshOpps = segOpps.filter((o) => {
    if (!o.lastActivityDate) return false;
    return Math.floor((today.getTime() - o.lastActivityDate.getTime()) / 86_400_000) <= halfThreshold;
  });
  const agingOpps = segOpps.filter((o) => {
    if (!o.lastActivityDate) return true; // no activity = aging
    const days = Math.floor((today.getTime() - o.lastActivityDate.getTime()) / 86_400_000);
    return days > halfThreshold && days <= staleThreshold;
  });
  const staleOpps = segOpps.filter((o) => {
    if (!o.lastActivityDate) return false;
    return Math.floor((today.getTime() - o.lastActivityDate.getTime()) / 86_400_000) > staleThreshold;
  });
  // Opps with no activity date that weren't caught above
  const noActivityOpps = segOpps.filter((o) => !o.lastActivityDate);

  const makeBucket = (label: string, opps: Opportunity[], color: string): AgingBucket => ({
    label, amount: opps.reduce((s, o) => s + o.amount, 0), oppCount: opps.length, color,
  });

  const fresh = makeBucket("Fresh", freshOpps, "var(--green)");
  const aging = makeBucket("Aging", [...agingOpps, ...noActivityOpps], "var(--yellow)");
  const stale = makeBucket("Stale", staleOpps, "var(--red)");

  return {
    segment, total, oppCount: segOpps.length,
    fresh, aging, stale,
    threshold: cfg.requiredPipeline,
    freshVsThreshold: cfg.requiredPipeline > 0 ? fresh.amount / cfg.requiredPipeline : 0,
  };
}

// ── Client-side MOJO computation ──
function computeMojo(
  allOpps: Opportunity[],
  staleThreshold: number,
  segmentFilter: "All" | "MidMarket" | "Enterprise",
  today: Date
): MojoWeekRow[] {
  const filtered = segmentFilter === "All"
    ? allOpps
    : allOpps.filter((o) => o.segment === (segmentFilter === "MidMarket" ? "MM" : "ENT"));

  const openOpps = filtered.filter((o) => isOpenStage(o.stage));

  // Current fresh total
  const currentFreshOpps = openOpps.filter((o) => {
    if (!o.lastActivityDate) return false;
    return Math.floor((today.getTime() - o.lastActivityDate.getTime()) / 86_400_000) <= staleThreshold;
  });
  const currentFreshTotal = currentFreshOpps.reduce((s, o) => s + o.amount, 0);

  // Build 12 weeks, most recent first, then reverse
  const weeks: MojoWeekRow[] = [];
  const currentMonday = getMonday(today);

  for (let i = 11; i >= 0; i--) {
    const wStart = new Date(currentMonday);
    wStart.setDate(currentMonday.getDate() - i * 7);
    wStart.setHours(0, 0, 0, 0);
    const wEnd = new Date(wStart);
    wEnd.setDate(wStart.getDate() + 6);
    wEnd.setHours(23, 59, 59, 999);

    const isCurrentWeek = i === 0;
    const label = `${wStart.getMonth() + 1}/${wStart.getDate()}–${wEnd.getMonth() + 1}/${wEnd.getDate()}`;

    // Pipeline In: new opps created this week with fresh activity
    const newCreated = filtered.filter((o) => {
      return o.discoveryDate >= wStart && o.discoveryDate <= wEnd;
    });
    const newCreatedAmt = newCreated.reduce((s, o) => s + o.amount, 0);

    // Pipeline Out: Closed Won this week
    const cw = filtered.filter((o) => {
      if (o.stage !== "Closed Won" || !o.closeDate) return false;
      return o.closeDate >= wStart && o.closeDate <= wEnd;
    });
    const cwAmt = cw.reduce((s, o) => s + o.amount, 0);

    // Pipeline Out: Closed Lost this week
    const cl = filtered.filter((o) => {
      if (o.stage !== "Closed Lost" || !o.closeDate) return false;
      return o.closeDate >= wStart && o.closeDate <= wEnd;
    });
    const clAmt = cl.reduce((s, o) => s + o.amount, 0);

    // Went Stale: only for current week (V1)
    let wentStale: number | null = null;
    let wentStaleCount: number | null = null;
    if (isCurrentWeek) {
      const staleNow = openOpps.filter((o) => {
        if (!o.lastActivityDate) return false;
        const days = Math.floor((wEnd.getTime() - o.lastActivityDate.getTime()) / 86_400_000);
        return days > staleThreshold;
      });
      wentStale = staleNow.reduce((s, o) => s + o.amount, 0);
      wentStaleCount = staleNow.length;
    }

    const totalIn = newCreatedAmt;
    const totalOut = cwAmt + clAmt + (wentStale ?? 0);
    const netChange = totalIn - totalOut;

    weeks.push({
      weekLabel: label,
      weekEnd: wEnd,
      newCreated: newCreatedAmt,
      newCreatedCount: newCreated.length,
      closedWon: cwAmt,
      closedWonCount: cw.length,
      closedLost: clAmt,
      closedLostCount: cl.length,
      wentStale,
      wentStaleCount,
      totalIn,
      totalInCount: newCreated.length,
      totalOut: cwAmt + clAmt + (wentStale ?? 0),
      totalOutCount: cw.length + cl.length + (wentStaleCount ?? 0),
      netChange,
      freshTotal: 0, // computed below
    });
  }

  // Compute running fresh total (work backwards from current)
  // The last week's fresh total = currentFreshTotal
  weeks[weeks.length - 1].freshTotal = currentFreshTotal;
  for (let i = weeks.length - 2; i >= 0; i--) {
    // Approximate: previous fresh = next fresh - next net change
    weeks[i].freshTotal = weeks[i + 1].freshTotal - weeks[i + 1].netChange;
  }

  return weeks;
}

// ── Client-side scoreboard recomputation ──
function computeWindows(
  openOpps: Opportunity[],
  staleThreshold: number,
  today: Date,
  quotaMap?: Record<string, { totalQuota: number; mmQuota: number; entQuota: number }>,
  segmentFilter?: "All" | "MidMarket" | "Enterprise"
): CoverageWindowRow[] {
  // Filter to fresh opps only
  const freshAll = openOpps.filter((o) => {
    if (!o.lastActivityDate) return false;
    return Math.floor((today.getTime() - o.lastActivityDate.getTime()) / 86_400_000) <= staleThreshold;
  });
  // Apply segment filter
  const freshOpen = segmentFilter && segmentFilter !== "All"
    ? freshAll.filter((o) => o.segment === (segmentFilter === "MidMarket" ? "MM" : "ENT"))
    : freshAll;

  const thisMonthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const thisMonthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59, 999);
  const nextMonthStart = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  const nextMonthEnd = new Date(today.getFullYear(), today.getMonth() + 2, 0, 23, 59, 59, 999);
  const qStart = Math.floor(today.getMonth() / 3) * 3;
  const qEnd = new Date(today.getFullYear(), qStart + 3, 0, 23, 59, 59, 999);

  function monthKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }

  function coverageStatus(ratio: number): "green" | "yellow" | "red" {
    if (ratio >= 5.8) return "green";
    if (ratio >= 3.0) return "yellow";
    return "red";
  }

  function buildWindow(
    label: string,
    rangeStart: Date,
    rangeEnd: Date,
    quotaMonths: string[]
  ): CoverageWindowRow {
    const opps = freshOpen.filter((o) => {
      if (!o.closeDate) return false;
      return o.closeDate >= rangeStart && o.closeDate <= rangeEnd;
    });
    const totalPipeline = opps.reduce((s, o) => s + o.amount, 0);
    const mmOpps = opps.filter((o) => o.segment === "MM");
    const entOpps = opps.filter((o) => o.segment === "ENT");
    const quotaKey = segmentFilter === "MidMarket" ? "mmQuota" : segmentFilter === "Enterprise" ? "entQuota" : "totalQuota";
    const quota = quotaMonths.reduce((s, mk) => s + (quotaMap?.[mk]?.[quotaKey] ?? getMonthlyQuota(mk)[quotaKey]), 0);
    const ratio = quota > 0 ? totalPipeline / quota : 0;

    return {
      label,
      openPipeline: totalPipeline,
      quota,
      coverageRatio: ratio,
      status: coverageStatus(ratio),
      oppCount: opps.length,
      mmPipeline: mmOpps.reduce((s, o) => s + o.amount, 0),
      entPipeline: entOpps.reduce((s, o) => s + o.amount, 0),
      mmOppCount: mmOpps.length,
      entOppCount: entOpps.length,
    };
  }

  const thisMk = monthKey(today);
  const nextMk = monthKey(nextMonthStart);
  const quarterKeys: string[] = [];
  for (let m = today.getMonth(); m <= qStart + 2; m++) {
    quarterKeys.push(`${today.getFullYear()}-${String(m + 1).padStart(2, "0")}`);
  }

  return [
    buildWindow("This Month", thisMonthStart, thisMonthEnd, [thisMk]),
    buildWindow("Next Month", nextMonthStart, nextMonthEnd, [nextMk]),
    buildWindow("This Quarter", thisMonthStart, qEnd, quarterKeys),
  ];
}

export default function CoverageDashboard({ data, quotaMap }: { data: CoverageState; quotaMap?: Record<string, { totalQuota: number; mmQuota: number; entQuota: number }> }) {
  const [staleThreshold, setStaleThreshold] = useState(90);
  const [segment, setSegment] = useState<"All" | "MidMarket" | "Enterprise">("All");

  const allOpps = useMemo(() => rehydrateOpps(data.allOpps), [data.allOpps]);
  const today = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);

  const openOpps = useMemo(
    () => {
      const open = allOpps.filter((o) => isOpenStage(o.stage));
      if (segment === "All") return open;
      return open.filter((o) => o.segment === (segment === "MidMarket" ? "MM" : "ENT"));
    },
    [allOpps, segment]
  );

  const allOpenOpps = useMemo(() => allOpps.filter((o) => isOpenStage(o.stage)), [allOpps]);
  const agingMm = useMemo(() => computeAging(allOpenOpps, "MM", staleThreshold, today), [allOpenOpps, staleThreshold, today]);
  const agingEnt = useMemo(() => computeAging(allOpenOpps, "ENT", staleThreshold, today), [allOpenOpps, staleThreshold, today]);
  const mojoWeeks = useMemo(() => computeMojo(allOpps, staleThreshold, segment, today), [allOpps, staleThreshold, segment, today]);
  const windows = useMemo(() => computeWindows(allOpenOpps, staleThreshold, today, quotaMap, segment), [allOpenOpps, staleThreshold, today, quotaMap, segment]);

  const latestDisco = data.latestDiscoveryDate
    ? new Date(data.latestDiscoveryDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : null;
  const refreshedAt = data.renderedAt
    ? new Date(data.renderedAt).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
      }) + " ET"
    : null;

  const currentWeek = mojoWeeks[mojoWeeks.length - 1];

  return (
    <>
      {/* CRESTLINE HEADER BAR */}
      <div className="brand-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/hub" style={{ fontSize: 15, fontWeight: 800, color: "#FFE500", letterSpacing: 1.5, textDecoration: "none" }}>CRESTLINE</a>
          <span style={{ width: 1, height: 16, background: "#555", display: "inline-block" }} />
          <a href="/hub" style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", textDecoration: "none" }}>RevOps Hub</a>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {(latestDisco || refreshedAt) && (
            <span
              style={{
                fontSize: 10,
                color: "#777",
                letterSpacing: 0.3,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                lineHeight: 1.3,
              }}
            >
              {latestDisco && <span>Latest disco: {latestDisco}</span>}
              {refreshedAt && <span>Refreshed: {refreshedAt}</span>}
            </span>
          )}
          <ExportButton slug="pipeline-coverage" />
        </div>
      </div>

      {/* APP HEADER */}
      <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: 4, background: "var(--teal)", boxShadow: "0 0 8px #4ecdc488" }} />
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5 }}>Pipeline Coverage</span>
          <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 4 }}>Forward-Looking Pipeline Health</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, paddingLeft: 18 }}>
          As of {data.asOfDate} — Do we have enough pipeline to hit plan?
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 960, margin: "0 auto" }}>
        {/* Controls */}
        <div className="card">
          <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Stale Threshold</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "var(--teal)", marginBottom: 6 }}>{staleThreshold} days</div>
              <input type="range" min={30} max={180} step={5} value={staleThreshold} onChange={(e) => setStaleThreshold(parseInt(e.target.value))} style={{ width: "100%", accentColor: "#4ecdc4" }} />
              <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 4 }}>Pipeline with no activity in {staleThreshold}+ days is excluded from fresh metrics</div>
            </div>
            <div style={{ width: 160 }}>
              <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>Segment</div>
              <select value={segment} onChange={(e) => setSegment(e.target.value as "All" | "MidMarket" | "Enterprise")}
                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--bg)", color: "var(--text)", fontSize: 12, fontFamily: "inherit", marginTop: 4 }}>
                <option value="All">All</option>
                <option value="MidMarket">MidMarket</option>
                <option value="Enterprise">Enterprise</option>
              </select>
            </div>
          </div>
        </div>

        <CoverageScoreboard windows={windows} staleThreshold={staleThreshold} />

        {/* MOJO Section */}
        <MojoSection weeks={mojoWeeks} currentWeek={currentWeek} />

        {/* Pipeline Aging — dynamic */}
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Pipeline Aging</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 16 }}>
            How much open pipeline is real vs. stale? Fresh = last activity within {Math.floor(staleThreshold / 2)}d. Stale = no activity in {staleThreshold}+ days.
          </div>
          {segment === "All" ? (
            <div className="side-by-side">
              <AgingCard data={agingMm} label="MidMarket" color="var(--blue)" threshold={staleThreshold} />
              <AgingCard data={agingEnt} label="Enterprise" color="var(--teal)" threshold={staleThreshold} />
            </div>
          ) : segment === "MidMarket" ? (
            <AgingCard data={agingMm} label="MidMarket" color="var(--blue)" threshold={staleThreshold} />
          ) : (
            <AgingCard data={agingEnt} label="Enterprise" color="var(--teal)" threshold={staleThreshold} />
          )}
        </div>

        <StageComposition stages={data.stageComposition} />
        <TopDeals deals={data.topDeals} segmentFilter={segment} />
        <CloseDateHealthCard health={data.closeDateHealth} />
      </div>
    </>
  );
}

// ── MOJO Section ──
function MojoSection({ weeks, currentWeek }: { weeks: MojoWeekRow[]; currentWeek: MojoWeekRow }) {
  const maxBar = Math.max(
    ...weeks.map((w) => Math.max(w.totalIn, w.closedWon + w.closedLost + (w.wentStale ?? 0))),
    1
  );
  const maxFresh = Math.max(...weeks.map((w) => w.freshTotal), 1);
  const chartHeight = 140;
  const [hoveredWeek, setHoveredWeek] = useState<number | null>(null);
  const [hoveredDot, setHoveredDot] = useState<number | null>(null);

  return (
    <div className="card">
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
        Weekly Pipeline Flow <span style={{ fontWeight: 400, fontSize: 11, color: "var(--muted)" }}>(re-designing Mojo metric)</span>
        <InfoTooltip tooltipKey="Pipeline MOJO — Weekly Flow" />
      </div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 14 }}>
        Is our pipeline growing or shrinking? Green = pipeline in, red = pipeline out. Net change shows the trajectory.
      </div>

      {/* Summary Cards */}
      <div style={{ fontSize: 10, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>This Week ({currentWeek.weekLabel})</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
        <MojoCard label="Pipeline In" amount={currentWeek.totalIn} count={currentWeek.totalInCount} color="var(--green)" tooltipKey="Pipeline In" />
        <MojoCard label="Pipeline Out" amount={currentWeek.totalOut} count={currentWeek.totalOutCount} color="var(--red)" tooltipKey="Pipeline Out" />
        <MojoCard label="Net Change" amount={currentWeek.netChange} count={currentWeek.totalInCount - currentWeek.totalOutCount} color={currentWeek.netChange >= 0 ? "var(--green)" : "var(--red)"} showSign tooltipKey="Net Change" />
        <MojoCard label="Active Pipeline" amount={currentWeek.freshTotal} count={null} color="var(--teal)" tooltipKey="Fresh Total" />
      </div>

      {/* Chart */}
      <div style={{ position: "relative", height: chartHeight + 50, marginBottom: 8 }}>
        {/* Zero line */}
        <div style={{ position: "absolute", left: 0, right: 0, top: chartHeight / 2, height: 1, background: "var(--border)" }} />
        <div style={{ display: "flex", alignItems: "center", height: chartHeight, gap: 3 }}>
          {weeks.map((w, i) => {
            const inH = maxBar > 0 ? (w.totalIn / maxBar) * (chartHeight / 2 - 4) : 0;
            const cwH = maxBar > 0 ? (w.closedWon / maxBar) * (chartHeight / 2 - 4) : 0;
            const clH = maxBar > 0 ? (w.closedLost / maxBar) * (chartHeight / 2 - 4) : 0;
            const staleH = w.wentStale !== null && maxBar > 0 ? (w.wentStale / maxBar) * (chartHeight / 2 - 4) : 0;
            const freshY = chartHeight - (w.freshTotal / maxFresh) * (chartHeight - 10) - 5;
            const netPositive = w.netChange >= 0;
            return (
              <div
                key={i}
                style={{ flex: 1, position: "relative", height: chartHeight, cursor: "default" }}
                onMouseEnter={() => setHoveredWeek(i)}
                onMouseLeave={() => setHoveredWeek(null)}
              >
                {/* In bar (green, going up from center) */}
                <div style={{ position: "absolute", bottom: chartHeight / 2, left: "10%", right: "10%", height: inH, background: "#22c55e88", borderRadius: "2px 2px 0 0" }} />
                {/* CW bar (teal, going down from center — left half) */}
                <div style={{ position: "absolute", top: chartHeight / 2, left: "10%", width: "38%", height: cwH, background: "#4ecdc488", borderRadius: "0 0 2px 2px" }} />
                {/* CL bar (red, going down from center — right half) */}
                <div style={{ position: "absolute", top: chartHeight / 2, right: "10%", width: "38%", height: clH, background: "#ef444488", borderRadius: "0 0 2px 2px" }} />
                {/* Went Stale (gray, appended below CL bar) */}
                {staleH > 0 && (
                  <div style={{ position: "absolute", top: chartHeight / 2 + clH, right: "10%", width: "38%", height: staleH, background: "#64748b88", borderRadius: "0 0 2px 2px" }} />
                )}
                {/* Net dot */}
                <div
                  onMouseEnter={(e) => { e.stopPropagation(); setHoveredDot(i); setHoveredWeek(null); }}
                  onMouseLeave={() => setHoveredDot(null)}
                  style={{
                    position: "absolute",
                    left: "50%", transform: "translateX(-50%)",
                    top: netPositive ? chartHeight / 2 - (w.netChange / maxBar) * (chartHeight / 2 - 4) - 4 : chartHeight / 2 + (Math.abs(w.netChange) / maxBar) * (chartHeight / 2 - 4) - 2,
                    width: 8, height: 8, borderRadius: 4,
                    background: netPositive ? "var(--green)" : "var(--red)",
                    zIndex: 3, cursor: "default",
                  }}
                >
                  {hoveredDot === i && (
                    <div style={{
                      position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
                      background: "#1e293b", border: "1px solid var(--border)", borderRadius: 6,
                      padding: "6px 10px", whiteSpace: "nowrap", zIndex: 50, boxShadow: "0 4px 12px #0006",
                      pointerEvents: "none",
                    }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: netPositive ? "var(--green)" : "var(--red)" }}>
                        {w.netChange >= 0 ? "+" : ""}{fmtK(w.netChange)} ({w.totalInCount - w.totalOutCount >= 0 ? "+" : ""}{w.totalInCount - w.totalOutCount} net opp{Math.abs(w.totalInCount - w.totalOutCount) !== 1 ? "s" : ""})
                      </span>
                      <div style={{
                        position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
                        width: 0, height: 0, borderLeft: "5px solid transparent", borderRight: "5px solid transparent",
                        borderTop: "5px solid #1e293b",
                      }} />
                    </div>
                  )}
                </div>
                {/* Fresh total line marker */}
                <div style={{
                  position: "absolute", left: "50%", transform: "translateX(-50%)",
                  top: freshY, width: 6, height: 2, borderRadius: 1,
                  background: "var(--teal)", zIndex: 2,
                }} />
                {/* Hover tooltip */}
                {hoveredWeek === i && (
                  <div style={{
                    position: "absolute", bottom: "calc(100% + 8px)", left: "50%", transform: "translateX(-50%)",
                    background: "#1e293b", border: "1px solid var(--border)", borderRadius: 8,
                    padding: "10px 12px", width: 200, zIndex: 50, boxShadow: "0 4px 12px #0006",
                    pointerEvents: "none",
                  }}>
                    <div style={{ fontSize: 10, fontWeight: 600, color: "var(--text)", marginBottom: 6 }}>Week of {w.weekLabel}</div>
                    <div style={{ fontSize: 10, color: "var(--green)", marginBottom: 2 }}>In: {fmtK(w.totalIn)} ({w.totalInCount} opp{w.totalInCount !== 1 ? "s" : ""})</div>
                    <div style={{ fontSize: 10, color: "var(--red)", marginBottom: 2 }}>Out: {fmtK(w.totalOut)} ({w.totalOutCount} opp{w.totalOutCount !== 1 ? "s" : ""})</div>
                    <div style={{ fontSize: 9, color: "var(--teal)", marginBottom: 1, paddingLeft: 8 }}>CW: {fmtK(w.closedWon)} ({w.closedWonCount})</div>
                    <div style={{ fontSize: 9, color: "var(--red)", marginBottom: 1, paddingLeft: 8 }}>CL: {fmtK(w.closedLost)} ({w.closedLostCount})</div>
                    {w.wentStale !== null && <div style={{ fontSize: 9, color: "var(--muted)", marginBottom: 1, paddingLeft: 8 }}>Stale: {fmtK(w.wentStale)} ({w.wentStaleCount})</div>}
                    <div style={{ fontSize: 10, fontWeight: 700, color: w.netChange >= 0 ? "var(--green)" : "var(--red)", marginTop: 4 }}>Net: {w.netChange >= 0 ? "+" : ""}{fmtK(w.netChange)}</div>
                    <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>Fresh Total: {fmtK(w.freshTotal)}</div>
                    <div style={{
                      position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
                      width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent",
                      borderTop: "6px solid #1e293b",
                    }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {/* X axis */}
        <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
          {weeks.map((w, i) => (
            <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 7, color: "var(--muted)" }}>
              {i % 2 === 0 ? w.weekLabel.split("–")[0] : ""}
            </div>
          ))}
        </div>
        {/* Legend */}
        <div style={{ display: "flex", gap: 14, fontSize: 9, marginTop: 4, color: "var(--muted)" }}>
          <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#22c55e88", borderRadius: 2, marginRight: 4 }} />In</span>
          <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#4ecdc488", borderRadius: 2, marginRight: 4 }} />CW</span>
          <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#ef444488", borderRadius: 2, marginRight: 4 }} />CL</span>
          <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#64748b88", borderRadius: 2, marginRight: 4 }} />Stale</span>
          <span><span style={{ display: "inline-block", width: 5, height: 5, background: "var(--green)", borderRadius: 3, marginRight: 4 }} />Net</span>
          <span><span style={{ display: "inline-block", width: 6, height: 2, background: "var(--teal)", borderRadius: 1, marginRight: 4, verticalAlign: "middle" }} />Fresh total</span>
        </div>
      </div>

      {/* Weekly Flow Table */}
      <div style={{ overflowX: "auto" }}>
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Week</th>
              <th>New Created <InfoTooltip tooltipKey="New Created" /></th>
              <th style={{ color: "var(--green)" }}>Total In <InfoTooltip tooltipKey="Total In" /></th>
              <th style={{ color: "var(--teal)" }}>Closed Won <InfoTooltip tooltipKey="Closed Won" /></th>
              <th style={{ color: "var(--red)" }}>Closed Lost <InfoTooltip tooltipKey="Closed Lost" /></th>
              <th>Went Stale <InfoTooltip tooltipKey="Went Stale" /></th>
              <th style={{ color: "var(--red)" }}>Total Out <InfoTooltip tooltipKey="Total Out" /></th>
              <th>Net <InfoTooltip tooltipKey="Net" /></th>
              <th>Fresh Total <InfoTooltip tooltipKey="Fresh Total (table)" /></th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((w, i) => {
              const netColor = w.netChange >= 0 ? "var(--green)" : "var(--red)";
              return (
                <tr key={i}>
                  <td style={{ textAlign: "left", fontSize: 10 }}>{w.weekLabel}</td>
                  <td>{fmtK(w.newCreated)} <span className="muted" style={{ fontSize: 9 }}>({w.newCreatedCount})</span></td>
                  <td style={{ color: "var(--green)", fontWeight: 600 }}>{fmtK(w.totalIn)}</td>
                  <td style={{ color: "var(--teal)" }}>{fmtK(w.closedWon)} <span className="muted" style={{ fontSize: 9 }}>({w.closedWonCount})</span></td>
                  <td style={{ color: "var(--red)" }}>{fmtK(w.closedLost)} <span className="muted" style={{ fontSize: 9 }}>({w.closedLostCount})</span></td>
                  <td className="muted">{w.wentStale !== null ? fmtK(w.wentStale) : "—"}</td>
                  <td style={{ color: "var(--red)", fontWeight: 600 }}>{fmtK(w.totalOut)}</td>
                  <td style={{ color: netColor, fontWeight: 700 }}>{w.netChange >= 0 ? "+" : ""}{fmtK(w.netChange)}</td>
                  <td style={{ fontWeight: 600 }}>{fmtK(w.freshTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 9, color: "#556", marginTop: 8, fontStyle: "italic" }}>
        V1: Reactivated deals (stale opps that received new activity) will be added in a future update. &quot;Went Stale&quot; is only computed for the current week.
      </div>
    </div>
  );
}

function MojoCard({ label, amount, count, color, showSign, tooltipKey }: {
  label: string; amount: number; count: number | null; color: string; showSign?: boolean; tooltipKey?: string;
}) {
  const formatted = showSign
    ? `${amount >= 0 ? "+" : ""}${fmtK(amount)}`
    : fmtK(amount);
  return (
    <div style={{ background: "var(--bg)", borderRadius: 8, padding: 12, borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
        {label}
        {tooltipKey && <InfoTooltip tooltipKey={tooltipKey} />}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{formatted}</div>
      {count !== null && <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{count} opp{count !== 1 ? "s" : ""}</div>}
    </div>
  );
}

// ── MOJO Tooltip Content ──
const MOJO_TOOLTIPS: Record<string, { short: string; detail: string }> = {
  "Pipeline MOJO — Weekly Flow": {
    short: "Is our pipeline growing or shrinking week over week?",
    detail: "Tracks new pipeline entering vs. pipeline leaving (won, lost, or gone stale). Inspired by Bill Binch\u2019s \u201CMojo Metric\u201D \u2014 the single most important daily indicator of pipeline health.",
  },
  "Pipeline In": {
    short: "New opps entering the pipeline this week.",
    detail: "Counts opportunities by Discovery Date. A healthy business creates more than it loses.",
  },
  "Pipeline Out": {
    short: "Total pipeline that left this week (won + lost + stale).",
    detail: "Includes all exit reasons. Compare against Pipeline In to gauge net trajectory.",
  },
  "Net Change": {
    short: "Pipeline In minus Pipeline Out.",
    detail: "Positive = pipeline is growing. Negative = you\u2019re losing more than you\u2019re creating. Watch for sustained negative trends.",
  },
  "Fresh Total": {
    short: "Current total pipeline with recent activity.",
    detail: "Matches the \u201CFresh\u201D number in Pipeline Aging. Only includes opps with activity within the stale threshold set above.",
  },
  "New Created": {
    short: "Opps with a Discovery Date in this week.",
    detail: "These are brand new opportunities entering the system.",
  },
  "Total In": {
    short: "Sum of all pipeline entering the fresh pool.",
    detail: "V1: equals New Created. Future versions will include reactivated deals.",
  },
  "Closed Won": {
    short: "Pipeline that converted to revenue this week.",
    detail: "Good attrition \u2014 these deals closed successfully. Tracked by Close Date.",
  },
  "Closed Lost": {
    short: "Pipeline that died this week.",
    detail: "Bad attrition \u2014 these deals were lost. Tracked by Close Date.",
  },
  "Went Stale": {
    short: "Open opps with no activity beyond the stale threshold.",
    detail: "Only computed for the current week in V1. These deals aren\u2019t dead \u2014 they stopped moving. Often a coaching signal.",
  },
  "Total Out": {
    short: "Sum of Closed Won + Closed Lost + Went Stale.",
    detail: "All pipeline that exited the fresh pool this week, regardless of reason.",
  },
  "Net": {
    short: "Weekly net change (In minus Out).",
    detail: "Green = net positive. Red = net negative. Same as the Net Change summary card but per-week.",
  },
  "Fresh Total (table)": {
    short: "Running cumulative fresh pipeline at end of each week.",
    detail: "Computed backwards from the current week\u2019s actual fresh total. Shows the trajectory of your active pipeline over 12 weeks.",
  },
};

function InfoTooltip({ tooltipKey }: { tooltipKey: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const tip = MOJO_TOOLTIPS[tooltipKey];

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (!tip) return null;

  return (
    <span ref={ref} style={{ position: "relative", display: "inline-block", marginLeft: 4, verticalAlign: "middle" }}>
      <span
        onClick={() => setOpen(!open)}
        style={{
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: 14, height: 14, borderRadius: 7, fontSize: 9, fontWeight: 600,
          background: open ? "var(--teal)" : "#334155", color: open ? "var(--bg)" : "var(--muted)",
          cursor: "pointer", userSelect: "none", lineHeight: 1,
        }}
      >
        i
      </span>
      {open && (
        <div style={{
          position: "absolute", bottom: "calc(100% + 6px)", left: "50%", transform: "translateX(-50%)",
          background: "#1e293b", border: "1px solid var(--border)", borderRadius: 8,
          padding: "10px 12px", width: 260, zIndex: 50, boxShadow: "0 4px 12px #0006",
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: "var(--text)", marginBottom: 4 }}>{tip.short}</div>
          <div style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.5 }}>{tip.detail}</div>
          <div style={{
            position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
            width: 0, height: 0, borderLeft: "6px solid transparent", borderRight: "6px solid transparent",
            borderTop: "6px solid #1e293b",
          }} />
        </div>
      )}
    </span>
  );
}

// ── Coverage Scoreboard (static — not affected by slider) ──
function CoverageScoreboard({ windows, staleThreshold }: { windows: CoverageWindowRow[]; staleThreshold: number }) {
  return (
    <div className="card">
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Coverage Scoreboard</div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 16 }}>
        Fresh pipeline vs. CW quota. Target coverage: 5.8× (for every $5.80 of pipeline created, the team closes $1.00).
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
        {windows.map((w) => (
          <div key={w.label} style={{ background: "var(--bg)", borderRadius: 8, padding: 14, borderTop: `3px solid ${statusColors[w.status]}` }}>
            <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>{w.label}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: statusColors[w.status], marginBottom: 2 }}>{fmtRatio(w.coverageRatio)}</div>
            <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 10 }}>{fmtM(w.openPipeline)} open / {fmtK(w.quota)} quota</div>
            <div style={{ display: "flex", gap: 12, fontSize: 10 }}>
              <span style={{ color: "var(--blue)" }}>MM: {fmtK(w.mmPipeline)} <span className="muted">({w.mmOppCount})</span></span>
              <span style={{ color: "var(--teal)" }}>ENT: {fmtK(w.entPipeline)} <span className="muted">({w.entOppCount})</span></span>
            </div>
          </div>
        ))}
      </div>
      <table>
        <thead><tr><th style={{ textAlign: "left" }}>Window</th><th>Open Pipeline</th><th>Quota</th><th>Coverage</th><th>Target</th><th>Opps</th></tr></thead>
        <tbody>
          {windows.map((w) => (
            <tr key={w.label}>
              <td style={{ fontWeight: 500, textAlign: "left" }}>{w.label}</td>
              <td style={{ fontWeight: 600 }}>{fmtK(w.openPipeline)}</td>
              <td className="muted">{fmtK(w.quota)}</td>
              <td style={{ fontWeight: 700, color: statusColors[w.status] }}>{fmtRatio(w.coverageRatio)}</td>
              <td className="muted">5.8×</td>
              <td className="muted">{w.oppCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 9, color: "#556", marginTop: 10, fontStyle: "italic" }}>
        Filtered to pipeline with activity within {staleThreshold} days.
      </div>
    </div>
  );
}

// ── Pipeline Aging Card ──
function AgingCard({ data, label, color, threshold }: { data: SegmentAging; label: string; color: string; threshold: number }) {
  const freshPct = data.total > 0 ? (data.fresh.amount / data.total) * 100 : 0;
  const agingPct = data.total > 0 ? (data.aging.amount / data.total) * 100 : 0;
  const stalePct = data.total > 0 ? (data.stale.amount / data.total) * 100 : 0;
  const freshVsThresholdPct = Math.round(data.freshVsThreshold * 100);
  const freshStatus = freshVsThresholdPct >= 100 ? "var(--green)" : freshVsThresholdPct >= 60 ? "var(--yellow)" : "var(--red)";
  const halfT = Math.floor(threshold / 2);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color }}>{label}</div>
        <div style={{ fontSize: 10, color: "var(--muted)" }}>{data.oppCount} opps · {fmtM(data.total)} total</div>
      </div>
      <div style={{ fontSize: 9, color: "var(--muted)", marginBottom: 8 }}>Fresh ≤{halfT}d · Aging {halfT + 1}–{threshold}d · Stale &gt;{threshold}d</div>
      <div style={{ display: "flex", height: 14, borderRadius: 4, overflow: "hidden", marginBottom: 10 }}>
        {freshPct > 0 && <div style={{ width: `${freshPct}%`, background: "var(--green)" }} />}
        {agingPct > 0 && <div style={{ width: `${agingPct}%`, background: "var(--yellow)" }} />}
        {stalePct > 0 && <div style={{ width: `${stalePct}%`, background: "var(--red)" }} />}
      </div>
      <div style={{ display: "flex", gap: 12, fontSize: 10, marginBottom: 10 }}>
        <span><span style={{ color: "var(--green)", fontWeight: 600 }}>{fmtK(data.fresh.amount)}</span> <span className="muted">fresh ({data.fresh.oppCount})</span></span>
        <span><span style={{ color: "var(--yellow)", fontWeight: 600 }}>{fmtK(data.aging.amount)}</span> <span className="muted">aging ({data.aging.oppCount})</span></span>
        <span><span style={{ color: "var(--red)", fontWeight: 600 }}>{fmtK(data.stale.amount)}</span> <span className="muted">stale ({data.stale.oppCount})</span></span>
      </div>
      <div style={{ background: "var(--bg)", borderRadius: 6, padding: "8px 10px", fontSize: 11 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
          <span className="muted">Fresh pipeline vs. coverage threshold</span>
          <span style={{ fontWeight: 700, color: freshStatus }}>{freshVsThresholdPct}%</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10 }}>
          <span style={{ color: "var(--green)" }}>{fmtK(data.fresh.amount)} fresh</span>
          <span className="muted">{fmtM(data.threshold)} needed</span>
        </div>
        <div style={{ height: 4, background: "#2a3a4d", borderRadius: 2, marginTop: 6, overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${Math.min(freshVsThresholdPct, 100)}%`, background: freshStatus, borderRadius: 2 }} />
        </div>
      </div>
    </div>
  );
}

// ── Stage Composition (static) ──
function StageComposition({ stages }: { stages: StageBreakdown[] }) {
  const total = stages.reduce((s, st) => s + st.amount, 0);
  const stageColors: Record<string, string> = { Discovery: "var(--blue)", Evaluation: "var(--yellow)", "Contracts/Negotiation": "var(--green)" };
  return (
    <div className="card">
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Stage Composition — This Month&apos;s Close Window</div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 14 }}>Where does this month&apos;s open pipeline sit in the funnel? Later stages are more reliable.</div>
      {total > 0 && (
        <div style={{ display: "flex", height: 20, borderRadius: 6, overflow: "hidden", marginBottom: 12 }}>
          {stages.map((st) => st.amount > 0 ? (
            <div key={st.stage} style={{ width: `${st.pctOfTotal}%`, background: stageColors[st.stage] || "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 600, color: "var(--bg)", overflow: "hidden", whiteSpace: "nowrap" }}>
              {st.pctOfTotal > 12 ? `${Math.round(st.pctOfTotal)}%` : ""}
            </div>
          ) : null)}
        </div>
      )}
      <div style={{ display: "flex", gap: 16, fontSize: 11 }}>
        {stages.map((st) => (
          <div key={st.stage} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: stageColors[st.stage] || "var(--muted)" }} />
            <span style={{ fontWeight: 500 }}>{st.stage}</span>
            <span className="muted">{fmtK(st.amount)} ({st.oppCount})</span>
          </div>
        ))}
      </div>
      {stages[0] && stages[0].pctOfTotal > 30 && (
        <div className="callout callout-yellow" style={{ marginTop: 12 }}>
          <strong style={{ color: "var(--yellow)" }}>Heads up:</strong> {Math.round(stages[0].pctOfTotal)}% of this month&apos;s close pipeline is still in Discovery ({stages[0].oppCount} opps, {fmtK(stages[0].amount)}). These are unlikely to close this month.
        </div>
      )}
    </div>
  );
}

// ── Top Deals (sortable) ──
type SortKey = "name" | "amount" | "owner" | "stage" | "closeDate" | "inactiveDays" | "segment";
type SortDir = "asc" | "desc";

function TopDeals({ deals, segmentFilter }: { deals: CoverageDeal[]; segmentFilter: "All" | "MidMarket" | "Enterprise" }) {
  const [sortKey, setSortKey] = useState<SortKey>("amount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [selectedDeal, setSelectedDeal] = useState<DealInsightRequest | null>(null);

  const filtered = useMemo(() => {
    if (segmentFilter === "All") return deals;
    const seg = segmentFilter === "MidMarket" ? "MM" : "ENT";
    return deals.filter((d) => d.segment === seg);
  }, [deals, segmentFilter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    copy.sort((a, b) => {
      let cmp: number;
      switch (sortKey) {
        case "amount":
          cmp = a.amount - b.amount;
          break;
        case "inactiveDays":
          cmp = (a.inactiveDays ?? 999) - (b.inactiveDays ?? 999);
          break;
        default:
          cmp = (a[sortKey] ?? "").localeCompare(b[sortKey] ?? "");
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return copy;
  }, [filtered, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const arrow = (key: SortKey) => (key === sortKey ? (sortDir === "asc" ? " ▲" : " ▼") : "");

  const thClick = { cursor: "pointer" as const, userSelect: "none" as const };

  return (
    <div className="card">
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>Top Deals — This Month &amp; Next ({filtered.length})</div>
      <div style={{ fontSize: 9, color: "var(--muted)", marginBottom: 10, fontStyle: "italic" }}>Click any column to sort</div>
      <table>
        <thead><tr>
          <th style={{ textAlign: "left", ...thClick }} onClick={() => handleSort("name")}>Opportunity{arrow("name")}</th>
          <th style={thClick} onClick={() => handleSort("amount")}>Amount{arrow("amount")}</th>
          <th style={{ textAlign: "left", ...thClick }} onClick={() => handleSort("owner")}>Owner{arrow("owner")}</th>
          <th style={{ textAlign: "left", ...thClick }} onClick={() => handleSort("stage")}>Stage{arrow("stage")}</th>
          <th style={thClick} onClick={() => handleSort("closeDate")}>Close{arrow("closeDate")}</th>
          <th style={thClick} onClick={() => handleSort("inactiveDays")}>Last Touch{arrow("inactiveDays")}</th>
          <th style={{ textAlign: "left", ...thClick }} onClick={() => handleSort("segment")}>Seg{arrow("segment")}</th>
        </tr></thead>
        <tbody>
          {sorted.map((d, i) => {
            const inactiveColor = d.inactiveDays === null ? "var(--muted)" : d.inactiveDays > 90 ? "var(--red)" : d.inactiveDays > 40 ? "var(--yellow)" : "var(--muted)";
            return (
              <tr
                key={i}
                onClick={() =>
                  setSelectedDeal({
                    oppName: d.name,
                    accountName: d.accountName,
                    owner: d.ownerFull,
                    amount: d.amount,
                    stage: d.stage,
                    closeDate: d.closeDate,
                    discoveryDate: d.discoveryDate,
                    inactiveDays: d.inactiveDays,
                    segment: d.segment,
                    annualRevenue: d.annualRevenue,
                  })
                }
                style={{ cursor: "pointer" }}
              >
                <td style={{ textAlign: "left", fontWeight: 500, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</td>
                <td style={{ fontWeight: 600 }}>{fmtK(d.amount)}</td>
                <td className="muted" style={{ textAlign: "left" }}>{d.owner}</td>
                <td style={{ textAlign: "left", fontSize: 10 }}>{d.stage}</td>
                <td className="muted">{d.closeDate}</td>
                <td style={{ color: inactiveColor, fontWeight: 600 }}>{d.inactiveDays !== null ? `${d.inactiveDays}d` : "—"}</td>
                <td style={{ textAlign: "left" }}>
                  <span className="seg-badge" style={{ background: d.segment === "ENT" ? "#4ecdc422" : "#3b82f622", color: d.segment === "ENT" ? "var(--teal)" : "var(--blue)" }}>{d.segment}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {selectedDeal && (
        <DealInsightPanel
          deal={selectedDeal}
          onClose={() => setSelectedDeal(null)}
        />
      )}
    </div>
  );
}

// ── Close Date Health (static) ──
function CloseDateHealthCard({ health }: { health: CoverageState["closeDateHealth"] }) {
  return (
    <div className="card">
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Close Date Health</div>
      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 14 }}>Are close dates accurate? Past-due opps need updating.</div>
      <div style={{ display: "flex", gap: 12, marginBottom: 14 }}>
        <div style={{ flex: 1, background: "var(--bg)", borderRadius: 8, padding: 12, borderLeft: "3px solid var(--red)" }}>
          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Past Due</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: health.pastDueCount > 0 ? "var(--red)" : "var(--green)" }}>{health.pastDueCount}</div>
          <div style={{ fontSize: 10, color: "var(--muted)" }}>opps ({fmtK(health.pastDueAmount)}) with close date in the past</div>
        </div>
        <div style={{ flex: 1, background: "var(--bg)", borderRadius: 8, padding: 12, borderLeft: "3px solid var(--yellow)" }}>
          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Discovery Closing &lt;30d</div>
          <div style={{ fontSize: 20, fontWeight: 700, color: health.discoveryClosingSoon > 0 ? "var(--yellow)" : "var(--green)" }}>{health.discoveryClosingSoon}</div>
          <div style={{ fontSize: 10, color: "var(--muted)" }}>opps ({fmtK(health.discoveryClosingSoonAmount)}) in Discovery stage with close &lt;30 days out</div>
        </div>
      </div>
      <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", marginBottom: 8 }}>This month&apos;s open pipeline by stage</div>
      <table>
        <thead><tr><th style={{ textAlign: "left" }}>Stage</th><th>Pipeline</th><th>Opps</th><th>% of Total</th></tr></thead>
        <tbody>
          {health.thisMonthByStage.map((st) => (
            <tr key={st.stage}><td style={{ textAlign: "left", fontWeight: 500 }}>{st.stage}</td><td style={{ fontWeight: 600 }}>{fmtK(st.amount)}</td><td className="muted">{st.oppCount}</td><td className="muted">{Math.round(st.pctOfTotal)}%</td></tr>
          ))}
        </tbody>
      </table>
      {health.pastDueCount > 5 && (
        <div className="callout callout-red" style={{ marginTop: 12 }}>
          <strong style={{ color: "var(--red)" }}>{health.pastDueCount} opps have close dates in the past</strong> — these need updating. Total past-due pipeline: {fmtK(health.pastDueAmount)}.
        </div>
      )}
    </div>
  );
}
