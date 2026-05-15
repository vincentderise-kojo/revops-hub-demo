"use client";

import { useState, useMemo } from "react";
import { BacktestRow, Opportunity } from "@/lib/types";
import { fmtK } from "@/lib/format";
import {
  SCENARIOS_CONFIG,
  OPEN_STAGES,
  WEEKS_PER_MONTH,
  getQuotaForMonth,
} from "@/lib/config";

// Rehydrate serialized Opportunity dates
function rehydrateOpps(opps: Opportunity[]): Opportunity[] {
  return opps.map((o) => ({
    ...o,
    discoveryDate: new Date(o.discoveryDate),
    closeDate: o.closeDate ? new Date(o.closeDate) : null,
    lastActivityDate: o.lastActivityDate ? new Date(o.lastActivityDate) : null,
    accountLastActivityDate: o.accountLastActivityDate ? new Date(o.accountLastActivityDate) : null,
  }));
}

// Client-side backtest recomputation (mirrors server logic)
function computeBacktestClient(
  opps: Opportunity[],
  staleThresholdDays: number,
  segmentFilter: "All" | "MidMarket" | "Enterprise"
): BacktestRow[] {
  const filtered =
    segmentFilter === "All"
      ? opps
      : opps.filter((o) => o.segment === (segmentFilter === "MidMarket" ? "MM" : "ENT"));

  const openStages = OPEN_STAGES as readonly string[];
  const now = new Date();
  const rows: BacktestRow[] = [];
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  for (let y = 2025; y <= now.getFullYear(); y++) {
    const mStart = y === 2025 ? 0 : 0;
    const mEnd = y === now.getFullYear() ? now.getMonth() : 11;
    for (let m = mStart; m <= mEnd; m++) {
      const ms = new Date(y, m, 1);
      const me = new Date(y, m + 1, 0, 23, 59, 59, 999);
      const mk = `${y}-${String(m + 1).padStart(2, "0")}`;

      const openAtStart = filtered.filter((o) => {
        if (o.discoveryDate >= ms) return false;
        if (openStages.includes(o.stage)) return true;
        if (o.closeDate && o.closeDate >= ms) return true;
        return false;
      });

      const openPipeline = openAtStart.reduce((s, o) => s + o.amount, 0);
      // Backtest: use Discovery Date age for historical accuracy
      const freshAtStart = openAtStart.filter((o) => {
        return Math.floor((ms.getTime() - o.discoveryDate.getTime()) / 86_400_000) <= staleThresholdDays;
      });
      const freshPipeline = freshAtStart.reduce((s, o) => s + o.amount, 0);

      const cw = filtered.filter((o) => {
        if (o.stage !== "Closed Won" || !o.closeDate) return false;
        return o.closeDate >= ms && o.closeDate <= me;
      });
      const closedWon = cw.reduce((s, o) => s + o.amount, 0);
      const quota = getQuotaForMonth(mk, segmentFilter);

      const mmOpen = openAtStart.filter((o) => o.segment === "MM");
      const entOpen = openAtStart.filter((o) => o.segment === "ENT");

      rows.push({
        monthLabel: `${names[m]}-${String(y).slice(2)}`,
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
        mmFreshPipeline: freshAtStart.filter((o) => o.segment === "MM").reduce((s, o) => s + o.amount, 0),
        entFreshPipeline: freshAtStart.filter((o) => o.segment === "ENT").reduce((s, o) => s + o.amount, 0),
        mmClosedWon: cw.filter((o) => o.segment === "MM").reduce((s, o) => s + o.amount, 0),
        entClosedWon: cw.filter((o) => o.segment === "ENT").reduce((s, o) => s + o.amount, 0),
      });
    }
  }
  return rows;
}

interface ScenariosData {
  latestDiscoveryDate: string;
  renderedAt: string;
  backtest: BacktestRow[];
  allOpps: Opportunity[];
}

export default function ScenariosDashboard({ data }: { data: ScenariosData }) {
  const [staleThreshold, setStaleThreshold] = useState(SCENARIOS_CONFIG.defaultStaleThresholdDays);
  const [coverageTarget, setCoverageTarget] = useState(SCENARIOS_CONFIG.defaultCoverageTarget);
  const [winRate, setWinRate] = useState(Math.round(SCENARIOS_CONFIG.defaultWinRate * 100));
  const [segment, setSegment] = useState<"All" | "MidMarket" | "Enterprise">("All");

  const allOpps = useMemo(() => rehydrateOpps(data.allOpps), [data.allOpps]);

  const backtest = useMemo(
    () => computeBacktestClient(allOpps, staleThreshold, segment),
    [allOpps, staleThreshold, segment]
  );

  const latestDisco = new Date(data.latestDiscoveryDate).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
  });
  const refreshedAt = data.renderedAt
    ? new Date(data.renderedAt).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
      }) + " ET"
    : null;

  // Current month scenario summary
  const now = new Date();
  const currentMk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const currentQuota = getQuotaForMonth(currentMk, segment);
  const impliedMultiple = winRate > 0 ? 1 / (winRate / 100) : 0;
  const monthlyCreationNeeded = currentQuota * coverageTarget;
  const weeklyCreationNeeded = monthlyCreationNeeded / WEEKS_PER_MONTH;

  // Current fresh pipeline
  const openStages = OPEN_STAGES as readonly string[];
  const segFiltered = segment === "All" ? allOpps : allOpps.filter((o) => o.segment === (segment === "MidMarket" ? "MM" : "ENT"));
  const currentOpen = segFiltered.filter((o) => openStages.includes(o.stage));
  const currentFresh = currentOpen.filter((o) => {
    if (!o.lastActivityDate) return false;
    return Math.floor((now.getTime() - o.lastActivityDate.getTime()) / 86_400_000) <= staleThreshold;
  });
  const currentFreshPipeline = currentFresh.reduce((s, o) => s + o.amount, 0);
  const freshCoverageRatio = currentQuota > 0 ? currentFreshPipeline / currentQuota : 0;
  const coverageStatus = freshCoverageRatio >= coverageTarget ? "green" : freshCoverageRatio >= 3 ? "yellow" : "red";

  // Insight text
  const rowsAbove = backtest.filter((r) => r.impliedMultipleFresh !== null && r.impliedMultipleFresh >= coverageTarget && r.closedWon > 0);
  const rowsBelow = backtest.filter((r) => r.impliedMultipleFresh !== null && r.impliedMultipleFresh < coverageTarget && r.closedWon > 0);
  const avgAttAbove = rowsAbove.length > 0 ? rowsAbove.reduce((s, r) => s + r.attainment, 0) / rowsAbove.length : 0;
  const avgAttBelow = rowsBelow.length > 0 ? rowsBelow.reduce((s, r) => s + r.attainment, 0) / rowsBelow.length : 0;

  const statusColors: Record<string, string> = { green: "var(--green)", yellow: "var(--yellow)", red: "var(--red)" };

  return (
    <>
      {/* KOJO HEADER */}
      <div className="kojo-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/hub" style={{ fontSize: 15, fontWeight: 800, color: "#FFE500", letterSpacing: 1.5, textDecoration: "none" }}>KOJO</a>
          <span style={{ width: 1, height: 16, background: "#555", display: "inline-block" }} />
          <a href="/hub" style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", textDecoration: "none" }}>RevOps Hub</a>
        </div>
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
          <span>Latest disco: {latestDisco}</span>
          {refreshedAt && <span>Refreshed: {refreshedAt}</span>}
        </span>
      </div>

      {/* APP HEADER */}
      <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: 4, background: "var(--kojo-yellow)", boxShadow: "0 0 8px #FFE50088" }} />
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5 }}>Pipeline Scenarios</span>
          <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 4 }}>Backtest &amp; What-If Modeling</span>
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 1060, margin: "0 auto" }}>

        {/* ── SECTION 2: Interactive Controls ── */}
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Scenario Controls</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 140px", gap: 16 }}>
            <SliderControl
              label="Stale Threshold"
              value={staleThreshold}
              min={30} max={180} step={5}
              format={(v) => `${v} days`}
              subtext={`Opps with no activity in ${staleThreshold}+ days excluded`}
              onChange={setStaleThreshold}
            />
            <SliderControl
              label="Coverage Target"
              value={coverageTarget}
              min={2} max={8} step={0.1}
              format={(v) => `${v.toFixed(1)}×`}
              subtext={`Need ${fmtK(weeklyCreationNeeded)}/wk at this multiple`}
              onChange={setCoverageTarget}
            />
            <SliderControl
              label="Win Rate"
              value={winRate}
              min={5} max={35} step={1}
              format={(v) => `${v}%`}
              subtext={`Implies ${impliedMultiple.toFixed(1)}× coverage multiple`}
              onChange={setWinRate}
            />
            <div>
              <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Segment</div>
              <select
                value={segment}
                onChange={(e) => setSegment(e.target.value as "All" | "MidMarket" | "Enterprise")}
                style={{
                  width: "100%", padding: "8px 10px", borderRadius: 6,
                  border: "1px solid var(--border)", background: "var(--bg)",
                  color: "var(--text)", fontSize: 12, fontFamily: "inherit",
                }}
              >
                <option value="All">All</option>
                <option value="MidMarket">MidMarket</option>
                <option value="Enterprise">Enterprise</option>
              </select>
            </div>
          </div>
        </div>

        {/* ── Summary Cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
          <SummaryCard label="Current Fresh Pipeline" value={fmtK(currentFreshPipeline)} color="var(--green)" />
          <SummaryCard label="Fresh Coverage Ratio" value={`${freshCoverageRatio.toFixed(1)}×`} color={statusColors[coverageStatus]} />
          <SummaryCard
            label="Status"
            value={freshCoverageRatio >= coverageTarget ? "On Track" : freshCoverageRatio >= 3 ? "Monitor" : "Below Target"}
            color={statusColors[coverageStatus]}
          />
          <SummaryCard label="Weekly Creation Needed" value={`${fmtK(weeklyCreationNeeded)}/wk`} color="var(--teal)" />
        </div>

        {/* ── Insight Text ── */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 12, lineHeight: 1.7 }}>
            At a <strong style={{ color: "var(--teal)" }}>{staleThreshold}-day</strong> stale threshold and{" "}
            <strong style={{ color: "var(--teal)" }}>{winRate}%</strong> win rate, the implied coverage multiple is{" "}
            <strong style={{ color: "var(--teal)" }}>{impliedMultiple.toFixed(1)}×</strong>.
            {rowsAbove.length > 0 && rowsBelow.length > 0 && (
              <> Based on historical data, months where fresh coverage exceeded {coverageTarget.toFixed(1)}× achieved{" "}
              <strong style={{ color: "var(--green)" }}>{Math.round(avgAttAbove)}%</strong> average attainment
              vs <strong style={{ color: "var(--red)" }}>{Math.round(avgAttBelow)}%</strong> when below
              ({rowsAbove.length} months above, {rowsBelow.length} below).</>
            )}
          </div>
        </div>

        {/* ── Chart: Visual Backtest ── */}
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Coverage Multiple vs. Attainment</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 14 }}>
            When fresh coverage (green) was above the target line, did attainment follow?
          </div>
          <BacktestChart rows={backtest} targetMultiple={coverageTarget} />
        </div>

        {/* ── SECTION 1: Historical Backtest Table ── */}
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Historical Backtest</div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 14 }}>
            Monthly open pipeline, fresh pipeline (Discovery Date age ≤{staleThreshold}d), closed won, and implied coverage multiples.
            {segment !== "All" && <strong style={{ color: "var(--teal)" }}> Filtered to {segment}.</strong>}
          </div>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Month</th>
                  <th>Open Pipeline</th>
                  <th>Fresh Pipeline</th>
                  <th>Closed Won</th>
                  <th>Multiple (All)</th>
                  <th>Multiple (Fresh)</th>
                  <th>Quota</th>
                  <th>Attainment</th>
                </tr>
              </thead>
              <tbody>
                {backtest.map((r) => {
                  const attColor = r.attainment >= 100 ? "var(--green)" : r.attainment >= 60 ? "var(--yellow)" : "var(--red)";
                  const freshMultColor = r.impliedMultipleFresh !== null
                    ? r.impliedMultipleFresh >= coverageTarget ? "var(--green)" : r.impliedMultipleFresh >= 3 ? "var(--yellow)" : "var(--red)"
                    : "var(--muted)";
                  return (
                    <tr key={r.monthLabel}>
                      <td style={{ textAlign: "left", fontWeight: 500 }}>{r.monthLabel}</td>
                      <td>{fmtK(r.openPipeline)}</td>
                      <td style={{ color: "var(--green)" }}>{fmtK(r.freshPipeline)}</td>
                      <td style={{ fontWeight: 600 }}>{fmtK(r.closedWon)}</td>
                      <td className="muted">{r.impliedMultipleAll !== null ? `${r.impliedMultipleAll.toFixed(1)}×` : "—"}</td>
                      <td style={{ fontWeight: 600, color: freshMultColor }}>{r.impliedMultipleFresh !== null ? `${r.impliedMultipleFresh.toFixed(1)}×` : "—"}</td>
                      <td className="muted">{fmtK(r.quota)}</td>
                      <td style={{ fontWeight: 600, color: attColor }}>{Math.round(r.attainment)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: 9, color: "#556", marginTop: 10, fontStyle: "italic" }}>
            Historical staleness uses Discovery Date age (time-accurate). Current scenario uses Last Activity date.
          </div>
        </div>
      </div>
    </>
  );
}

// ── Slider Control ──
function SliderControl({
  label, value, min, max, step, format, subtext, onChange,
}: {
  label: string; value: number; min: number; max: number; step: number;
  format: (v: number) => string; subtext: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--teal)", marginBottom: 6 }}>{format(value)}</div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        style={{ width: "100%", accentColor: "#4ecdc4" }}
      />
      <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 4 }}>{subtext}</div>
    </div>
  );
}

// ── Summary Card ──
function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: 14, borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

// ── Backtest Chart (pure CSS — no recharts dependency) ──
function BacktestChart({ rows, targetMultiple }: { rows: BacktestRow[]; targetMultiple: number }) {
  const maxMult = Math.max(
    ...rows.map((r) => r.impliedMultipleAll ?? 0),
    ...rows.map((r) => r.impliedMultipleFresh ?? 0),
    targetMultiple + 1
  );
  const maxAtt = Math.max(...rows.map((r) => r.attainment), 100);
  const chartHeight = 180;

  return (
    <div style={{ position: "relative", height: chartHeight + 40, overflow: "hidden" }}>
      {/* Target line */}
      <div style={{
        position: "absolute",
        left: 0, right: 0,
        top: chartHeight - (targetMultiple / maxMult) * chartHeight,
        height: 1,
        borderTop: "2px dashed var(--red)",
        zIndex: 2,
      }}>
        <span style={{ position: "absolute", right: 0, top: -14, fontSize: 9, color: "var(--red)" }}>{targetMultiple.toFixed(1)}× target</span>
      </div>

      {/* Bars + dots */}
      <div style={{ display: "flex", alignItems: "flex-end", height: chartHeight, gap: 2, paddingBottom: 1 }}>
        {rows.map((r, i) => {
          const allH = r.impliedMultipleAll !== null ? (r.impliedMultipleAll / maxMult) * chartHeight : 0;
          const freshH = r.impliedMultipleFresh !== null ? (r.impliedMultipleFresh / maxMult) * chartHeight : 0;
          const attH = (r.attainment / maxAtt) * chartHeight * 0.6;
          return (
            <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", position: "relative", height: chartHeight }}>
              {/* All pipeline bar (faded) */}
              <div style={{ position: "absolute", bottom: 0, width: "60%", height: allH, background: "#3b82f633", borderRadius: "2px 2px 0 0" }} />
              {/* Fresh pipeline bar */}
              <div style={{ position: "absolute", bottom: 0, width: "60%", height: freshH, background: "#22c55e88", borderRadius: "2px 2px 0 0" }} />
              {/* Attainment dot */}
              <div style={{
                position: "absolute",
                bottom: attH - 3,
                width: 6, height: 6, borderRadius: 3,
                background: r.attainment >= 100 ? "var(--green)" : r.attainment >= 60 ? "var(--yellow)" : "var(--red)",
                zIndex: 3,
              }} />
            </div>
          );
        })}
      </div>

      {/* X axis labels */}
      <div style={{ display: "flex", gap: 2, marginTop: 4 }}>
        {rows.map((r, i) => (
          <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 8, color: "var(--muted)" }}>
            {i % 2 === 0 ? r.monthLabel : ""}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 16, fontSize: 9, marginTop: 6, color: "var(--muted)" }}>
        <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#3b82f633", borderRadius: 2, marginRight: 4 }} />All pipeline</span>
        <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#22c55e88", borderRadius: 2, marginRight: 4 }} />Fresh pipeline</span>
        <span><span style={{ display: "inline-block", width: 6, height: 6, background: "var(--yellow)", borderRadius: 3, marginRight: 4 }} />Attainment</span>
        <span><span style={{ display: "inline-block", width: 12, height: 0, borderTop: "2px dashed var(--red)", marginRight: 4, verticalAlign: "middle" }} />Target</span>
      </div>
    </div>
  );
}
