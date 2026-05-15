"use client";

import { SdrRepDetail } from "@/lib/types-sdr";

interface RepTableData {
  mm: SdrRepDetail[];
  ent: SdrRepDetail[];
  ramping: SdrRepDetail[];
  mmTotals: SdrRepDetail;
  entTotals: SdrRepDetail;
}

function paceColor(pct: number): string {
  if (pct >= 90) return "var(--green)";
  if (pct >= 75) return "var(--kojo-yellow)";
  return "#ff6b6b";
}

function gapColor(gap: number): string {
  if (gap > 0) return "var(--green)";
  if (gap === 0) return "var(--kojo-yellow)";
  return "#ff6b6b";
}

function RepRow({ d, isRamping }: { d: SdrRepDetail; isRamping?: boolean }) {
  const muted = isRamping || d.status === "Ramping";

  return (
    <tr style={{ borderTop: "1px solid #1a1a1a" }}>
      <td style={{ padding: 8, color: muted ? "#888" : "#fff", fontWeight: 500 }}>
        {d.sdrName}
        {d.status === "Ramping" && (
          <span style={{ fontSize: 9, color: "#555", marginLeft: 4 }}>RAMP</span>
        )}
      </td>
      <td style={{ textAlign: "center", padding: 8, color: muted ? "#555" : "#ccc" }}>
        {d.monthlyQuota}
      </td>
      <td style={{ textAlign: "center", padding: 8, color: muted ? "#555" : "#ccc" }}>
        {d.reqPerWeek.toFixed(1)}
      </td>
      <td
        style={{
          textAlign: "center",
          padding: 8,
          color: muted ? "#666" : d.thisWeekSaos >= d.reqPerWeek ? "var(--green)" : "#ff6b6b",
          fontWeight: 600,
        }}
      >
        {d.thisWeekSaos.toFixed(2)}
      </td>
      <td style={{ textAlign: "center", padding: 8, color: muted ? "#555" : "#ccc" }}>
        {d.avgPerWeek.toFixed(1)}
      </td>
      <td style={{ textAlign: "center", padding: 8, color: muted ? "#666" : "#fff", fontWeight: 600 }}>
        {d.qtdSaos.toFixed(2)}
      </td>
      <td style={{ textAlign: "center", padding: 8, color: muted ? "#555" : "#ccc" }}>
        {muted ? "—" : d.reqQtd}
      </td>
      <td
        style={{
          textAlign: "center",
          padding: 8,
          color: muted ? "#555" : gapColor(d.gap),
          fontWeight: 600,
        }}
      >
        {muted ? "—" : d.gap > 0 ? `+${d.gap.toFixed(2)}` : d.gap.toFixed(2)}
      </td>
      <td style={{ padding: 8 }}>
        {muted ? (
          <span style={{ color: "#555", fontSize: 10 }}>Ramping</span>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div
              style={{
                flex: 1,
                height: 6,
                background: "#1a1a1a",
                borderRadius: 3,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${Math.min(d.pacePercent, 100)}%`,
                  height: "100%",
                  background: paceColor(d.pacePercent),
                  borderRadius: 3,
                }}
              />
            </div>
            <span style={{ fontSize: 10, color: paceColor(d.pacePercent), fontWeight: 600 }}>
              {d.pacePercent}%
            </span>
          </div>
        )}
      </td>
    </tr>
  );
}

function TotalRow({ d, label, color }: { d: SdrRepDetail; label: string; color: string }) {
  return (
    <tr style={{ borderTop: "1px solid #333", background: "#0d0d0d" }}>
      <td style={{ padding: 8, color, fontWeight: 600, fontSize: 10, textTransform: "uppercase" }}>
        {label}
      </td>
      <td style={{ textAlign: "center", padding: 8, color: "#888", fontWeight: 600 }}>
        {d.monthlyQuota}
      </td>
      <td style={{ textAlign: "center", padding: 8, color: "#888", fontWeight: 600 }}>
        {d.reqPerWeek.toFixed(1)}
      </td>
      <td
        style={{
          textAlign: "center",
          padding: 8,
          color: d.thisWeekSaos >= d.reqPerWeek ? "var(--green)" : "#ff6b6b",
          fontWeight: 700,
        }}
      >
        {d.thisWeekSaos.toFixed(2)}
      </td>
      <td style={{ textAlign: "center", padding: 8, color: "#888", fontWeight: 600 }}>
        {d.avgPerWeek.toFixed(1)}
      </td>
      <td style={{ textAlign: "center", padding: 8, color: "#fff", fontWeight: 700 }}>
        {d.qtdSaos.toFixed(2)}
      </td>
      <td style={{ textAlign: "center", padding: 8, color: "#888", fontWeight: 600 }}>
        {d.reqQtd}
      </td>
      <td
        style={{
          textAlign: "center",
          padding: 8,
          color: gapColor(d.gap),
          fontWeight: 700,
        }}
      >
        {d.gap > 0 ? `+${d.gap.toFixed(2)}` : d.gap.toFixed(2)}
      </td>
      <td />
    </tr>
  );
}

export default function SdrRepTable({ data }: { data: RepTableData }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 2 }}>
        Rep Detail — {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
      </div>
      <div style={{ fontSize: 10, color: "#666", marginBottom: 10 }}>
        SAO Points (Meeting Held Date) vs points-denominated quota
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ color: "#666", borderBottom: "1px solid #333" }}>
              <th style={{ textAlign: "left", padding: 8, fontWeight: 500 }}>SDR</th>
              <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>Mo. Quota</th>
              <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>Req/Wk</th>
              <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>This Wk</th>
              <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>Avg/Wk</th>
              <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>QTD Pts</th>
              <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>Req QTD</th>
              <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>Gap</th>
              <th style={{ textAlign: "left", padding: 8, fontWeight: 500, width: 140 }}>Pace</th>
            </tr>
          </thead>
          <tbody>
            {/* MidMarket */}
            {data.mm.length > 0 && (
              <>
                <tr>
                  <td
                    colSpan={9}
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
                {data.mm.map((d) => (
                  <RepRow key={d.sdrName} d={d} />
                ))}
                <TotalRow d={data.mmTotals} label="MM Total" color="var(--teal)" />
              </>
            )}

            {/* Enterprise */}
            {data.ent.length > 0 && (
              <>
                <tr>
                  <td
                    colSpan={9}
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
                {data.ent.map((d) => (
                  <RepRow key={d.sdrName} d={d} />
                ))}
                <TotalRow d={data.entTotals} label="ENT Total" color="#8888ff" />
              </>
            )}

            {/* Ramping */}
            {data.ramping.length > 0 && (
              <>
                <tr>
                  <td
                    colSpan={9}
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
                {data.ramping.map((d) => (
                  <RepRow key={d.sdrName} d={d} isRamping />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
