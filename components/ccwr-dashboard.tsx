"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import {
  CcwrPageData,
  CcwrOpp,
  CcwrCohort,
  CcwrBreakdownRow,
  CcwrDataIssue,
  SalesCycleTrendPoint,
} from "@/lib/types-ccwr";
import {
  buildCohorts,
  flagMaturing,
  computeTrailingAverages,
  computeRawTrailingAverages,
  computeCcwrBreakdown,
  computeSalesCycle,
  computeSalesCycleTrend,
} from "@/lib/process-ccwr";
import { fmtK } from "@/lib/format";
import CcwrMethodology from "./ccwr-methodology";

// ── Format helpers ──

function fmtCcwr(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function ccwrColor(v: number, target: number): string {
  return v >= target ? "var(--green)" : "var(--red)";
}

function fmtVal(count: number, dollar: number, mode: "count" | "dollar"): string {
  return mode === "count" ? count.toLocaleString() : fmtK(dollar);
}

// ── Types ──

type Tab = "dashboard" | "methodology" | "data-cleansing";
type Mode = "count" | "dollar";

interface CcwrDashboardProps {
  data: CcwrPageData;
}

// ── MultiSelect Component ──

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
  const ref = useRef<HTMLDivElement>(null);

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

  return (
    <div style={{ position: "relative" }} ref={ref}>
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
          <span
            style={{
              background: "var(--card)",
              color: "var(--green)",
              borderRadius: 8,
              padding: "0 5px",
              fontSize: 9,
              fontWeight: 700,
            }}
          >
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
              onClick={() => {
                onChange([]);
                setOpen(false);
              }}
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

// ── HeroStat Component ──

function HeroStat({
  label,
  value,
  color,
  subtitle,
}: {
  label: string;
  value: string;
  color: string;
  subtitle?: string;
}) {
  return (
    <div className="card" style={{ textAlign: "center", padding: "14px 10px", flex: 1 }}>
      <div
        style={{
          fontSize: 10,
          color: "var(--muted)",
          marginBottom: 4,
          textTransform: "uppercase",
          letterSpacing: 0.5,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color }}>{value}</div>
      {subtitle && (
        <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 4 }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

// ── CcwrChart Component (pure SVG) ──

function CcwrChart({
  cohorts,
  mode,
  target,
}: {
  cohorts: CcwrCohort[];
  mode: Mode;
  target: number;
}) {
  if (cohorts.length === 0) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
        No cohort data to chart
      </div>
    );
  }

  const dotSpacing = 50;
  const paddingLeft = 40;
  const paddingRight = 40;
  const paddingTop = 20;
  const paddingBottom = 40;
  const chartHeight = 200;
  const svgWidth = paddingLeft + cohorts.length * dotSpacing + paddingRight;
  const svgHeight = chartHeight + paddingTop + paddingBottom;
  const barWidth = 28;

  // Left Y axis: CCWR % (0% to max)
  const ccwrValues = cohorts.map((c) => (mode === "count" ? c.ccwrCount : c.ccwrDollar));
  const maxCcwr = Math.max(0.5, ...ccwrValues.map((v) => v + 0.05));

  // Right Y axis: Pipeline created (Amount or count)
  const barValues = cohorts.map((c) => (mode === "count" ? c.totalCount : c.totalAmount));
  const maxBar = Math.max(1, ...barValues);

  const yScaleCcwr = (v: number) => paddingTop + chartHeight - (v / maxCcwr) * chartHeight;
  const yScaleBar = (v: number) => paddingTop + chartHeight - (v / maxBar) * chartHeight;
  const xScale = (i: number) => paddingLeft + i * dotSpacing + dotSpacing / 2;

  // Build line path for mature cohorts only
  const maturePoints = cohorts
    .map((c, i) => ({ x: xScale(i), y: yScaleCcwr(ccwrValues[i]), maturing: c.isMaturing }))
    .filter((p) => !p.maturing);

  const linePath =
    maturePoints.length > 1
      ? maturePoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ")
      : "";

  // Left Y-axis grid lines
  const gridSteps = [0, 0.1, 0.2, 0.3, 0.4, 0.5].filter((v) => v <= maxCcwr);

  // Target line Y
  const targetY = yScaleCcwr(target);

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>CCWR Over Time</div>
        <div style={{ display: "flex", gap: 16, fontSize: 10, color: "var(--muted)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 10, height: 8, borderRadius: 2, background: "var(--blue)", display: "inline-block", opacity: 0.25 }} />
            Created
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--teal)", display: "inline-block" }} />
            CCWR (mature)
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--yellow)", display: "inline-block" }} />
            CCWR (maturing)
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 20, height: 0, borderTop: "2px dashed var(--red)", display: "inline-block" }} />
            Target ({(target * 100).toFixed(0)}%)
          </span>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ display: "block" }}
        >
          {/* Left Y-axis grid lines (CCWR %) */}
          {gridSteps.map((v) => (
            <g key={v}>
              <line
                x1={paddingLeft}
                y1={yScaleCcwr(v)}
                x2={svgWidth - paddingRight}
                y2={yScaleCcwr(v)}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text
                x={paddingLeft - 6}
                y={yScaleCcwr(v) + 3}
                fill="var(--muted)"
                fontSize={9}
                textAnchor="end"
              >
                {(v * 100).toFixed(0)}%
              </text>
            </g>
          ))}

          {/* Right Y-axis labels (pipeline created) */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
            const val = pct * maxBar;
            const y = yScaleBar(val);
            return (
              <text
                key={`r-${pct}`}
                x={svgWidth - paddingRight + 6}
                y={y + 3}
                fill="var(--blue)"
                fontSize={9}
                textAnchor="start"
                opacity={0.5}
              >
                {mode === "count" ? Math.round(val).toLocaleString() : fmtK(val)}
              </text>
            );
          })}

          {/* Pipeline created bars (behind everything) */}
          {cohorts.map((c, i) => {
            const cx = xScale(i);
            const barH = (barValues[i] / maxBar) * chartHeight;
            const barY = paddingTop + chartHeight - barH;
            return (
              <rect
                key={`bar-${c.monthKey}`}
                x={cx - barWidth / 2}
                y={barY}
                width={barWidth}
                height={barH}
                fill="var(--blue)"
                opacity={0.15}
                rx={2}
              />
            );
          })}

          {/* Target dashed line */}
          <line
            x1={paddingLeft}
            y1={targetY}
            x2={svgWidth - paddingRight}
            y2={targetY}
            stroke="var(--red)"
            strokeWidth={1.5}
            strokeDasharray="6 4"
          />

          {/* Connecting line (mature only) */}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke="var(--teal)"
              strokeWidth={2}
              strokeLinejoin="round"
            />
          )}

          {/* Data dots */}
          {cohorts.map((c, i) => {
            const cx = xScale(i);
            const cy = yScaleCcwr(ccwrValues[i]);
            const dotColor = c.isMaturing ? "var(--yellow)" : "var(--teal)";

            return (
              <g key={c.monthKey}>
                <circle cx={cx} cy={cy} r={4} fill={dotColor} />
                <text
                  x={cx}
                  y={cy - 10}
                  fill={dotColor}
                  fontSize={8}
                  textAnchor="middle"
                  fontWeight={600}
                >
                  {fmtCcwr(ccwrValues[i])}
                </text>
                <text
                  x={cx}
                  y={svgHeight - paddingBottom + 16}
                  fill="var(--muted)"
                  fontSize={9}
                  textAnchor="middle"
                >
                  {c.monthLabel}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ── SalesCycleChart Component (pure SVG) ──

function SalesCycleChart({ points }: { points: SalesCycleTrendPoint[] }) {
  if (points.length === 0) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
        No sales cycle data to chart
      </div>
    );
  }

  const dotSpacing = 50;
  const paddingLeft = 40;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 40;
  const chartHeight = 200;
  const svgWidth = paddingLeft + points.length * dotSpacing + paddingRight;
  const svgHeight = chartHeight + paddingTop + paddingBottom;

  const allDays = points.flatMap((p) => [p.mmDays, p.entDays]).filter((d) => d > 0);
  const maxDays = Math.max(120, ...allDays.map((d) => d + 10));

  const yScale = (v: number) => paddingTop + chartHeight - (v / maxDays) * chartHeight;
  const xScale = (i: number) => paddingLeft + i * dotSpacing + dotSpacing / 2;

  // Build line paths
  const mmPoints = points.map((p, i) => ({ x: xScale(i), y: yScale(p.mmDays), days: p.mmDays }));
  const entPoints = points.map((p, i) => ({ x: xScale(i), y: yScale(p.entDays), days: p.entDays }));

  const buildPath = (pts: { x: number; y: number; days: number }[]) =>
    pts.filter((p) => p.days > 0).map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

  const mmPath = buildPath(mmPoints);
  const entPath = buildPath(entPoints);

  // Y-axis grid lines
  const gridStep = maxDays <= 200 ? 30 : 60;
  const gridSteps: number[] = [];
  for (let v = 0; v <= maxDays; v += gridStep) gridSteps.push(v);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Sales Cycle Over Time</div>
        <div style={{ display: "flex", gap: 16, fontSize: 10, color: "var(--muted)" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--blue)", display: "inline-block" }} />
            MM
          </span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--teal)", display: "inline-block" }} />
            ENT
          </span>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{ display: "block" }}
        >
          {/* Y-axis grid lines */}
          {gridSteps.map((v) => (
            <g key={v}>
              <line
                x1={paddingLeft}
                y1={yScale(v)}
                x2={svgWidth - paddingRight}
                y2={yScale(v)}
                stroke="var(--border)"
                strokeWidth={1}
              />
              <text
                x={paddingLeft - 6}
                y={yScale(v) + 3}
                fill="var(--muted)"
                fontSize={9}
                textAnchor="end"
              >
                {v}d
              </text>
            </g>
          ))}

          {/* MM line */}
          {mmPath && (
            <path d={mmPath} fill="none" stroke="var(--blue)" strokeWidth={2} strokeLinejoin="round" />
          )}

          {/* ENT line */}
          {entPath && (
            <path d={entPath} fill="none" stroke="var(--teal)" strokeWidth={2} strokeLinejoin="round" />
          )}

          {/* Data dots + labels */}
          {points.map((p, i) => {
            const cx = xScale(i);
            return (
              <g key={p.monthKey}>
                {p.mmDays > 0 && (
                  <>
                    <circle cx={cx} cy={yScale(p.mmDays)} r={3.5} fill="var(--blue)" />
                    <text x={cx} y={yScale(p.mmDays) - 8} fill="var(--blue)" fontSize={8} textAnchor="middle" fontWeight={600}>
                      {p.mmDays}d
                    </text>
                  </>
                )}
                {p.entDays > 0 && (
                  <>
                    <circle cx={cx} cy={yScale(p.entDays)} r={3.5} fill="var(--teal)" />
                    <text x={cx} y={yScale(p.entDays) - 8} fill="var(--teal)" fontSize={8} textAnchor="middle" fontWeight={600}>
                      {p.entDays}d
                    </text>
                  </>
                )}
                <text
                  x={cx}
                  y={svgHeight - paddingBottom + 16}
                  fill="var(--muted)"
                  fontSize={9}
                  textAnchor="middle"
                >
                  {p.monthLabel}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

// ── BreakdownTable Component ──

function BreakdownTable({
  title,
  rows,
  mode,
  target,
}: {
  title: string;
  rows: CcwrBreakdownRow[];
  mode: Mode;
  target: number;
}) {
  return (
    <div className="card">
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{title}</div>
      <table>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Name</th>
            <th>Created</th>
            <th>CW</th>
            <th>CCWR</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const ccwr = mode === "count" ? row.ccwrCount : row.ccwrDollar;
            return (
              <tr key={row.label}>
                <td style={{ fontWeight: 500, textAlign: "left" }}>{row.label}</td>
                <td>{fmtVal(row.totalCount, row.totalAmount, mode)}</td>
                <td>{fmtVal(row.cwCount, row.cwAmount, mode)}</td>
                <td style={{ fontWeight: 600, color: ccwrColor(ccwr, target) }}>
                  {fmtCcwr(ccwr)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Data Cleansing Component ──

function DataCleansing({ issues }: { issues: CcwrDataIssue[] }) {
  const issueTypes = [
    "Missing Discovery Date",
    "Missing Opportunity Source",
    "Missing Industry",
    "Missing Opp Set Type",
    "Missing or zero Amount",
  ];

  const grouped = issueTypes.map((type) => ({
    type,
    opps: issues.filter((i) => i.issue === type),
  })).filter((g) => g.opps.length > 0);

  if (grouped.length === 0) {
    return (
      <div className="card" style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
        No data quality issues found. All opportunities have the required fields populated.
      </div>
    );
  }

  return (
    <>
      <div className="callout callout-yellow" style={{ fontSize: 11, marginBottom: 16 }}>
        <strong style={{ color: "var(--yellow)" }}>{issues.length} opportunities</strong> are missing key fields
        and may be excluded from CCWR calculations or incorrectly categorized. Opps missing Discovery Date or Amount
        are excluded from all dashboard metrics.
      </div>

      {grouped.map((group) => (
        <div className="card" key={group.type}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{group.type}</div>
            <span style={{
              fontSize: 10, padding: "2px 8px", borderRadius: 8,
              background: "#ef444422", color: "var(--red)", fontWeight: 700,
            }}>
              {group.opps.length} {group.opps.length === 1 ? "opp" : "opps"}
            </span>
          </div>
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Opportunity</th>
                <th style={{ textAlign: "left" }}>Owner</th>
                <th style={{ textAlign: "left" }}>Stage</th>
              </tr>
            </thead>
            <tbody>
              {group.opps.map((opp, i) => (
                <tr key={`${opp.name}-${i}`}>
                  <td style={{ textAlign: "left", fontWeight: 500, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {opp.name}
                  </td>
                  <td style={{ textAlign: "left" }}>{opp.owner || "(blank)"}</td>
                  <td style={{ textAlign: "left" }}>{opp.stage || "(blank)"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

// ── Main Dashboard ──

export default function CcwrDashboard({ data }: CcwrDashboardProps) {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [mode, setMode] = useState<Mode>("count");
  const [chartTab, setChartTab] = useState<"ccwr" | "sales-cycle">("ccwr");
  const [selectedCohort, setSelectedCohort] = useState<string | null>(null);

  // ── Filter state ──
  const [selectedSetTypes, setSelectedSetTypes] = useState<string[]>([]);
  const [selectedSegments, setSelectedSegments] = useState<string[]>([]);
  const [selectedIndustries, setSelectedIndustries] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);
  const [selectedOwners, setSelectedOwners] = useState<string[]>([]);
  const [selectedSdrOwners, setSelectedSdrOwners] = useState<string[]>([]);

  // ── Extract filter options from all opps ──
  const filterOptions = useMemo(() => {
    const setTypes = [...new Set(data.allOpps.map((o) => o.oppSetType).filter(Boolean))].sort();
    const segments = [...new Set(data.allOpps.map((o) => o.segment).filter(Boolean))].sort();
    const industries = [...new Set(data.allOpps.map((o) => o.industry).filter(Boolean))].sort();
    const sources = [...new Set(data.allOpps.map((o) => o.opportunitySource).filter(Boolean))].sort();
    const owners = [...new Set(data.allOpps.map((o) => o.owner).filter(Boolean))].sort();
    const sdrOwners = [...new Set(data.allOpps.map((o) => o.sdrOwner).filter(Boolean))].sort();
    return { setTypes, segments, industries, sources, owners, sdrOwners };
  }, [data.allOpps]);

  // ── Apply all 6 filters (AND-combined) ──
  const filteredOpps = useMemo(() => {
    return data.allOpps.filter((o) => {
      if (selectedSetTypes.length > 0 && !selectedSetTypes.includes(o.oppSetType)) return false;
      if (selectedSegments.length > 0 && !selectedSegments.includes(o.segment)) return false;
      if (selectedIndustries.length > 0 && !selectedIndustries.includes(o.industry)) return false;
      if (selectedSources.length > 0 && !selectedSources.includes(o.opportunitySource)) return false;
      if (selectedOwners.length > 0 && !selectedOwners.includes(o.owner)) return false;
      if (selectedSdrOwners.length > 0 && !selectedSdrOwners.includes(o.sdrOwner)) return false;
      return true;
    });
  }, [data.allOpps, selectedSetTypes, selectedSegments, selectedIndustries, selectedSources, selectedOwners, selectedSdrOwners]);

  // ── Recompute derived data from filtered opps ──
  const salesCycle = useMemo(() => computeSalesCycle(filteredOpps), [filteredOpps]);

  const segmentFilter: "MM" | "ENT" | undefined = useMemo(() => {
    if (selectedSegments.length === 1) return selectedSegments[0] as "MM" | "ENT";
    return undefined;
  }, [selectedSegments]);

  const cohorts = useMemo(() => {
    const raw = buildCohorts(filteredOpps);
    return flagMaturing(raw, salesCycle, segmentFilter);
  }, [filteredOpps, salesCycle, segmentFilter]);

  const trailingAverages = useMemo(() => computeTrailingAverages(cohorts), [cohorts]);
  const rawTrailingAverages = useMemo(() => computeRawTrailingAverages(cohorts), [cohorts]);

  const breakdownBySetType = useMemo(
    () => computeCcwrBreakdown(filteredOpps, (o: CcwrOpp) => o.oppSetType),
    [filteredOpps]
  );
  const breakdownBySource = useMemo(
    () => computeCcwrBreakdown(filteredOpps, (o: CcwrOpp) => o.opportunitySource),
    [filteredOpps]
  );
  const breakdownBySegment = useMemo(
    () => computeCcwrBreakdown(filteredOpps, (o: CcwrOpp) => o.segment),
    [filteredOpps]
  );
  const breakdownByIndustry = useMemo(
    () => computeCcwrBreakdown(filteredOpps, (o: CcwrOpp) => o.industry),
    [filteredOpps]
  );

  const salesCycleTrend = useMemo(() => computeSalesCycleTrend(filteredOpps), [filteredOpps]);

  // ── Aggregate stats for hero cards ──
  const totalPipelineCreated = useMemo(
    () => ({ count: filteredOpps.length, dollar: filteredOpps.reduce((s, o) => s + o.amount, 0) }),
    [filteredOpps]
  );
  const totalCwArr = useMemo(
    () => ({
      count: filteredOpps.filter((o) => o.stage === "Closed Won").length,
      dollar: filteredOpps.filter((o) => o.stage === "Closed Won").reduce((s, o) => s + o.amount, 0),
    }),
    [filteredOpps]
  );

  const hasFilters =
    selectedSetTypes.length > 0 ||
    selectedSegments.length > 0 ||
    selectedIndustries.length > 0 ||
    selectedSources.length > 0 ||
    selectedOwners.length > 0 ||
    selectedSdrOwners.length > 0;

  const clearAllFilters = () => {
    setSelectedSetTypes([]);
    setSelectedSegments([]);
    setSelectedIndustries([]);
    setSelectedSources([]);
    setSelectedOwners([]);
    setSelectedSdrOwners([]);
  };

  return (
    <>
      {/* KOJO HEADER BAR */}
      <div className="kojo-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a
            href="/hub"
            style={{
              fontSize: 15,
              fontWeight: 800,
              color: "#FFE500",
              letterSpacing: 1.5,
              textDecoration: "none",
            }}
          >
            KOJO
          </a>
          <span
            style={{
              width: 1,
              height: 16,
              background: "#555",
              display: "inline-block",
            }}
          />
          <a
            href="/hub"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text)",
              textDecoration: "none",
            }}
          >
            RevOps Hub
          </a>
        </div>
        <span style={{ fontSize: 10, color: "#777", letterSpacing: 0.3 }}>
          {data.dataSourceLabel} · {data.allOpps.length} opps
        </span>
      </div>

      {/* APP HEADER + TABS */}
      <div
        style={{
          padding: "16px 20px 0",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                background: "var(--teal)",
                boxShadow: "0 0 8px #4ecdc488",
              }}
            />
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5 }}>
              Created Cohort Win Rate
            </span>
            <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 4 }}>
              CCWR
            </span>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <div
              className="badge"
              style={{
                background: ccwrColor(trailingAverages.t6m[mode === "count" ? "count" : "dollar"], data.ccwrTarget) === "var(--green)" ? "#22c55e22" : "#ef444422",
                color: ccwrColor(trailingAverages.t6m[mode === "count" ? "count" : "dollar"], data.ccwrTarget),
              }}
            >
              T6M: {fmtCcwr(trailingAverages.t6m[mode === "count" ? "count" : "dollar"])}
            </div>
          </div>
        </div>
        <div>
          <button
            className={`tab-btn ${tab === "dashboard" ? "active" : ""}`}
            onClick={() => setTab("dashboard")}
          >
            Dashboard
          </button>
          <button
            className={`tab-btn ${tab === "methodology" ? "active" : ""}`}
            onClick={() => setTab("methodology")}
          >
            Sources &amp; Methodology
          </button>
          <button
            className={`tab-btn ${tab === "data-cleansing" ? "active" : ""}`}
            onClick={() => setTab("data-cleansing")}
          >
            Data Cleansing
            {data.dataIssues.length > 0 && (
              <span style={{
                marginLeft: 6, fontSize: 9, padding: "1px 6px",
                borderRadius: 8, background: "#ef444422", color: "var(--red)", fontWeight: 700,
              }}>
                {data.dataIssues.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* CONTENT */}
      <div style={{ padding: 16, maxWidth: 960, margin: "0 auto" }}>
        {tab === "methodology" && (
          <CcwrMethodology salesCycle={salesCycle} ccwrTarget={data.ccwrTarget} />
        )}

        {tab === "data-cleansing" && (
          <DataCleansing issues={data.dataIssues} />
        )}

        {tab === "dashboard" && (
          <>
            {/* Mode toggle + Filter bar */}
            <div
              className="card"
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                alignItems: "center",
                padding: "10px 14px",
              }}
            >
              {/* Mode toggle */}
              <div
                style={{
                  display: "flex",
                  borderRadius: 6,
                  overflow: "hidden",
                  border: "1px solid var(--border)",
                  marginRight: 8,
                }}
              >
                <button
                  onClick={() => setMode("count")}
                  style={{
                    padding: "4px 12px",
                    fontSize: 10,
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    background: mode === "count" ? "var(--teal)" : "var(--bg)",
                    color: mode === "count" ? "var(--card)" : "var(--muted)",
                  }}
                >
                  By # of Opps
                </button>
                <button
                  onClick={() => setMode("dollar")}
                  style={{
                    padding: "4px 12px",
                    fontSize: 10,
                    fontWeight: 600,
                    border: "none",
                    cursor: "pointer",
                    background: mode === "dollar" ? "var(--teal)" : "var(--bg)",
                    color: mode === "dollar" ? "var(--card)" : "var(--muted)",
                  }}
                >
                  By $ Pipeline
                </button>
              </div>

              <div style={{ fontSize: 11, fontWeight: 600, color: "var(--muted)", marginRight: 4 }}>
                Filters
              </div>

              <MultiSelect label="Set Type" options={filterOptions.setTypes} selected={selectedSetTypes} onChange={setSelectedSetTypes} />
              <MultiSelect label="Segment" options={filterOptions.segments} selected={selectedSegments} onChange={setSelectedSegments} />
              <MultiSelect label="Industry" options={filterOptions.industries} selected={selectedIndustries} onChange={setSelectedIndustries} />
              <MultiSelect label="Source" options={filterOptions.sources} selected={selectedSources} onChange={setSelectedSources} />
              <MultiSelect label="Owner" options={filterOptions.owners} selected={selectedOwners} onChange={setSelectedOwners} />
              <MultiSelect label="SDR" options={filterOptions.sdrOwners} selected={selectedSdrOwners} onChange={setSelectedSdrOwners} />

              {hasFilters && (
                <button
                  onClick={clearAllFilters}
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

            {/* Hero stats: Pipeline Created → CW ARR → T3M → T6M → T12M */}
            <div style={{ display: "flex", gap: 10 }}>
              <HeroStat
                label="Pipeline Created"
                value={fmtVal(totalPipelineCreated.count, totalPipelineCreated.dollar, mode)}
                color="var(--text)"
                subtitle={mode === "count" ? "opps entered discovery" : "total Amount"}
              />
              <HeroStat
                label="Closed Won"
                value={fmtVal(totalCwArr.count, totalCwArr.dollar, mode)}
                color="var(--teal)"
                subtitle={mode === "count" ? "opps closed won" : "Amount (incl. non-recurring)"}
              />
              <HeroStat
                label="T3M CCWR"
                value={fmtCcwr(trailingAverages.t3m[mode === "count" ? "count" : "dollar"])}
                color={ccwrColor(trailingAverages.t3m[mode === "count" ? "count" : "dollar"], data.ccwrTarget)}
                subtitle={`Target: ${(data.ccwrTarget * 100).toFixed(0)}%`}
              />
              <HeroStat
                label="T6M CCWR"
                value={fmtCcwr(rawTrailingAverages.t6m[mode === "count" ? "count" : "dollar"])}
                color={ccwrColor(rawTrailingAverages.t6m[mode === "count" ? "count" : "dollar"], data.ccwrTarget)}
                subtitle={`Adjusted: ${fmtCcwr(trailingAverages.t6m[mode === "count" ? "count" : "dollar"])} · Target: ${(data.ccwrTarget * 100).toFixed(0)}%`}
              />
              <HeroStat
                label="T12M CCWR"
                value={fmtCcwr(trailingAverages.t12m[mode === "count" ? "count" : "dollar"])}
                color={ccwrColor(trailingAverages.t12m[mode === "count" ? "count" : "dollar"], data.ccwrTarget)}
                subtitle={`Target: ${(data.ccwrTarget * 100).toFixed(0)}%`}
              />
            </div>

            {/* Methodology callout */}
            <div
              className="callout callout-green"
              style={{ fontSize: 11, color: "var(--muted)" }}
            >
              <strong style={{ color: "var(--green)" }}>CCWR</strong> = Closed-Won ÷ Total Cohort
              (absolute rate, includes open opps).
              Target: {(data.ccwrTarget * 100).toFixed(0)}%.
              Avg sales cycle (T12M): MM {salesCycle.mmDays}d · ENT {salesCycle.entDays}d.
              {mode === "dollar" && (
                <span>
                  {" "}Dollar mode uses Amount for both numerator and denominator. Amount includes non-recurring revenue.
                </span>
              )}
            </div>

            {/* Sales Cycle hero stats */}
            <div style={{ display: "flex", gap: 10 }}>
              <HeroStat
                label="MM Sales Cycle"
                value={`${salesCycle.mmDays}d`}
                color="var(--blue)"
                subtitle="T12M average"
              />
              <HeroStat
                label="ENT Sales Cycle"
                value={`${salesCycle.entDays}d`}
                color="var(--teal)"
                subtitle="T12M average"
              />
            </div>

            {/* Chart section with toggle */}
            <div className="card" style={{ padding: 0 }}>
              <div style={{ display: "flex", gap: 0, borderBottom: "1px solid var(--border)" }}>
                <button
                  onClick={() => setChartTab("ccwr")}
                  style={{
                    padding: "8px 16px",
                    fontSize: 11,
                    fontWeight: 600,
                    border: "none",
                    borderBottom: chartTab === "ccwr" ? "2px solid var(--teal)" : "2px solid transparent",
                    cursor: "pointer",
                    background: "transparent",
                    color: chartTab === "ccwr" ? "var(--teal)" : "var(--muted)",
                  }}
                >
                  CCWR
                </button>
                <button
                  onClick={() => setChartTab("sales-cycle")}
                  style={{
                    padding: "8px 16px",
                    fontSize: 11,
                    fontWeight: 600,
                    border: "none",
                    borderBottom: chartTab === "sales-cycle" ? "2px solid var(--teal)" : "2px solid transparent",
                    cursor: "pointer",
                    background: "transparent",
                    color: chartTab === "sales-cycle" ? "var(--teal)" : "var(--muted)",
                  }}
                >
                  Sales Cycle
                </button>
              </div>
              <div style={{ padding: 16 }}>
                {chartTab === "ccwr" ? (
                  <CcwrChart cohorts={cohorts} mode={mode} target={data.ccwrTarget} />
                ) : (
                  <SalesCycleChart points={salesCycleTrend} />
                )}
              </div>
            </div>

            {/* Cohort table */}
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Cohort Detail</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {selectedCohort && (
                    <button
                      onClick={() => setSelectedCohort(null)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--red)",
                        fontSize: 10,
                        cursor: "pointer",
                      }}
                    >
                      Clear cohort filter
                    </button>
                  )}
                  <div style={{ fontSize: 10, color: "var(--muted)" }}>
                    {cohorts.length} cohorts · oldest first · click to filter deals
                  </div>
                </div>
              </div>
              <table>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left" }}>Cohort</th>
                    <th>Total</th>
                    <th>CW</th>
                    <th>CL</th>
                    <th>Open</th>
                    <th>CCWR</th>
                  </tr>
                </thead>
                <tbody>
                  {cohorts.map((c) => {
                    const ccwr = mode === "count" ? c.ccwrCount : c.ccwrDollar;
                    const isSelected = selectedCohort === c.monthKey;
                    return (
                      <tr
                        key={c.monthKey}
                        onClick={() => setSelectedCohort(isSelected ? null : c.monthKey)}
                        style={{
                          opacity: c.isMaturing ? 0.55 : 1,
                          cursor: "pointer",
                          background: isSelected ? "var(--blue)" + "11" : "transparent",
                        }}
                      >
                        <td style={{ textAlign: "left", fontWeight: 500 }}>
                          {c.monthLabel}
                          {c.isMaturing && (
                            <span
                              style={{
                                marginLeft: 8,
                                fontSize: 9,
                                padding: "1px 6px",
                                borderRadius: 8,
                                background: "#f59e0b22",
                                color: "var(--yellow)",
                                fontWeight: 600,
                              }}
                            >
                              Maturing
                            </span>
                          )}
                        </td>
                        <td>
                          {fmtVal(c.totalCount, c.totalAmount, mode)}
                        </td>
                        <td>
                          {fmtVal(c.cwCount, c.cwAmount, mode)}
                        </td>
                        <td>
                          {fmtVal(c.clCount, c.clAmount, mode)}
                        </td>
                        <td>
                          {fmtVal(c.openCount, c.openAmount, mode)}
                        </td>
                        <td
                          style={{
                            fontWeight: 600,
                            color: ccwrColor(ccwr, data.ccwrTarget),
                          }}
                        >
                          {fmtCcwr(ccwr)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Breakdown tables */}
            <div className="side-by-side">
              <BreakdownTable title="By Opp Set Type" rows={breakdownBySetType} mode={mode} target={data.ccwrTarget} />
              <BreakdownTable title="By Opportunity Source" rows={breakdownBySource} mode={mode} target={data.ccwrTarget} />
            </div>
            <div className="side-by-side">
              <BreakdownTable title="By Segment" rows={breakdownBySegment} mode={mode} target={data.ccwrTarget} />
              <BreakdownTable title="By Industry" rows={breakdownByIndustry} mode={mode} target={data.ccwrTarget} />
            </div>

            {/* Deal list */}
            {(() => {
              const dealOpps = filteredOpps
                .filter((o) => {
                  if (!selectedCohort) return true;
                  // discoveryDate is "YYYY-MM-DD" — slice the month key directly
                  // to stay timezone-stable.
                  return o.discoveryDate.slice(0, 7) === selectedCohort;
                })
                .sort((a, b) => b.amount - a.amount);
              const totalCount = dealOpps.length;
              const displayOpps = dealOpps.slice(0, 100);
              const cohortLabel = selectedCohort
                ? cohorts.find((c) => c.monthKey === selectedCohort)?.monthLabel ?? selectedCohort
                : null;

              return (
                <div className="card">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>
                      Deal List
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      {selectedCohort && (
                        <button
                          onClick={() => setSelectedCohort(null)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--red)",
                            fontSize: 10,
                            cursor: "pointer",
                          }}
                        >
                          Clear cohort filter
                        </button>
                      )}
                      <div style={{ fontSize: 10, color: "var(--muted)" }}>
                        Showing {displayOpps.length} of {totalCount} opps
                        {cohortLabel && ` in ${cohortLabel}`}
                      </div>
                    </div>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table>
                      <thead>
                        <tr>
                          <th style={{ textAlign: "left" }}>Opp Name</th>
                          <th style={{ textAlign: "left" }}>Owner</th>
                          <th style={{ textAlign: "left" }}>Stage</th>
                          <th>Amount</th>
                          <th>Discovery</th>
                          <th style={{ textAlign: "left" }}>Set Type</th>
                          <th>Segment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {displayOpps.map((o, i) => {
                          const [yy, mm, dd] = o.discoveryDate.split("-");
                          const discStr = `${parseInt(mm, 10)}/${parseInt(dd, 10)}/${yy.slice(2)}`;
                          return (
                            <tr key={`${o.name}-${i}`}>
                              <td style={{ textAlign: "left", fontWeight: 500, maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                {o.name}
                              </td>
                              <td style={{ textAlign: "left" }}>{o.owner}</td>
                              <td style={{ textAlign: "left" }}>{o.stage}</td>
                              <td>{fmtK(o.amount)}</td>
                              <td>{discStr}</td>
                              <td style={{ textAlign: "left" }}>{o.oppSetType}</td>
                              <td>{o.segment}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })()}

          </>
        )}
      </div>
    </>
  );
}
