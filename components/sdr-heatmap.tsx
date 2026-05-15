"use client";

import { useState } from "react";
import { SdrHeatmapRow, SdrWeekCell } from "@/lib/types-sdr";
import { fmtK } from "@/lib/format";
import { WEEKS_PER_MONTH } from "@/lib/config";

interface HeatmapData {
  mm: SdrHeatmapRow[];
  ent: SdrHeatmapRow[];
  ramping: SdrHeatmapRow[];
  mmSubtotals: SdrWeekCell[];
  entSubtotals: SdrWeekCell[];
}

type HeatmapMode = "sao" | "pipeline";

function cellColor(
  value: number,
  mode: HeatmapMode,
  weeklyPace: number,
  rollingAvg: number,
  isRamping: boolean
): string {
  if (isRamping) return "#1a1a1a";

  if (mode === "sao") {
    if (value >= weeklyPace) return "#1a3a1a";
    if (value >= weeklyPace - 1) return "#2a2a1a";
    return "#2a1a1a";
  } else {
    // Pipeline $ mode — relative to own rolling average
    if (rollingAvg === 0) return "#1a1a1a";
    if (value >= rollingAvg) return "#1a3a1a";
    if (value >= rollingAvg * 0.5) return "#2a2a1a";
    return "#2a1a1a";
  }
}

function cellTextColor(
  value: number,
  mode: HeatmapMode,
  weeklyPace: number,
  rollingAvg: number,
  isRamping: boolean
): string {
  if (isRamping) return "#666";

  if (mode === "sao") {
    if (value >= weeklyPace) return "var(--green)";
    if (value >= weeklyPace - 1) return "var(--kojo-yellow)";
    return "#ff6b6b";
  } else {
    if (rollingAvg === 0) return "#666";
    if (value >= rollingAvg) return "var(--green)";
    if (value >= rollingAvg * 0.5) return "var(--kojo-yellow)";
    return "#ff6b6b";
  }
}

const statusColors: Record<string, { bg: string; text: string }> = {
  "On Pace": { bg: "#1a3a1a", text: "var(--green)" },
  "At Risk": { bg: "#2a2a1a", text: "var(--kojo-yellow)" },
  Behind: { bg: "#2a1a1a", text: "#ff6b6b" },
  Ramping: { bg: "#1a1a1a", text: "#555" },
};

function HeatmapRow({
  row,
  mode,
  monthlyQuota,
}: {
  row: SdrHeatmapRow;
  mode: HeatmapMode;
  monthlyQuota: number;
}) {
  const weeklyPace = monthlyQuota / WEEKS_PER_MONTH;
  const isRamping = row.status === "Ramping";
  const avg = mode === "sao" ? row.rollingAvgSao : row.rollingAvgPipeline;

  return (
    <tr style={{ borderTop: "1px solid #1a1a1a" }}>
      <td style={{ padding: 8, color: isRamping ? "#888" : "#fff", fontWeight: 500 }}>
        {row.sdrName}
        {row.isTeamLead && (
          <span style={{ fontSize: 9, color: "#666", fontWeight: 400, marginLeft: 4 }}>TL</span>
        )}
        {isRamping && (
          <span style={{ fontSize: 9, color: "#555", fontWeight: 400, marginLeft: 4 }}>RAMP</span>
        )}
      </td>
      {row.weeks.map((w) => {
        const val = mode === "sao" ? w.saoCount : w.pipelineDollars;
        const displayVal = mode === "sao" ? String(val) : fmtK(val);
        const rollingRef = mode === "sao" ? row.rollingAvgSao : row.rollingAvgPipeline;
        const bg = cellColor(val, mode, weeklyPace, rollingRef, isRamping);
        const color = cellTextColor(val, mode, weeklyPace, rollingRef, isRamping);

        return (
          <td
            key={w.weekLabel}
            style={{
              textAlign: "center",
              padding: "8px 4px",
              borderLeft: w.isCurrentWeek ? "2px solid #444" : undefined,
            }}
          >
            <div
              style={{
                background: bg,
                color,
                borderRadius: 4,
                padding: 4,
                fontWeight: w.isCurrentWeek ? 700 : 400,
              }}
            >
              {isRamping && val === 0 ? "—" : displayVal}
            </div>
          </td>
        );
      })}
      <td style={{ textAlign: "center", padding: 8, color: isRamping ? "#555" : "#ccc" }}>
        {mode === "sao" ? row.rollingAvgSao.toFixed(1) : fmtK(row.rollingAvgPipeline)}
      </td>
      <td style={{ textAlign: "center", padding: 8 }}>
        <span
          style={{
            background: statusColors[row.status].bg,
            color: statusColors[row.status].text,
            padding: "3px 8px",
            borderRadius: 10,
            fontSize: 10,
            fontWeight: 600,
          }}
        >
          {row.status}
        </span>
      </td>
    </tr>
  );
}

function SubtotalRow({ cells, label, color, mode }: { cells: SdrWeekCell[]; label: string; color: string; mode: HeatmapMode }) {
  return (
    <tr style={{ borderTop: "1px solid #333", background: "#0d0d0d" }}>
      <td style={{ padding: 8, color, fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>
        {label}
      </td>
      {cells.map((c) => (
        <td
          key={c.weekLabel}
          style={{
            textAlign: "center",
            padding: "8px 4px",
            color: c.isCurrentWeek ? "#fff" : "#888",
            fontWeight: c.isCurrentWeek ? 700 : 600,
            borderLeft: c.isCurrentWeek ? "2px solid #444" : undefined,
          }}
        >
          {mode === "sao" ? c.saoCount : fmtK(c.pipelineDollars)}
        </td>
      ))}
      <td />
      <td />
    </tr>
  );
}

export default function SdrHeatmap({ data }: { data: HeatmapData }) {
  const [mode, setMode] = useState<HeatmapMode>("sao");

  // Get week labels from first available row
  const firstRow = data.mm[0] || data.ent[0] || data.ramping[0];
  const weekLabels = firstRow?.weeks.map((w) => w.weekLabel) || [];

  // We need monthly quotas per SDR for pace calculation
  // These are embedded in the rows via their status calculation already
  // For cell coloring, we use a simple lookup

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>Rolling Performance</div>
        <div style={{ display: "flex", background: "#1a1a1a", borderRadius: 6, overflow: "hidden", border: "1px solid #333" }}>
          <button
            onClick={() => setMode("sao")}
            style={{
              padding: "5px 12px",
              fontSize: 11,
              background: mode === "sao" ? "var(--green)" : "transparent",
              color: mode === "sao" ? "#000" : "#888",
              fontWeight: mode === "sao" ? 600 : 400,
              border: "none",
              cursor: "pointer",
            }}
          >
            SAO Count
          </button>
          <button
            onClick={() => setMode("pipeline")}
            style={{
              padding: "5px 12px",
              fontSize: 11,
              background: mode === "pipeline" ? "var(--green)" : "transparent",
              color: mode === "pipeline" ? "#000" : "#888",
              fontWeight: mode === "pipeline" ? 600 : 400,
              border: "none",
              cursor: "pointer",
            }}
          >
            Pipeline $
          </button>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ color: "#666" }}>
              <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 500, width: 130 }}>SDR</th>
              {weekLabels.map((wl, i) => (
                <th
                  key={wl}
                  style={{
                    textAlign: "center",
                    padding: "6px 4px",
                    fontWeight: 500,
                    borderLeft: i === weekLabels.length - 1 ? "2px solid #444" : undefined,
                  }}
                >
                  {i === weekLabels.length - 1 ? "This Wk" : `W${i + 1}`}
                </th>
              ))}
              <th style={{ textAlign: "center", padding: "6px 8px", fontWeight: 500 }}>Avg</th>
              <th style={{ textAlign: "center", padding: "6px 8px", fontWeight: 500 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {/* MidMarket */}
            {data.mm.length > 0 && (
              <>
                <tr>
                  <td
                    colSpan={weekLabels.length + 3}
                    style={{
                      padding: "10px 8px 4px",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--teal)",
                      textTransform: "uppercase",
                      letterSpacing: 1,
                      borderTop: "2px solid #222",
                    }}
                  >
                    MidMarket
                  </td>
                </tr>
                {data.mm.map((row) => (
                  <HeatmapRow key={row.sdrName} row={row} mode={mode} monthlyQuota={row.monthlyQuota} />
                ))}
                <SubtotalRow cells={data.mmSubtotals} label="MM Subtotal" color="var(--teal)" mode={mode} />
              </>
            )}

            {/* Enterprise */}
            {data.ent.length > 0 && (
              <>
                <tr>
                  <td
                    colSpan={weekLabels.length + 3}
                    style={{
                      padding: "14px 8px 4px",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#8888ff",
                      textTransform: "uppercase",
                      letterSpacing: 1,
                      borderTop: "2px solid #222",
                    }}
                  >
                    Enterprise
                  </td>
                </tr>
                {data.ent.map((row) => (
                  <HeatmapRow key={row.sdrName} row={row} mode={mode} monthlyQuota={row.monthlyQuota} />
                ))}
                <SubtotalRow cells={data.entSubtotals} label="ENT Subtotal" color="#8888ff" mode={mode} />
              </>
            )}

            {/* Ramping */}
            {data.ramping.length > 0 && (
              <>
                <tr>
                  <td
                    colSpan={weekLabels.length + 3}
                    style={{
                      padding: "14px 8px 4px",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "#555",
                      textTransform: "uppercase",
                      letterSpacing: 1,
                      borderTop: "2px solid #222",
                    }}
                  >
                    Ramping
                  </td>
                </tr>
                {data.ramping.map((row) => (
                  <HeatmapRow key={row.sdrName} row={row} mode={mode} monthlyQuota={row.monthlyQuota} />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ padding: "8px 8px 0", fontSize: 10, color: "#555" }}>
        Color intensity:{" "}
        <span style={{ color: "var(--green)" }}>green</span> = at/above weekly pace ·{" "}
        <span style={{ color: "var(--kojo-yellow)" }}>yellow</span> = within 1 of pace ·{" "}
        <span style={{ color: "#ff6b6b" }}>red</span> = 2+ below pace · Ramping reps shown but not
        paced
      </div>
    </div>
  );
}
