"use client";

import { useRef, useState } from "react";
import { DashboardState, PacingWeek } from "@/lib/types";
import { fmtK, fmtM } from "@/lib/format";

type ActualKey = "bdr" | "field" | "perf" | "ae" | "total";
type TargetKey = "bdr" | "field" | "perf" | "total" | null;

type PacingView = "byChannel" | "combined";

export default function PacingSection({ data }: { data: DashboardState }) {
  const pacing = data.pacing;
  const [view, setView] = useState<PacingView>("byChannel");
  if (!pacing) return null;

  const { weeks, quarterSummary } = pacing;
  const paceColor: Record<string, string> = {
    ahead: "var(--green)",
    onPace: "var(--teal)",
    behind: "var(--red)",
  };

  return (
    <div className="card">
      <div style={{ marginBottom: 14 }}>
        <div className="label">Q2&apos;26 Pacing</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginTop: 4 }}>
          Cumulative pipeline creation by owner group
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
          Solid line = actual · Dashed line = board target · Hover any chart for weekly detail · AE Self-Set shown separately as upside (no target)
        </div>
      </div>

      {/* Tab strip */}
      <div style={{ display: "flex", gap: 0, border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden", marginBottom: 14, width: "fit-content" }}>
        {(["byChannel", "combined"] as PacingView[]).map((v, i) => {
          const active = view === v;
          const label = v === "byChannel" ? "By Channel" : "Combined";
          return (
            <button
              key={v}
              onClick={() => setView(v)}
              style={{
                padding: "5px 14px",
                fontSize: 11,
                fontWeight: active ? 700 : 500,
                background: active ? "var(--teal)" : "transparent",
                color: active ? "#0b0b0b" : "var(--text)",
                border: "none",
                borderLeft: i === 0 ? "none" : "1px solid var(--border)",
                cursor: active ? "default" : "pointer",
                fontFamily: "inherit",
                letterSpacing: 0.3,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {view === "byChannel" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 14 }}>
          <PacingChart
            title="BDR Outbound"
            owner="Riley Quinn"
            color="var(--green)"
            weeks={weeks}
            actualKey="bdr"
            targetKey="bdr"
          />
          <PacingChart
            title="Field Marketing"
            owner="Owen Hartwell"
            color="var(--blue)"
            weeks={weeks}
            actualKey="field"
            targetKey="field"
          />
          <PacingChart
            title="Perf Marketing"
            owner="Priya Banerjee"
            color="var(--yellow)"
            weeks={weeks}
            actualKey="perf"
            targetKey="perf"
          />
          <PacingChart
            title="AE Self-Set · Upside"
            owner="Kevin & Patrick"
            color="var(--muted)"
            weeks={weeks}
            actualKey="ae"
            targetKey={null}
            isUpside
          />
        </div>
      )}

      {view === "combined" && (
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <PacingChart
            title="Board Plan Combined · BDR + Field + Perf"
            owner="All board-plan channels · AE upside stacked on top"
            color="var(--teal)"
            weeks={weeks}
            actualKey="total"
            targetKey="total"
            wide
            overlay={{ actualKey: "ae", color: "var(--muted)", label: "AE upside", stackOnActual: true }}
          />
        </div>
      )}

      {(() => {
        const aeToDate = quarterSummary.weeksElapsed > 0
          ? weeks[quarterSummary.weeksElapsed - 1].cumulativeActual.ae
          : 0;
        const allIn = quarterSummary.actualToDate + aeToDate;
        return (
          <div style={{ marginTop: 18, padding: "12px 14px", border: "1px solid var(--border)", borderRadius: 6, background: "rgba(255,255,255,0.02)" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, alignItems: "center" }}>
              <Stat label="Q2'26 Board Plan" value={`${fmtM(quarterSummary.actualToDate)} / ${fmtM(quarterSummary.quarterGoal)}`} />
              <Stat label="Weeks Elapsed" value={`${quarterSummary.weeksElapsed} / 13`} />
              <Stat label="Pace" value={quarterSummary.paceStatus === "ahead" ? "Ahead" : quarterSummary.paceStatus === "onPace" ? "On Pace" : "Behind"} color={paceColor[quarterSummary.paceStatus]} />
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 10, borderTop: "1px solid var(--border)", paddingTop: 8 }}>
              {fmtM(quarterSummary.actualToDate)} pipeline generated
              {aeToDate > 0 && <> + {fmtK(aeToDate)} AE upside</>}
              {" "}= <strong style={{ color: "var(--text)" }}>{fmtM(allIn)}</strong> all-in Q2 pipeline
            </div>
          </div>
        );
      })()}
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: color || "var(--text)", marginTop: 4 }}>{value}</div>
    </div>
  );
}

function PacingChart({
  title,
  owner,
  color,
  weeks,
  actualKey,
  targetKey,
  isUpside = false,
  overlay,
  wide = false,
}: {
  title: string;
  owner: string;
  color: string;
  weeks: PacingWeek[];
  actualKey: ActualKey;
  targetKey: TargetKey;
  isUpside?: boolean;
  overlay?: {
    actualKey: ActualKey;
    color: string;
    label: string;
    stackOnActual?: boolean;
  };
  wide?: boolean;
}) {
  const W = wide ? 640 : 320;
  const H = wide ? 180 : 140;
  const padL = 36, padR = 8, padT = 8, padB = 22;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;

  const actuals = weeks.map((w) => (w.cumulativeActual as Record<string, number>)[actualKey]);
  const targets = targetKey ? weeks.map((w) => (w.cumulativeTarget as Record<string, number>)[targetKey]) : [];
  const oppCounts = weeks.map((w) => (w.cumulativeOppCount as Record<string, number>)[actualKey]);
  // Raw overlay values (for tooltip display); line values may be stacked on actuals.
  const overlayRaw = overlay ? weeks.map((w) => (w.cumulativeActual as Record<string, number>)[overlay.actualKey]) : [];
  const overlayActuals = overlay
    ? (overlay.stackOnActual ? overlayRaw.map((v, i) => actuals[i] + v) : overlayRaw)
    : [];
  const overlayOppCounts = overlay ? weeks.map((w) => (w.cumulativeOppCount as Record<string, number>)[overlay.actualKey]) : [];

  const maxActual = Math.max(...actuals, 1);
  const maxTarget = targetKey ? Math.max(...targets, 1) : 0;
  const maxOverlay = overlay ? Math.max(...overlayActuals, 1) : 0;
  const maxY = Math.max(maxActual, maxTarget, maxOverlay) * 1.1;

  const x = (i: number) => padL + (i / 12) * innerW;
  const y = (v: number) => padT + innerH - (v / maxY) * innerH;

  const actualPath = actuals.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`).join(" ");
  const targetPath = targetKey ? targets.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`).join(" ") : "";
  const overlayPath = overlay ? overlayActuals.map((v, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(v)}`).join(" ") : "";

  // "Ahead / Behind" tag
  let lastPopulatedIdx = -1;
  for (let i = actuals.length - 1; i >= 0; i--) {
    if (actuals[i] > 0) { lastPopulatedIdx = i; break; }
  }
  const currentActual = lastPopulatedIdx >= 0 ? actuals[lastPopulatedIdx] : 0;
  const currentTarget = targetKey && lastPopulatedIdx >= 0 ? targets[lastPopulatedIdx] : 0;
  const diff = currentActual - currentTarget;
  const tagText = isUpside
    ? `${fmtK(currentActual)} created · no target`
    : `${fmtK(currentActual)} / ${fmtK(currentTarget)}`;
  const tagColor = isUpside ? "var(--muted)" : diff >= 0 ? "var(--green)" : "var(--red)";

  const yTicks = [0, maxY / 2, maxY];

  // ── Hover state ──
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    // Map screen-space x → SVG viewBox x (accounting for responsive scaling)
    const relX = ((e.clientX - rect.left) / rect.width) * W;
    if (relX < padL || relX > W - padR) {
      setHoveredIdx(null);
      return;
    }
    // Nearest week index
    const t = (relX - padL) / innerW;
    const idx = Math.round(t * 12);
    setHoveredIdx(Math.max(0, Math.min(12, idx)));
  }

  function handleMouseLeave() {
    setHoveredIdx(null);
  }

  const hovered = hoveredIdx !== null ? weeks[hoveredIdx] : null;
  const hoveredActual = hoveredIdx !== null ? actuals[hoveredIdx] : 0;
  const hoveredTarget = hoveredIdx !== null && targetKey ? targets[hoveredIdx] : 0;
  const hoveredOpps = hoveredIdx !== null ? oppCounts[hoveredIdx] : 0;
  const hoveredOverlay = hoveredIdx !== null && overlay ? overlayRaw[hoveredIdx] : 0;
  const hoveredOverlayOpps = hoveredIdx !== null && overlay ? overlayOppCounts[hoveredIdx] : 0;

  return (
    <div style={{ border: isUpside ? "1px dashed var(--border)" : "1px solid var(--border)", borderRadius: 6, padding: 10, background: "rgba(255,255,255,0.02)", position: "relative" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: 0.3 }}>{title}</div>
          <div style={{ fontSize: 9, color: "var(--muted)" }}>{owner}</div>
        </div>
        <div style={{ fontSize: 10, fontWeight: 600, color: tagColor }}>{tagText}</div>
      </div>
      <div style={{ position: "relative", marginTop: 6 }}>
        <svg
          ref={svgRef}
          width="100%"
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          style={{ display: "block", cursor: "crosshair" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke="var(--border)" strokeDasharray="2,3" opacity={0.4} />
              <text x={padL - 4} y={y(v) + 3} textAnchor="end" fontSize={8} fill="var(--muted)">{fmtK(v)}</text>
            </g>
          ))}
          {targetKey && <path d={targetPath} fill="none" stroke={color} strokeWidth={1.5} strokeDasharray="4,3" opacity={0.7} />}
          <path d={actualPath} fill="none" stroke={color} strokeWidth={2} />
          <path d={`${actualPath} L ${x(12)} ${y(0)} L ${x(0)} ${y(0)} Z`} fill={color} opacity={0.08} />
          {overlay && <path d={overlayPath} fill="none" stroke={overlay.color} strokeWidth={1.5} opacity={0.8} />}
          {/* Data-point dots */}
          {actuals.map((v, i) => (
            <circle
              key={`dot-${i}`}
              cx={x(i)}
              cy={y(v)}
              r={hoveredIdx === i ? 3.5 : 2}
              fill={color}
              opacity={hoveredIdx === i ? 1 : 0.6}
            />
          ))}
          {/* Hover indicator line */}
          {hoveredIdx !== null && (
            <line
              x1={x(hoveredIdx)}
              y1={padT}
              x2={x(hoveredIdx)}
              y2={H - padB}
              stroke={color}
              strokeWidth={1}
              strokeDasharray="2,2"
              opacity={0.5}
            />
          )}
          {weeks.map((w, i) => i % 2 === 0 && (
            <text key={`xt-${i}`} x={x(i)} y={H - 6} textAnchor="middle" fontSize={8} fill="var(--muted)">{w.weekLabel}</text>
          ))}
        </svg>
        {overlay && (
          <div style={{ display: "flex", gap: 12, fontSize: 9, color: "var(--muted)", marginTop: 4, paddingLeft: padL }}>
            <span><span style={{ display: "inline-block", width: 14, height: 2, background: color, verticalAlign: "middle", marginRight: 4 }} />Board plan</span>
            <span><span style={{ display: "inline-block", width: 14, height: 2, background: overlay.color, verticalAlign: "middle", marginRight: 4 }} />{overlay.label}</span>
          </div>
        )}
        {/* Floating tooltip */}
        {hovered && (
          <div
            style={{
              position: "absolute",
              top: 4,
              // Place tooltip on opposite side of the vertical line so it doesn't overlap
              left: hoveredIdx !== null && hoveredIdx < 6 ? "auto" : 8,
              right: hoveredIdx !== null && hoveredIdx < 6 ? 8 : "auto",
              background: "rgba(15, 15, 15, 0.96)",
              border: `1px solid ${color}`,
              borderRadius: 5,
              padding: "6px 9px",
              fontSize: 10,
              minWidth: 130,
              pointerEvents: "none",
              boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
              zIndex: 10,
            }}
          >
            <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 }}>
              Week {hoveredIdx !== null ? hoveredIdx + 1 : ""} · {hovered.weekLabel}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: "var(--text)" }}>
              <span style={{ color: "var(--muted)" }}>Created:</span>
              <strong style={{ color }}>{fmtK(hoveredActual)}</strong>
            </div>
            {targetKey && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: "var(--text)" }}>
                <span style={{ color: "var(--muted)" }}>Target:</span>
                <strong style={{ color: "var(--muted)" }}>{fmtK(hoveredTarget)}</strong>
              </div>
            )}
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: "var(--text)" }}>
              <span style={{ color: "var(--muted)" }}>Opps:</span>
              <strong>{hoveredOpps}</strong>
            </div>
            {overlay && (
              <>
                <div style={{ borderTop: "1px solid var(--border)", marginTop: 4, paddingTop: 4, display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ color: "var(--muted)" }}>{overlay.label}:</span>
                  <strong style={{ color: overlay.color }}>{fmtK(hoveredOverlay)}</strong>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, color: "var(--text)" }}>
                  <span style={{ color: "var(--muted)" }}>Upside opps:</span>
                  <strong>{hoveredOverlayOpps}</strong>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
