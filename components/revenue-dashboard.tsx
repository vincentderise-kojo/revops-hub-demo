"use client";

import { useState, useMemo } from "react";
import { CwOpportunity, PipelineOppForRevenue, SegmentBreakdownRow, ChannelBreakdownNode, ChannelTrendData, FunnelData, StageConversionTrend, QuarterlyFunnel } from "@/lib/types-revenue";
import { computeSegmentBreakdown, computeChannelBreakdown, computeChannelTrend, computeFunnel, computeStageConversionTrend, computeQuarterlyFunnels, maxStageReached, enrichSegmentBreakdown } from "@/lib/process-revenue";
import { SFDC_BASE_URL } from "@/lib/config";
import { fmtK, fmtDollar } from "@/lib/format";
import Link from "next/link";

// ── Period Types ──
type PeriodOption = "last-month" | "last-quarter" | "this-quarter" | "last-6-months" | "last-12-months" | "this-fy" | "last-fy" | "all-time";

const PERIOD_LABELS: Record<PeriodOption, string> = {
  "last-month": "Last month",
  "last-quarter": "Last quarter",
  "this-quarter": "This quarter",
  "last-6-months": "Last 6 months",
  "last-12-months": "Last 12 months",
  "this-fy": "This fiscal year",
  "last-fy": "Last fiscal year",
  "all-time": "Since FY2025",
};

// ── Segment Scope (page-level) ──
type SegmentScope = "All" | "MM" | "ENT";

// ── Tabs ──
type ActiveTab = "snapshot" | "trend" | "funnel";

// ── Period range helpers (supports current + prior-period deltas) ──
type PeriodRange = { start: Date | null; end: Date | null };

function getPeriodRange(period: PeriodOption, now: Date, offset: 0 | -1 = 0): PeriodRange {
  switch (period) {
    case "last-month": {
      const m = now.getMonth() + (offset === 0 ? -1 : -2);
      const start = new Date(now.getFullYear(), m, 1);
      const end = new Date(now.getFullYear(), m + 1, 0, 23, 59, 59, 999);
      return { start, end };
    }
    case "last-quarter": {
      const currentQ = Math.floor(now.getMonth() / 3);
      const targetQ = currentQ + (offset === 0 ? -1 : -2);
      const year = now.getFullYear() + Math.floor(targetQ / 4);
      const q = ((targetQ % 4) + 4) % 4;
      const start = new Date(year, q * 3, 1);
      const end = new Date(year, q * 3 + 3, 0, 23, 59, 59, 999);
      return { start, end };
    }
    case "this-quarter": {
      const currentQ = Math.floor(now.getMonth() / 3);
      if (offset === 0) return { start: new Date(now.getFullYear(), currentQ * 3, 1), end: null };
      const targetQ = currentQ - 1;
      const year = now.getFullYear() + Math.floor(targetQ / 4);
      const q = ((targetQ % 4) + 4) % 4;
      return { start: new Date(year, q * 3, 1), end: new Date(year, q * 3 + 3, 0, 23, 59, 59, 999) };
    }
    case "last-6-months": {
      if (offset === 0) {
        return { start: new Date(now.getFullYear(), now.getMonth() - 6, now.getDate()), end: null };
      }
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 12, now.getDate()),
        end: new Date(now.getFullYear(), now.getMonth() - 6, now.getDate() - 1, 23, 59, 59, 999),
      };
    }
    case "last-12-months": {
      if (offset === 0) {
        return { start: new Date(now.getFullYear(), now.getMonth() - 12, now.getDate()), end: null };
      }
      return {
        start: new Date(now.getFullYear(), now.getMonth() - 24, now.getDate()),
        end: new Date(now.getFullYear(), now.getMonth() - 12, now.getDate() - 1, 23, 59, 59, 999),
      };
    }
    case "this-fy": {
      if (offset === 0) return { start: new Date(now.getFullYear(), 0, 1), end: null };
      return {
        start: new Date(now.getFullYear() - 1, 0, 1),
        end: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999),
      };
    }
    case "last-fy": {
      const y = now.getFullYear() + (offset === 0 ? -1 : -2);
      return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59, 999) };
    }
    case "all-time":
      return { start: null, end: null };
  }
}

function inRange(date: Date, range: PeriodRange): boolean {
  if (range.start && date < range.start) return false;
  if (range.end && date > range.end) return false;
  return true;
}

// Data starts FY2025 — any prior window starting before this point is incomplete
// and would produce misleading "vs prior" deltas (Last 12 months partial, Last FY zero).
const DATA_START_DATE = new Date(2025, 0, 1);

function priorPeriodInData(period: PeriodOption, priorRange: PeriodRange): boolean {
  if (period === "all-time") return false;
  if (!priorRange.start) return false;
  return priorRange.start >= DATA_START_DATE;
}

interface RevenueDashboardProps {
  opps: CwOpportunity[];
  pipelineOpps: PipelineOppForRevenue[];
  dataSourceLabel: string;
}

export default function RevenueDashboard({ opps, pipelineOpps, dataSourceLabel }: RevenueDashboardProps) {
  const [activeTab, setActiveTab] = useState<ActiveTab>("snapshot");
  const [period, setPeriod] = useState<PeriodOption>("last-6-months");
  const [segmentScope, setSegmentScope] = useState<SegmentScope>("All");
  // When set, the Funnel Deals table filters to opps whose CURRENT stage
  // matches this. Driven by clicking a stage bar in the static funnel chart.
  const [funnelStageFilter, setFunnelStageFilter] = useState<string | null>(null);
  const [selectedSetTypes, setSelectedSetTypes] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedOwners, setSelectedOwners] = useState<string[]>([]);
  const [selectedSdrOwners, setSelectedSdrOwners] = useState<string[]>([]);
  const [selectedManagers, setSelectedManagers] = useState<string[]>([]);
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);

  // ── Compute filter options from full dataset ──
  const filterOptions = useMemo(() => {
    const setTypes = [...new Set(opps.map((o) => o.oppSetType).filter(Boolean))].sort();
    const sources = [...new Set(opps.map((o) => o.opportunitySource).filter(Boolean))].sort();
    const owners = [...new Set(opps.map((o) => o.owner).filter(Boolean))].sort();
    const sdrOwners = [...new Set(opps.map((o) => o.sdrOwner).filter(Boolean))].sort();
    const managers = [...new Set(opps.map((o) => o.manager).filter(Boolean))].sort();
    // Industries come from pipeline opps (CW opps don't carry Industry today)
    const industries = [...new Set(pipelineOpps.map((o) => o.industry).filter(Boolean))].sort();
    return { setTypes, sources, owners, sdrOwners, managers, industries };
  }, [opps, pipelineOpps]);

  // ── Period filter (CW opps, filtered by Close Date) ──
  const currentRange = useMemo(() => getPeriodRange(period, new Date(), 0), [period]);
  const priorRange = useMemo(() => getPeriodRange(period, new Date(), -1), [period]);

  const periodFiltered = useMemo(() => {
    return opps.filter((o) => inRange(new Date(o.closeDate), currentRange));
  }, [opps, currentRange]);

  const priorPeriodFiltered = useMemo(() => {
    if (!priorPeriodInData(period, priorRange)) return [];
    return opps.filter((o) => inRange(new Date(o.closeDate), priorRange));
  }, [opps, period, priorRange]);

  // ── Dimension filter applied to both current and prior windows ──
  const matchesDimensions = useMemo(() => {
    return (o: { oppSetType: string; opportunitySource: string; owner: string; sdrOwner: string; manager: string; segment: "MM" | "ENT"; industry?: string }) => {
      if (segmentScope !== "All" && o.segment !== segmentScope) return false;
      if (selectedSetTypes.length > 0 && !selectedSetTypes.includes(o.oppSetType)) return false;
      if (selectedSources.length > 0 && !selectedSources.includes(o.opportunitySource)) return false;
      if (selectedOwners.length > 0 && !selectedOwners.includes(o.owner)) return false;
      if (selectedSdrOwners.length > 0 && !selectedSdrOwners.includes(o.sdrOwner)) return false;
      if (selectedManagers.length > 0 && !selectedManagers.includes(o.manager)) return false;
      if (selectedIndustries.length > 0 && (!o.industry || !selectedIndustries.includes(o.industry))) return false;
      return true;
    };
  }, [segmentScope, selectedSetTypes, selectedSources, selectedOwners, selectedSdrOwners, selectedManagers, selectedIndustries]);

  const filtered = useMemo(() => periodFiltered.filter(matchesDimensions), [periodFiltered, matchesDimensions]);
  const priorFiltered = useMemo(() => priorPeriodFiltered.filter(matchesDimensions), [priorPeriodFiltered, matchesDimensions]);

  // ── Pipeline opps filtered by discovery date (cohort) — current + prior ──
  const filteredPipeline = useMemo(() => {
    return pipelineOpps.filter((o) => inRange(new Date(o.discoveryDate), currentRange) && matchesDimensions(o));
  }, [pipelineOpps, currentRange, matchesDimensions]);

  const priorFilteredPipeline = useMemo(() => {
    if (!priorPeriodInData(period, priorRange)) return [];
    return pipelineOpps.filter((o) => inRange(new Date(o.discoveryDate), priorRange) && matchesDimensions(o));
  }, [pipelineOpps, period, priorRange, matchesDimensions]);

  // ── Pipeline opps filtered by close date (closed-in-period) — current + prior ──
  // Only includes opps that have actually closed (Won or Lost) with Close Date in window.
  const closedInPeriodPipeline = useMemo(() => {
    return pipelineOpps.filter((o) => {
      if (!o.closeDate) return false;
      if (o.stage !== "Closed Won" && o.stage !== "Closed Lost") return false;
      return inRange(new Date(o.closeDate), currentRange) && matchesDimensions(o);
    });
  }, [pipelineOpps, currentRange, matchesDimensions]);

  const priorClosedInPeriodPipeline = useMemo(() => {
    if (!priorPeriodInData(period, priorRange)) return [];
    return pipelineOpps.filter((o) => {
      if (!o.closeDate) return false;
      if (o.stage !== "Closed Won" && o.stage !== "Closed Lost") return false;
      return inRange(new Date(o.closeDate), priorRange) && matchesDimensions(o);
    });
  }, [pipelineOpps, period, priorRange, matchesDimensions]);

  // ── Compute breakdowns and enrich with pipeline data ──
  const channelBreakdown = useMemo(() => {
    return computeChannelBreakdown(filtered, filteredPipeline, closedInPeriodPipeline);
  }, [filtered, filteredPipeline, closedInPeriodPipeline]);
  const segmentBreakdown = useMemo(() => {
    const base = computeSegmentBreakdown(filtered);
    return enrichSegmentBreakdown(base, filteredPipeline, closedInPeriodPipeline);
  }, [filtered, filteredPipeline, closedInPeriodPipeline]);

  // ── Channel trend (Trend tab) — full dataset, ignores period selector,
  //    respects segment + dimension filters via matchesDimensions ──
  const filteredAllTime = useMemo(() => opps.filter(matchesDimensions), [opps, matchesDimensions]);
  const channelTrend = useMemo(() => computeChannelTrend(filteredAllTime), [filteredAllTime]);

  // ── Funnel tab ──
  // Industry now lives in matchesDimensions (hydrated onto CW opps via oppId
  // match in page.tsx, native on pipeline opps). Funnel cohort is period-scoped
  // by Discovery Date; trend/snapshot cohort is all-time.
  const funnelFilteredPeriod = useMemo(() => {
    return pipelineOpps.filter((o) => inRange(new Date(o.discoveryDate), currentRange) && matchesDimensions(o));
  }, [pipelineOpps, currentRange, matchesDimensions]);

  const funnelFilteredAllTime = useMemo(() => {
    return pipelineOpps.filter((o) => matchesDimensions(o));
  }, [pipelineOpps, matchesDimensions]);

  const funnel = useMemo(() => computeFunnel(funnelFilteredPeriod), [funnelFilteredPeriod]);
  const stageTrend = useMemo(() => computeStageConversionTrend(funnelFilteredAllTime), [funnelFilteredAllTime]);
  const quarterlyFunnels = useMemo(() => computeQuarterlyFunnels(funnelFilteredAllTime), [funnelFilteredAllTime]);

  // ── Summary stats (current period) ──
  const totalArr = filtered.reduce((s, o) => s + o.recurringArr, 0);
  const totalAcceleratedArr = filtered.reduce((s, o) => s + o.acceleratedArr, 0);
  const totalCount = filtered.length;
  const avgDeal = totalCount > 0 ? totalArr / totalCount : 0;
  const topSource = useMemo(() => {
    const totals = new Map<string, number>();
    for (const o of filtered) totals.set(o.opportunitySource, (totals.get(o.opportunitySource) ?? 0) + o.recurringArr);
    let best = "—";
    let bestArr = 0;
    for (const [k, v] of totals) if (v > bestArr) { best = k; bestArr = v; }
    return best;
  }, [filtered]);
  const totalPipelineGenerated = filteredPipeline.reduce((s, o) => s + o.amount, 0);
  const cohortWon = filteredPipeline.filter((o) => o.stage === "Closed Won").length;
  const cohortTotal = filteredPipeline.length;
  const overallWinRateCohort = cohortTotal > 0 ? (cohortWon / cohortTotal) * 100 : 0;

  const closedWon = closedInPeriodPipeline.filter((o) => o.stage === "Closed Won").length;
  const closedLost = closedInPeriodPipeline.filter((o) => o.stage === "Closed Lost").length;
  const overallWinRateClosed = (closedWon + closedLost) > 0 ? (closedWon / (closedWon + closedLost)) * 100 : 0;

  // ── Summary stats (prior period, for POP deltas) ──
  const priorStats = useMemo(() => {
    if (!priorPeriodInData(period, priorRange)) return null;
    const arr = priorFiltered.reduce((s, o) => s + o.recurringArr, 0);
    const accelArr = priorFiltered.reduce((s, o) => s + o.acceleratedArr, 0);
    const count = priorFiltered.length;
    const pipeGen = priorFilteredPipeline.reduce((s, o) => s + o.amount, 0);
    const cohW = priorFilteredPipeline.filter((o) => o.stage === "Closed Won").length;
    const cohTotal = priorFilteredPipeline.length;
    const winRateCohort = cohTotal > 0 ? (cohW / cohTotal) * 100 : 0;
    const clW = priorClosedInPeriodPipeline.filter((o) => o.stage === "Closed Won").length;
    const clL = priorClosedInPeriodPipeline.filter((o) => o.stage === "Closed Lost").length;
    const winRateClosed = (clW + clL) > 0 ? (clW / (clW + clL)) * 100 : 0;
    return {
      arr,
      accelArr,
      count,
      avgDeal: count > 0 ? arr / count : 0,
      pipeGen,
      winRateCohort,
      winRateClosed,
    };
  }, [period, priorFiltered, priorFilteredPipeline, priorClosedInPeriodPipeline]);

  const pctDelta = (current: number, prior: number): number | null => {
    if (prior === 0) return null;
    return ((current - prior) / prior) * 100;
  };

  const ppDelta = (current: number, prior: number): number => current - prior;

  const hasFilters = selectedSetTypes.length > 0 || selectedSources.length > 0 || selectedOwners.length > 0 || selectedSdrOwners.length > 0 || selectedManagers.length > 0 || selectedIndustries.length > 0;

  return (
    <>
      {/* Header */}
      <div className="page-header">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Revenue &amp; Funnel</h1>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>
              Closed-won revenue by origination channel, segment, and quarterly trend
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 10, color: "var(--muted)" }}>
              {dataSourceLabel} · {opps.length} total CW opps · data starts FY2025
            </span>
            <Link href="/hub" style={{ fontSize: 11, color: "var(--teal)", textDecoration: "none" }}>
              ← Hub
            </Link>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 4, borderBottom: "1px solid var(--border)" }}>
        {([
          { key: "snapshot" as ActiveTab, label: "Snapshot" },
          { key: "trend" as ActiveTab, label: "Revenue Trend" },
          { key: "funnel" as ActiveTab, label: "Funnel Conversion" },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              background: "transparent",
              border: "none",
              borderBottom: activeTab === tab.key ? "2px solid var(--teal)" : "2px solid transparent",
              color: activeTab === tab.key ? "var(--text)" : "var(--muted)",
              padding: "8px 14px",
              fontSize: 12,
              fontWeight: activeTab === tab.key ? 700 : 500,
              cursor: "pointer",
              marginBottom: -1,
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="card" style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center", padding: "10px 14px" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", marginRight: 4 }}>Filters</div>

        {/* Segment toggle (page-level) */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden" }}>
          {(["All", "MM", "ENT"] as SegmentScope[]).map((s) => (
            <button
              key={s}
              onClick={() => setSegmentScope(s)}
              style={{
                background: segmentScope === s ? "var(--teal)" : "var(--bg)",
                color: segmentScope === s ? "var(--card)" : "var(--text)",
                border: "none",
                padding: "4px 10px",
                fontSize: 10,
                fontWeight: segmentScope === s ? 700 : 500,
                cursor: "pointer",
              }}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Period — hidden on Revenue Trend (chart always shows full FY2025+ history).
            Visible on Snapshot (scopes the page) and Funnel (drives the static funnel chart). */}
        {activeTab !== "trend" && (
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value as PeriodOption)}
            style={{
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              color: "var(--text)",
              padding: "4px 8px",
              fontSize: 10,
            }}
          >
            {(Object.keys(PERIOD_LABELS) as PeriodOption[]).map((key) => (
              <option key={key} value={key}>{PERIOD_LABELS[key]}</option>
            ))}
          </select>
        )}

        {/* Dimension filters */}
        <MultiSelect label="Set Type" options={filterOptions.setTypes} selected={selectedSetTypes} onChange={setSelectedSetTypes} />
        <MultiSelect label="Source" options={filterOptions.sources} selected={selectedSources} onChange={setSelectedSources} />
        <MultiSelect label="Owner" options={filterOptions.owners} selected={selectedOwners} onChange={setSelectedOwners} />
        <MultiSelect label="SDR" options={filterOptions.sdrOwners} selected={selectedSdrOwners} onChange={setSelectedSdrOwners} />
        <MultiSelect label="Team" options={filterOptions.managers} selected={selectedManagers} onChange={setSelectedManagers} />

        <MultiSelect label="Industry" options={filterOptions.industries} selected={selectedIndustries} onChange={setSelectedIndustries} />

        {hasFilters && (
          <button
            onClick={() => {
              setSelectedSetTypes([]);
              setSelectedSources([]);
              setSelectedOwners([]);
              setSelectedSdrOwners([]);
              setSelectedManagers([]);
              setSelectedIndustries([]);
            }}
            style={{
              background: "none",
              border: "none",
              color: "var(--red)",
              fontSize: 10,
              cursor: "pointer",
              padding: "4px 8px",
            }}
          >
            Clear all
          </button>
        )}
      </div>

      {activeTab === "snapshot" && <>
      {/* Summary stats */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        <StatCard
          label="CW Deals"
          value={totalCount.toString()}
          deltaPct={priorStats ? pctDelta(totalCount, priorStats.count) : null}
        />
        <StatCard
          label="Recurring ARR"
          value={fmtK(totalArr)}
          deltaPct={priorStats ? pctDelta(totalArr, priorStats.arr) : null}
        />
        <StatCard
          label="Accelerated ARR"
          value={fmtK(totalAcceleratedArr)}
          deltaPct={priorStats ? pctDelta(totalAcceleratedArr, priorStats.accelArr) : null}
        />
        <StatCard
          label="Avg Deal Size"
          value={fmtDollar(avgDeal)}
          deltaPct={priorStats ? pctDelta(avgDeal, priorStats.avgDeal) : null}
        />
        <StatCard
          label="Pipeline Generated"
          value={fmtK(totalPipelineGenerated)}
          deltaPct={priorStats ? pctDelta(totalPipelineGenerated, priorStats.pipeGen) : null}
        />
        <StatCard
          label="Win Rate (Closed)"
          value={`${overallWinRateClosed.toFixed(1)}%`}
          subtitle="Wins ÷ (Wins + Losses) · closed in period"
          deltaPp={priorStats ? ppDelta(overallWinRateClosed, priorStats.winRateClosed) : null}
        />
        <StatCard
          label="CCWR"
          value={`${overallWinRateCohort.toFixed(1)}%`}
          subtitle="Wins ÷ Total Cohort · created in period"
          deltaPp={priorStats ? ppDelta(overallWinRateCohort, priorStats.winRateCohort) : null}
        />
        <StatCard label="Top Source" value={topSource} />
      </div>
      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: -4, fontStyle: "italic" }}>
        CCWR (Created Cohort Win Rate) matches the /ccwr dashboard methodology — denominator includes open opps. Rate will trend low for recent periods until opps close.
      </div>

      {/* Segment Snapshot — bar on left, MM-vs-ENT comparison rows on right */}
      <SegmentSnapshot rows={segmentBreakdown} />

      {/* Origination Channel breakdown (nested) */}
      <ChannelBreakdownSection rows={channelBreakdown} />

      {/* All CW Deals */}
      <div className="card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>All CW Deals</div>
          <div style={{ fontSize: 10, color: "var(--muted)" }}>{filtered.length} deals · sorted by Recurring ARR</div>
        </div>
        <div style={{ maxHeight: 500, overflowY: "auto" }}>
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Opportunity</th>
                <th>Recurring ARR</th>
                <th>Close Date</th>
                <th style={{ textAlign: "left" }}>Owner</th>
                <th style={{ textAlign: "left" }}>Source</th>
                <th style={{ textAlign: "left" }}>Set Type</th>
                <th>Segment</th>
              </tr>
            </thead>
            <tbody>
              {[...filtered]
                .sort((a, b) => b.recurringArr - a.recurringArr)
                .map((opp) => {
                  const cd = new Date(opp.closeDate);
                  const dateStr = `${cd.getMonth() + 1}/${cd.getDate()}/${cd.getFullYear()}`;
                  return (
                    <tr key={opp.name + opp.closeDate}>
                      <td style={{ textAlign: "left", maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {opp.oppId ? (
                          <a
                            href={`${SFDC_BASE_URL}/${opp.oppId}/view`}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ color: "var(--teal)", textDecoration: "none" }}
                          >
                            {opp.name}
                          </a>
                        ) : (
                          opp.name
                        )}
                      </td>
                      <td style={{ fontWeight: 600 }}>{fmtDollar(opp.recurringArr)}</td>
                      <td style={{ color: "var(--muted)", fontSize: 10 }}>{dateStr}</td>
                      <td style={{ textAlign: "left", fontSize: 10 }}>{opp.owner}</td>
                      <td style={{ textAlign: "left", fontSize: 10, color: "var(--muted)" }}>{opp.opportunitySource}</td>
                      <td style={{ textAlign: "left", fontSize: 10, color: "var(--muted)" }}>{opp.oppSetType}</td>
                      <td>
                        <span className={opp.segment === "ENT" ? "badge badge-teal" : "badge badge-blue"} style={{ fontSize: 9 }}>
                          {opp.segment}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>
      </>}

      {activeTab === "trend" && (
        <ChannelTrendChart data={channelTrend} segmentScope={segmentScope} hasFilters={hasFilters} />
      )}

      {activeTab === "funnel" && (
        <>
          <FunnelChart
            data={funnel}
            periodLabel={PERIOD_LABELS[period]}
            segmentScope={segmentScope}
            cohortOpps={funnelFilteredPeriod}
            selectedStage={funnelStageFilter}
            onStageClick={(stage) => setFunnelStageFilter((prev) => (prev === stage ? null : stage))}
          />
          <StageConversionTrendChart data={stageTrend} segmentScope={segmentScope} />
          <QuarterlyFunnelGrid data={quarterlyFunnels} segmentScope={segmentScope} />
          <FunnelDealsTable
            cohortOpps={funnelFilteredPeriod}
            stageFilter={funnelStageFilter}
            onClearStageFilter={() => setFunnelStageFilter(null)}
          />
        </>
      )}
    </>
  );
}

// ── MultiSelect Filter Component ──
function MultiSelect({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: selected.length > 0 ? "var(--green)" : "var(--bg)",
          color: selected.length > 0 ? "var(--card)" : "var(--text)",
          border: "1px solid var(--border)",
          borderRadius: 4,
          padding: "4px 8px",
          fontSize: 10,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
        }}
      >
        {label}
        {selected.length > 0 && (
          <span style={{
            background: "var(--card)",
            color: "var(--green)",
            borderRadius: 8,
            padding: "0 5px",
            fontSize: 9,
            fontWeight: 700,
          }}>
            {selected.length}
          </span>
        )}
      </button>
      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: 4,
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 6,
            padding: 6,
            zIndex: 100,
            maxHeight: 200,
            overflowY: "auto",
            minWidth: 180,
          }}
        >
          {options.map((opt) => (
            <label
              key={opt}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "3px 6px",
                fontSize: 11,
                cursor: "pointer",
                borderRadius: 3,
              }}
            >
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => {
                  onChange(
                    selected.includes(opt)
                      ? selected.filter((s) => s !== opt)
                      : [...selected, opt]
                  );
                }}
                style={{ accentColor: "var(--green)" }}
              />
              {opt}
            </label>
          ))}
          {selected.length > 0 && (
            <button
              onClick={() => { onChange([]); setOpen(false); }}
              style={{
                background: "none",
                border: "none",
                color: "var(--red)",
                fontSize: 10,
                cursor: "pointer",
                padding: "4px 6px",
                marginTop: 4,
                width: "100%",
                textAlign: "left",
              }}
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Stat Card (optional subtitle for formula + POP delta) ──
function StatCard({
  label,
  value,
  subtitle,
  deltaPct,
  deltaPp,
}: {
  label: string;
  value: string;
  subtitle?: string;
  deltaPct?: number | null;
  deltaPp?: number | null;
}) {
  const delta = deltaPct ?? deltaPp ?? null;
  const deltaText =
    delta === null || delta === undefined || !isFinite(delta)
      ? null
      : deltaPp !== null && deltaPp !== undefined
        ? `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(1)}pp vs prior`
        : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(1)}% vs prior`;
  const deltaColor = delta === null ? "var(--muted)" : delta >= 0 ? "var(--green)" : "var(--red)";

  return (
    <div className="card" style={{ textAlign: "center", padding: "14px 10px" }}>
      <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
      {subtitle && (
        <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 4, fontStyle: "italic" }}>
          {subtitle}
        </div>
      )}
      {deltaText && (
        <div style={{ fontSize: 10, color: deltaColor, marginTop: 4, fontWeight: 500 }}>
          {deltaText}
        </div>
      )}
    </div>
  );
}

// ── Win-rate rendering helpers (shared by hero + tables) ──
function winRateColor(pct: number | undefined): string {
  if (pct === undefined) return "var(--muted)";
  if (pct >= 20) return "var(--green)";
  if (pct >= 10) return "var(--yellow)";
  return "var(--red)";
}

function fmtWinRate(pct: number | undefined): string {
  if (pct === undefined) return "—";
  return `${pct.toFixed(1)}%`;
}

// ── Segment Snapshot (page-level MM vs ENT context) ──
function SegmentSnapshot({ rows }: { rows: SegmentBreakdownRow[] }) {
  const mm = rows.find((r) => r.label === "MidMarket");
  const ent = rows.find((r) => r.label === "Enterprise");
  if (!mm || !ent) return null;
  const totalArr = mm.arr + ent.arr;
  const mmPct = totalArr > 0 ? (mm.arr / totalArr) * 100 : 0;
  const entPct = totalArr > 0 ? (ent.arr / totalArr) * 100 : 0;

  const ComparisonRow = ({ label, mmVal, entVal, color }: { label: string; mmVal: string; entVal: string; color?: string }) => (
    <div style={{ display: "flex", alignItems: "center", padding: "6px 0", borderTop: "1px solid var(--border)" }}>
      <div style={{ flex: "0 0 110px", fontSize: 11, color: "var(--muted)" }}>{label}</div>
      <div style={{ flex: 1, display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--blue)" }}>
          MM <span style={{ color: color ?? "var(--text)", marginLeft: 6 }}>{mmVal}</span>
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--teal)" }}>
          ENT <span style={{ color: color ?? "var(--text)", marginLeft: 6 }}>{entVal}</span>
        </span>
      </div>
    </div>
  );

  return (
    <div className="card">
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Segment Snapshot</div>
      <div style={{ display: "flex", gap: 24, alignItems: "stretch" }}>
        {/* Left: stacked bar with $ + % labels */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div style={{ display: "flex", height: 28, borderRadius: 4, overflow: "hidden", background: "var(--border)" }}>
            {mm.arr > 0 && (
              <div title={`MidMarket: ${fmtK(mm.arr)} (${mmPct.toFixed(1)}%)`} style={{ width: `${mmPct}%`, background: "var(--blue)" }} />
            )}
            {ent.arr > 0 && (
              <div title={`Enterprise: ${fmtK(ent.arr)} (${entPct.toFixed(1)}%)`} style={{ width: `${entPct}%`, background: "var(--teal)" }} />
            )}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--blue)" }}>● MidMarket</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{fmtK(mm.arr)}</div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>{mmPct.toFixed(1)}% · {mm.count} deals</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--teal)" }}>● Enterprise</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 2 }}>{fmtK(ent.arr)}</div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>{entPct.toFixed(1)}% · {ent.count} deals</div>
            </div>
          </div>
        </div>

        {/* Right: comparison rows */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <ComparisonRow label="Avg Deal Size" mmVal={fmtDollar(mm.avgDealSize)} entVal={fmtDollar(ent.avgDealSize)} />
          <ComparisonRow label="Win Rate (Closed)" mmVal={fmtWinRate(mm.winRateClosed)} entVal={fmtWinRate(ent.winRateClosed)} />
          <ComparisonRow label="CCWR" mmVal={fmtWinRate(mm.winRateCohort)} entVal={fmtWinRate(ent.winRateCohort)} />
          <ComparisonRow label="Pipeline Generated" mmVal={fmtK(mm.pipelineGenerated ?? 0)} entVal={fmtK(ent.pipelineGenerated ?? 0)} />
        </div>
      </div>
    </div>
  );
}

// ── Funnel Chart (Funnel tab, top) ──
// Pyramid layout: stage label fixed on the left, centered bar in the middle
// (width proportional to reach count, narrows visually as cohort drops off),
// reach count inside the bar. Conversion % rendered in the gap between rows.
function FunnelChart({
  data,
  periodLabel,
  segmentScope,
  cohortOpps,
  selectedStage,
  onStageClick,
}: {
  data: FunnelData;
  periodLabel: string;
  segmentScope: SegmentScope;
  cohortOpps: PipelineOppForRevenue[];
  selectedStage: string | null;
  onStageClick: (stage: string) => void;
}) {
  const { cohortSize, rows } = data;
  // Heat gradient — cool at the top of the funnel, narrowing toward green
  // (winning) at the bottom. Stage colors are reused as line colors on the
  // Stage Conversion trend chart (each line colored by its destination stage)
  // so the two charts read together.
  const stageColors: Record<string, string> = {
    "Discovery": "var(--blue)",
    "Evaluation": "var(--teal)",
    "Contracts/Negotiation": "var(--yellow)",
    "Final Approvals": "var(--kojo-yellow)",
    "Closed Won": "var(--green)",
  };

  const won = rows.find((r) => r.stage === "Closed Won")?.reached ?? 0;
  const lost = cohortOpps.filter((o) => o.stage === "Closed Lost" || o.stage === "Unable to Qualify/Engage").length;
  const open = cohortSize - won - lost;
  const wonPct = cohortSize > 0 ? (won / cohortSize) * 100 : 0;
  const lostPct = cohortSize > 0 ? (lost / cohortSize) * 100 : 0;
  const openPct = cohortSize > 0 ? (open / cohortSize) * 100 : 0;

  const StatBox = ({ label, count, pct, tooltip }: { label: string; count: number; pct: number; tooltip: string }) => (
    <div
      title={tooltip}
      style={{
        textAlign: "right",
        padding: "6px 12px",
        background: "var(--bg)",
        borderRadius: 6,
        borderLeft: "3px solid var(--border)",
        minWidth: 150,
        flex: "0 1 auto",
      }}
    >
      <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", lineHeight: 1.1, marginTop: 2 }}>
        {pct.toFixed(1)}%
      </div>
      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
        {count} of {cohortSize} cohort
      </div>
    </div>
  );

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4, gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Funnel Conversion</div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
            Cohort: opps with Discovery Date in {periodLabel} · {cohortSize} opps · scope {segmentScope}
          </div>
        </div>
        {cohortSize > 0 && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <StatBox label="Discovery → Closed Won" count={won} pct={wonPct} tooltip={`${won} of ${cohortSize} cohort opps reached Closed Won`} />
            <StatBox label="Discovery → Closed Lost" count={lost} pct={lostPct} tooltip={`${lost} of ${cohortSize} cohort opps ended Closed Lost or Unable to Qualify`} />
            <StatBox label="Discovery → Still Open" count={open} pct={openPct} tooltip={`${open} of ${cohortSize} cohort opps are still active in the pipeline`} />
          </div>
        )}
      </div>

      {cohortSize === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: "var(--muted)", fontSize: 12 }}>
          No opps in this period — try a wider date range or clear filters.
        </div>
      ) : (
        <div style={{ marginTop: 16 }}>
          {rows.map((row, i) => {
            const widthPct = cohortSize > 0 ? (row.reached / cohortSize) * 100 : 0;
            const conv = row.conversionFromPrev;
            const dropFromAbove = i > 0 ? rows[i - 1].reached - row.reached : 0;
            const stageColor = stageColors[row.stage];

            return (
              <div key={row.stage}>
                {/* Conversion % between this row and the previous row */}
                {i > 0 && conv !== null && (
                  <div
                    title={`${dropFromAbove} opps dropped between ${rows[i - 1].stage} and ${row.stage}`}
                    style={{
                      textAlign: "center",
                      padding: "8px 0",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "var(--text)",
                    }}
                  >
                    ↓ {conv.toFixed(1)}%
                  </div>
                )}

                {/* Row: label | centered bar | (no right column) */}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "150px 1fr",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <div
                    style={{
                      textAlign: "right",
                      fontSize: 12,
                      fontWeight: 600,
                      color: stageColor,
                    }}
                  >
                    {row.stage}
                  </div>
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => onStageClick(row.stage)}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onStageClick(row.stage); }}
                      title={`${row.stage}: ${row.reached} opps reached (${widthPct.toFixed(1)}% of cohort) · click to filter table below to opps currently in ${row.stage}`}
                      style={{
                        width: `${Math.max(widthPct, 3)}%`,
                        height: 36,
                        background: stageColor,
                        opacity: selectedStage === null || selectedStage === row.stage ? 0.9 : 0.35,
                        borderRadius: 4,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--card)",
                        fontWeight: 700,
                        fontSize: 13,
                        whiteSpace: "nowrap",
                        transition: "width 200ms ease, opacity 150ms ease",
                        cursor: "pointer",
                        outline: selectedStage === row.stage ? `2px solid var(--text)` : "none",
                        outlineOffset: 2,
                      }}
                    >
                      {row.reached}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 16, fontStyle: "italic", lineHeight: 1.5 }}>
        Each bar&apos;s width is proportional to the # of opps that reached that stage. Conversion % between adjacent stages = (opps reaching this stage) ÷ (opps reaching previous stage). Hover any bar for cohort-share %; hover the conversion % for drop count. Stage progression detected via stage-entry dates (Discovery / Evaluation / Negotiation Date) plus current Stage. Final Approvals reach is inferred from current Stage ∈ {`{Final Approvals, Closed Won}`} — Closed Lost opps that died at Final Approvals aren&apos;t detectable from the data and will undercount slightly.
      </div>
    </div>
  );
}

// ── Funnel Deals Table (Funnel tab, bottom card) ──
// Lists every cohort opp with its current stage, max stage reached, and key
// dimensions. Sortable by clicking column headers. Filtered to a single stage
// when the user clicks a bar in the static funnel chart above.
type FunnelDealsSortKey = "name" | "stage" | "maxStage" | "discoveryDate" | "industry" | "amount" | "owner";
function FunnelDealsTable({
  cohortOpps,
  stageFilter,
  onClearStageFilter,
}: {
  cohortOpps: PipelineOppForRevenue[];
  stageFilter: string | null;
  onClearStageFilter: () => void;
}) {
  const [sortKey, setSortKey] = useState<FunnelDealsSortKey>("amount");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    if (!stageFilter) return cohortOpps;
    return cohortOpps.filter((o) => o.stage === stageFilter);
  }, [cohortOpps, stageFilter]);

  const enriched = useMemo(() => {
    return filtered.map((o) => ({
      opp: o,
      maxStage: maxStageReached(o),
    }));
  }, [filtered]);

  const sorted = useMemo(() => {
    const arr = [...enriched];
    const dir = sortDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name": cmp = a.opp.name.localeCompare(b.opp.name); break;
        case "stage": cmp = a.opp.stage.localeCompare(b.opp.stage); break;
        case "maxStage": cmp = a.maxStage.localeCompare(b.maxStage); break;
        case "discoveryDate": cmp = new Date(a.opp.discoveryDate).getTime() - new Date(b.opp.discoveryDate).getTime(); break;
        case "industry": cmp = (a.opp.industry || "").localeCompare(b.opp.industry || ""); break;
        case "amount": cmp = a.opp.amount - b.opp.amount; break;
        case "owner": cmp = a.opp.owner.localeCompare(b.opp.owner); break;
      }
      return cmp * dir;
    });
    return arr;
  }, [enriched, sortKey, sortDir]);

  const SortHeader = ({ label, k, align }: { label: string; k: FunnelDealsSortKey; align?: "left" | "right" | "center" }) => (
    <th
      onClick={() => {
        if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
        else { setSortKey(k); setSortDir(k === "amount" || k === "discoveryDate" ? "desc" : "asc"); }
      }}
      style={{ textAlign: align ?? "left", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
    >
      {label}{sortKey === k ? (sortDir === "asc" ? " ▲" : " ▼") : ""}
    </th>
  );

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Funnel Deals</div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
            Cohort opps (Discovery Date in selected period) · respects all filters · click any column header to sort · click a stage bar above to filter
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {stageFilter && (
            <span
              onClick={onClearStageFilter}
              style={{
                fontSize: 10,
                padding: "4px 10px",
                background: "var(--teal)",
                color: "var(--card)",
                borderRadius: 4,
                fontWeight: 700,
                cursor: "pointer",
              }}
              title="Click to clear stage filter"
            >
              Stage: {stageFilter} · clear ×
            </span>
          )}
          <span style={{ fontSize: 10, color: "var(--muted)" }}>{sorted.length} deal{sorted.length === 1 ? "" : "s"}</span>
        </div>
      </div>

      <div style={{ maxHeight: 500, overflowY: "auto" }}>
        <table>
          <thead>
            <tr>
              <SortHeader label="Opportunity" k="name" />
              <SortHeader label="Stage" k="stage" />
              <SortHeader label="Max Reached" k="maxStage" />
              <SortHeader label="Discovery Date" k="discoveryDate" />
              <SortHeader label="Industry" k="industry" />
              <th>Segment</th>
              <th style={{ textAlign: "left" }}>Source</th>
              <th style={{ textAlign: "left" }}>Set Type</th>
              <SortHeader label="Amount" k="amount" align="right" />
              <SortHeader label="Owner" k="owner" />
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ opp, maxStage }, i) => {
              const dd = opp.discoveryDate ? new Date(opp.discoveryDate) : null;
              const dateStr = dd && !isNaN(dd.getTime()) ? `${dd.getMonth() + 1}/${dd.getDate()}/${dd.getFullYear()}` : "—";
              return (
                <tr key={`${opp.oppId || opp.name}-${i}`}>
                  <td style={{ textAlign: "left", maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {opp.oppId ? (
                      <a
                        href={`${SFDC_BASE_URL}/${opp.oppId}/view`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "var(--teal)", textDecoration: "none" }}
                      >
                        {opp.name}
                      </a>
                    ) : (
                      opp.name || "—"
                    )}
                  </td>
                  <td style={{ textAlign: "left", fontSize: 10 }}>{opp.stage}</td>
                  <td style={{ textAlign: "left", fontSize: 10, color: "var(--muted)" }}>{maxStage}</td>
                  <td style={{ textAlign: "left", fontSize: 10, color: "var(--muted)" }}>{dateStr}</td>
                  <td style={{ textAlign: "left", fontSize: 10, color: "var(--muted)" }}>{opp.industry || "—"}</td>
                  <td>
                    <span className={opp.segment === "ENT" ? "badge badge-teal" : "badge badge-blue"} style={{ fontSize: 9 }}>
                      {opp.segment}
                    </span>
                  </td>
                  <td style={{ textAlign: "left", fontSize: 10, color: "var(--muted)" }}>{opp.opportunitySource}</td>
                  <td style={{ textAlign: "left", fontSize: 10, color: "var(--muted)" }}>{opp.oppSetType}</td>
                  <td style={{ fontWeight: 600, textAlign: "right" }}>{fmtDollar(opp.amount)}</td>
                  <td style={{ textAlign: "left", fontSize: 10 }}>{opp.owner}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div style={{ padding: 20, textAlign: "center", color: "var(--muted)", fontSize: 11 }}>
            No deals match the current filters{stageFilter ? ` (stage: ${stageFilter})` : ""}.
          </div>
        )}
      </div>
    </div>
  );
}

// ── Quarterly Funnel Grid (Funnel tab, third card) ──
// Small-multiples: one mini-funnel per quarter, side by side, so the reader
// can eyeball how the full funnel shape evolved quarter over quarter. Each
// mini-funnel scales to its own cohort (the visualization is about SHAPE);
// cohort size and win rate render as labels above each mini.
function QuarterlyFunnelGrid({
  data,
  segmentScope,
}: {
  data: QuarterlyFunnel[];
  segmentScope: SegmentScope;
}) {
  const stageColors: Record<string, string> = {
    "Discovery": "var(--blue)",
    "Evaluation": "var(--teal)",
    "Contracts/Negotiation": "var(--yellow)",
    "Final Approvals": "var(--kojo-yellow)",
    "Closed Won": "var(--green)",
  };

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Quarterly Funnel Snapshots</div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
            One mini-funnel per quarter · cohort = opps with Discovery Date in quarter · each mini scales to its own cohort so shape stays comparable · scope {segmentScope}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${data.length}, minmax(120px, 1fr))`,
          gap: 10,
          marginTop: 14,
          overflowX: "auto",
        }}
      >
        {data.map(({ quarter, partial, funnel }) => {
          const { cohortSize, rows } = funnel;
          const wonRate = cohortSize > 0 ? (rows[rows.length - 1].reached / cohortSize) * 100 : 0;
          return (
            <div
              key={quarter}
              style={{
                background: "var(--bg)",
                borderRadius: 6,
                padding: "10px 8px",
                opacity: partial ? 0.75 : 1,
                border: partial ? "1px dashed var(--border)" : "1px solid transparent",
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, textAlign: "center", color: "var(--text)" }}>
                {quarter.replace("-", " ")}{partial ? "*" : ""}
              </div>
              <div style={{ fontSize: 9, color: "var(--muted)", textAlign: "center", marginBottom: 8 }}>
                {cohortSize} opps{cohortSize > 0 ? ` · ${wonRate.toFixed(1)}% won` : ""}
              </div>
              {cohortSize === 0 ? (
                <div style={{ fontSize: 9, color: "var(--muted)", textAlign: "center", padding: "8px 0" }}>
                  No cohort
                </div>
              ) : (
                rows.map((row) => {
                  const widthPct = (row.reached / cohortSize) * 100;
                  return (
                    <div key={row.stage} style={{ display: "flex", justifyContent: "center", marginBottom: 3 }}>
                      <div
                        title={`${row.stage}: ${row.reached} (${widthPct.toFixed(1)}% of cohort)`}
                        style={{
                          width: `${Math.max(widthPct, 6)}%`,
                          height: 16,
                          background: stageColors[row.stage],
                          opacity: 0.9,
                          borderRadius: 2,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--card)",
                          fontSize: 9,
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {row.reached >= 5 ? row.reached : ""}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 10, fontStyle: "italic" }}>
        * Latest quarter is in flight — fewer opps and incomplete conversion. Hover any bar for stage name + cohort %.
      </div>
    </div>
  );
}

// ── Stage Conversion Trend Chart (Funnel tab, bottom) ──
// Multi-line chart, x = quarter, y = conversion %, one line per adjacent-stage transition.
function StageConversionTrendChart({
  data,
  segmentScope,
}: {
  data: StageConversionTrend;
  segmentScope: SegmentScope;
}) {
  const { quarters, series } = data;

  const W = 900;
  const H = 320;
  const padTop = 24;
  const padBottom = 44;
  const padLeft = 56;
  const padRight = 24;
  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;
  const yMax = 100; // percent

  function xPos(i: number): number {
    if (quarters.length <= 1) return padLeft + plotW / 2;
    return padLeft + (i / (quarters.length - 1)) * plotW;
  }
  function yPos(rate: number): number {
    return padTop + plotH - (rate / yMax) * plotH;
  }

  const yTicks = [0, 25, 50, 75, 100].map((t) => ({ v: t, y: yPos(t) }));

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>Stage Conversion Over Time</div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
            Quarter-over-quarter conversion % for each adjacent stage transition · cohort = opps with Discovery Date in quarter · period selector ignored · latest quarter dashed = in flight · scope {segmentScope}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 14, marginTop: 10, marginBottom: 10, flexWrap: "wrap" }}>
        {series.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <span style={{ display: "inline-block", width: 18, height: 3, background: s.color, borderRadius: 1 }} />
            <span style={{ fontWeight: 600 }}>
              {s.fromStage} → {s.toStage}
              {s.fromStage === "Discovery" && s.toStage === "Closed Won" ? " (overall)" : ""}
            </span>
          </div>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "auto" }}>
        {yTicks.map((t) => (
          <g key={t.v}>
            <line x1={padLeft} x2={W - padRight} y1={t.y} y2={t.y} stroke="var(--border)" strokeDasharray="2 3" />
            <text x={padLeft - 8} y={t.y + 4} fontSize="10" fill="var(--muted)" textAnchor="end">
              {t.v}%
            </text>
          </g>
        ))}

        {quarters.map((q, i) => (
          <text key={q} x={xPos(i)} y={H - padBottom + 18} fontSize="10" fill="var(--muted)" textAnchor="middle">
            {q.replace("-", " ")}
          </text>
        ))}

        {series.map((s) => {
          const pts = s.points.map((p, i) => ({ x: xPos(i), y: p.rate !== null ? yPos(p.rate) : null, partial: p.partial, raw: p }));
          const solidSegs: string[] = [];
          const dashSegs: string[] = [];
          for (let i = 0; i < pts.length - 1; i += 1) {
            const a = pts[i];
            const b = pts[i + 1];
            if (a.y === null || b.y === null) continue; // skip undefined-rate gaps
            const seg = `M${a.x},${a.y} L${b.x},${b.y}`;
            if (b.partial) dashSegs.push(seg);
            else solidSegs.push(seg);
          }
          return (
            <g key={s.label}>
              {solidSegs.map((d, i) => (
                <path key={`sol-${i}`} d={d} stroke={s.color} strokeWidth="2" fill="none" strokeLinecap="round" />
              ))}
              {dashSegs.map((d, i) => (
                <path key={`dash-${i}`} d={d} stroke={s.color} strokeWidth="2" fill="none" strokeLinecap="round" strokeDasharray="5 4" />
              ))}
              {pts.map((p, i) => {
                if (p.y === null) return null;
                return (
                  <circle key={`c-${i}`} cx={p.x} cy={p.y} r={p.partial ? 3 : 4} fill={p.partial ? "var(--bg)" : s.color} stroke={s.color} strokeWidth={p.partial ? 2 : 0}>
                    <title>{`${s.fromStage}→${s.toStage} · ${p.raw.quarter.replace("-", " ")}${p.partial ? " (partial)" : ""}: ${p.raw.rate !== null ? p.raw.rate.toFixed(1) + "%" : "—"} (${p.raw.reachedTo}/${p.raw.reachedFrom})`}</title>
                  </circle>
                );
              })}
            </g>
          );
        })}
      </svg>

      {/* Companion table for exact values */}
      <div style={{ marginTop: 14, overflow: "auto" }}>
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Transition</th>
              {quarters.map((q) => {
                const isPartial = series[0]?.points.find((p) => p.quarter === q)?.partial;
                return (
                  <th key={q} style={{ fontSize: 10 }}>
                    {q.replace("-", " ")}{isPartial ? "*" : ""}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {series.map((s) => (
              <tr key={s.label}>
                <td style={{ textAlign: "left", fontWeight: 600, color: s.color, fontSize: 11 }}>{s.fromStage} → {s.toStage}</td>
                {s.points.map((p) => (
                  <td key={p.quarter} style={{ fontSize: 11, color: p.rate !== null ? "var(--text)" : "var(--muted)" }} title={`${p.reachedTo}/${p.reachedFrom}`}>
                    {p.rate !== null ? `${p.rate.toFixed(1)}%` : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 6, fontStyle: "italic" }}>
          * Latest quarter is in flight; recent cohorts may not yet have had time to convert through later stages, so Final Approvals → Closed Won will read low until they mature.
        </div>
      </div>
    </div>
  );
}

// ── Channel Trend Chart (Trend tab) ──
function ChannelTrendChart({
  data,
  segmentScope,
  hasFilters,
}: {
  data: ChannelTrendData;
  segmentScope: SegmentScope;
  hasFilters: boolean;
}) {
  const { quarters, series, maxArr } = data;

  // Chart dimensions (responsive width via viewBox + preserveAspectRatio)
  const W = 900;
  const H = 320;
  const padTop = 24;
  const padBottom = 44;
  const padLeft = 64;
  const padRight = 24;
  const plotW = W - padLeft - padRight;
  const plotH = H - padTop - padBottom;

  // Round maxArr up to a clean grid value
  const gridMax = (() => {
    if (maxArr <= 0) return 100_000;
    const niceSteps = [50_000, 100_000, 250_000, 500_000, 1_000_000, 2_500_000, 5_000_000];
    for (const s of niceSteps) if (s >= maxArr) return s;
    return Math.ceil(maxArr / 1_000_000) * 1_000_000;
  })();

  function xPos(i: number): number {
    if (quarters.length <= 1) return padLeft + plotW / 2;
    return padLeft + (i / (quarters.length - 1)) * plotW;
  }
  function yPos(arr: number): number {
    return padTop + plotH - (arr / gridMax) * plotH;
  }

  // Y gridlines (5 ticks)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => ({ v: gridMax * t, y: yPos(gridMax * t) }));

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>CW Revenue by Origination Channel</div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
            FY2025 – present · responds to segment toggle{hasFilters ? " and dimension filters" : ""}; period selector ignored. Latest quarter dashed = in flight.
          </div>
        </div>
        <div style={{ fontSize: 10, color: "var(--muted)" }}>
          Scope: {segmentScope}
        </div>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 14, marginBottom: 10, flexWrap: "wrap" }}>
        {series.map((s) => (
          <div key={s.parentKey} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}>
            <span style={{ display: "inline-block", width: 18, height: 3, background: s.color, borderRadius: 1 }} />
            <span style={{ fontWeight: 600 }}>{s.label}</span>
          </div>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid meet" style={{ width: "100%", height: "auto" }}>
        {/* Y gridlines + labels */}
        {yTicks.map((t) => (
          <g key={t.v}>
            <line x1={padLeft} x2={W - padRight} y1={t.y} y2={t.y} stroke="var(--border)" strokeDasharray="2 3" />
            <text x={padLeft - 8} y={t.y + 4} fontSize="10" fill="var(--muted)" textAnchor="end">
              {fmtK(t.v)}
            </text>
          </g>
        ))}

        {/* X axis labels */}
        {quarters.map((q, i) => (
          <text key={q} x={xPos(i)} y={H - padBottom + 18} fontSize="10" fill="var(--muted)" textAnchor="middle">
            {q.replace("-", " ")}
          </text>
        ))}

        {/* Series lines */}
        {series.map((s) => {
          // Build solid path (all complete quarters) and dashed path (last segment if partial)
          const pts = s.points.map((p, i) => ({ x: xPos(i), y: yPos(p.arr), partial: p.partial, raw: p }));
          const solidSegs: string[] = [];
          const dashSegs: string[] = [];
          for (let i = 0; i < pts.length - 1; i += 1) {
            const a = pts[i];
            const b = pts[i + 1];
            const seg = `M${a.x},${a.y} L${b.x},${b.y}`;
            if (b.partial) dashSegs.push(seg);
            else solidSegs.push(seg);
          }
          return (
            <g key={s.parentKey}>
              {solidSegs.map((d, i) => (
                <path key={`sol-${i}`} d={d} stroke={s.color} strokeWidth="2" fill="none" strokeLinecap="round" />
              ))}
              {dashSegs.map((d, i) => (
                <path key={`dash-${i}`} d={d} stroke={s.color} strokeWidth="2" fill="none" strokeLinecap="round" strokeDasharray="5 4" />
              ))}
              {pts.map((p, i) => (
                <circle key={`c-${i}`} cx={p.x} cy={p.y} r={p.partial ? 3 : 4} fill={p.partial ? "var(--bg)" : s.color} stroke={s.color} strokeWidth={p.partial ? 2 : 0}>
                  <title>{`${s.label} · ${p.raw.quarter.replace("-", " ")}${p.partial ? " (partial)" : ""}: ${fmtK(p.raw.arr)} · ${p.raw.count} CW`}</title>
                </circle>
              ))}
            </g>
          );
        })}
      </svg>

      {/* Per-channel quarterly table below chart for exact numbers */}
      <div style={{ marginTop: 14, overflow: "auto" }}>
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Channel</th>
              {quarters.map((q) => {
                const isPartial = series[0]?.points.find((p) => p.quarter === q)?.partial;
                return (
                  <th key={q} style={{ fontSize: 10 }}>
                    {q.replace("-", " ")}{isPartial ? "*" : ""}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {series.map((s) => (
              <tr key={s.parentKey}>
                <td style={{ textAlign: "left", fontWeight: 600, color: s.color }}>{s.label}</td>
                {s.points.map((p) => (
                  <td key={p.quarter} style={{ fontSize: 11, color: p.arr > 0 ? "var(--text)" : "var(--muted)" }}>
                    {p.arr > 0 ? fmtK(p.arr) : "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 6, fontStyle: "italic" }}>
          * Latest quarter is in flight; values will continue to grow as deals close.
        </div>
      </div>
    </div>
  );
}

// ── MM/ENT mix bar ──
function SegmentMixBar({ mmArr, entArr }: { mmArr: number; entArr: number }) {
  const total = mmArr + entArr;
  if (total <= 0) return <span style={{ color: "var(--muted)", fontSize: 10 }}>—</span>;
  const mmPct = (mmArr / total) * 100;
  const entPct = (entArr / total) * 100;
  const tooltip = `MM: ${fmtK(mmArr)} (${mmPct.toFixed(0)}%) · ENT: ${fmtK(entArr)} (${entPct.toFixed(0)}%)`;
  return (
    <div title={tooltip} style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}>
      <div style={{ display: "flex", width: 70, height: 8, borderRadius: 2, overflow: "hidden", background: "var(--border)" }}>
        {mmArr > 0 && <div style={{ width: `${mmPct}%`, background: "var(--blue)" }} />}
        {entArr > 0 && <div style={{ width: `${entPct}%`, background: "var(--teal)" }} />}
      </div>
      <span style={{ fontSize: 9, color: "var(--muted)", minWidth: 28, textAlign: "left" }}>
        {mmPct.toFixed(0)}%
      </span>
    </div>
  );
}

// ── Channel Breakdown (nested: parent group → source → set type) ──
function ChannelBreakdownSection({ rows }: { rows: ChannelBreakdownNode[] }) {
  // Default-expand all parent rows so Battery sees the full picture immediately
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(rows.map((r) => r.key)));

  const toggle = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderRow = (node: ChannelBreakdownNode) => {
    const indent = node.level * 18;
    const hasChildren = !!node.children && node.children.length > 0;
    const isExpanded = expanded.has(node.key);
    const isParent = node.level === 0;
    const fontWeight = node.level === 0 ? 700 : node.level === 1 ? 500 : 400;
    const labelColor = node.level === 2 ? "var(--muted)" : "var(--text)";

    return (
      <tr
        key={node.key}
        style={{
          background: isParent ? "var(--bg)" : "transparent",
          borderTop: isParent ? "1px solid var(--border)" : "none",
        }}
      >
        <td style={{ textAlign: "left", paddingLeft: indent + 8 }}>
          {hasChildren ? (
            <button
              onClick={() => toggle(node.key)}
              aria-label={isExpanded ? "Collapse" : "Expand"}
              style={{
                background: "none",
                border: "none",
                color: "var(--muted)",
                cursor: "pointer",
                marginRight: 6,
                padding: 0,
                fontSize: 10,
                width: 12,
                display: "inline-block",
              }}
            >
              {isExpanded ? "▾" : "▸"}
            </button>
          ) : (
            <span style={{ display: "inline-block", width: 18 }} />
          )}
          <span style={{ fontWeight, color: labelColor, fontSize: node.level === 0 ? 12 : 11 }}>
            {node.label}
          </span>
        </td>
        <td>{node.count}</td>
        <td style={{ fontWeight: node.level === 0 ? 700 : 600 }}>{fmtK(node.arr)}</td>
        <td>{node.pctOfTotal.toFixed(1)}%</td>
        <td style={{ color: "var(--muted)" }}>{fmtK(node.pipelineGenerated)}</td>
        <td style={{ color: winRateColor(node.winRateClosed), fontWeight: 600 }}>
          {fmtWinRate(node.winRateClosed)}
        </td>
        <td style={{ color: winRateColor(node.winRateCohort), fontWeight: 600 }}>
          {fmtWinRate(node.winRateCohort)}
        </td>
        <td><SegmentMixBar mmArr={node.mmArr} entArr={node.entArr} /></td>
      </tr>
    );
  };

  const flatRows: ChannelBreakdownNode[] = [];
  for (const parent of rows) {
    flatRows.push(parent);
    if (expanded.has(parent.key) && parent.children) {
      for (const source of parent.children) {
        flatRows.push(source);
        if (expanded.has(source.key) && source.children) {
          for (const setType of source.children) flatRows.push(setType);
        }
      }
    }
  }

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Wins by Origination Channel</div>
        <div style={{ fontSize: 10, color: "var(--muted)" }}>
          Outbound · Field Marketing · Perf Marketing · expand to see Sources & Set Types
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Channel</th>
            <th>CW Count</th>
            <th>Recurring ARR</th>
            <th>% of Total</th>
            <th>Pipeline Generated</th>
            <th title="Wins ÷ (Wins + Losses) on opps closed in period">Win Rate (Closed)</th>
            <th title="Wins ÷ Total Cohort on opps created in period (denominator includes open)">CCWR</th>
            <th title="MM (blue) vs ENT (teal) split of Recurring ARR. Hover for $ + %.">Segment Mix</th>
          </tr>
        </thead>
        <tbody>{flatRows.map(renderRow)}</tbody>
      </table>
    </div>
  );
}

