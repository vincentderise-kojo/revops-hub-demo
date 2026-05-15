"use client";

import { ActivityMetricsState } from "@/lib/types-mm-sdr";

function wowArrow(delta: number): string {
  if (delta > 0) return "▲";
  if (delta < 0) return "▼";
  return "—";
}

function wowColor(delta: number): string {
  if (delta > 0) return "var(--green)";
  if (delta < 0) return "#ff6b6b";
  return "#666";
}

function pctDisplay(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

export default function MmSdrActivity({ data }: { data: ActivityMetricsState }) {
  const { rows, teamTotal, wow } = data;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>SDR Activity Metrics</div>
        <div style={{ display: "flex", gap: 12, fontSize: 10, color: "#999" }}>
          {[
            { label: "Calls", delta: wow.callsMade },
            { label: "Connects", delta: wow.connects },
            { label: "Sets", delta: wow.sets },
            { label: "SAOs", delta: wow.saosCreated },
          ].map((w) => (
            <span key={w.label}>
              {w.label}{" "}
              <span style={{ color: wowColor(w.delta), fontWeight: 600 }}>
                {wowArrow(w.delta)} {Math.abs(w.delta)}
              </span>
            </span>
          ))}
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ color: "#999", borderBottom: "1px solid #333" }}>
              <th style={{ textAlign: "left", padding: 8, fontWeight: 500 }}>SDR</th>
              <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>Calls</th>
              <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>Connects</th>
              <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>Connect %</th>
              <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>Sets</th>
              <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>Set %</th>
              <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>Mtgs Held</th>
              <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>Hold %</th>
              <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>SAOs</th>
              <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>SAO %</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sdrName} style={{ borderTop: "1px solid #2a2a2a" }}>
                <td style={{ padding: 8, color: "#fff", fontWeight: 500 }}>{r.sdrName}</td>
                <td style={{ textAlign: "center", padding: 8, color: "#ddd" }}>{r.callsMade}</td>
                <td style={{ textAlign: "center", padding: 8, color: "#ddd" }}>{r.connects}</td>
                <td style={{ textAlign: "center", padding: 8, color: r.connectRate >= 0.08 ? "var(--green)" : "#ff6b6b", fontWeight: 600 }}>
                  {pctDisplay(r.connectRate)}
                </td>
                <td style={{ textAlign: "center", padding: 8, color: "#ddd" }}>{r.sets}</td>
                <td style={{ textAlign: "center", padding: 8, color: "#ddd" }}>{pctDisplay(r.setRate)}</td>
                <td style={{ textAlign: "center", padding: 8, color: "#ddd" }}>{r.meetingsHeld}</td>
                <td style={{ textAlign: "center", padding: 8, color: "#ddd" }}>{pctDisplay(r.meetingHoldRate)}</td>
                <td style={{ textAlign: "center", padding: 8, color: "#fff", fontWeight: 600 }}>{r.saosCreated}</td>
                <td style={{ textAlign: "center", padding: 8, color: "#ddd" }}>{pctDisplay(r.saoRate)}</td>
              </tr>
            ))}
            {/* Team Total */}
            <tr style={{ borderTop: "2px solid #444", background: "#0d0d0d" }}>
              <td style={{ padding: 8, color: "#fff", fontWeight: 700, fontSize: 11 }}>Team Total</td>
              <td style={{ textAlign: "center", padding: 8, color: "#fff", fontWeight: 700 }}>{teamTotal.callsMade}</td>
              <td style={{ textAlign: "center", padding: 8, color: "#fff", fontWeight: 700 }}>{teamTotal.connects}</td>
              <td style={{ textAlign: "center", padding: 8, color: "#fff", fontWeight: 700 }}>{pctDisplay(teamTotal.connectRate)}</td>
              <td style={{ textAlign: "center", padding: 8, color: "#fff", fontWeight: 700 }}>{teamTotal.sets}</td>
              <td style={{ textAlign: "center", padding: 8, color: "#fff", fontWeight: 700 }}>{pctDisplay(teamTotal.setRate)}</td>
              <td style={{ textAlign: "center", padding: 8, color: "#fff", fontWeight: 700 }}>{teamTotal.meetingsHeld}</td>
              <td style={{ textAlign: "center", padding: 8, color: "#fff", fontWeight: 700 }}>{pctDisplay(teamTotal.meetingHoldRate)}</td>
              <td style={{ textAlign: "center", padding: 8, color: "#fff", fontWeight: 700 }}>{teamTotal.saosCreated}</td>
              <td style={{ textAlign: "center", padding: 8, color: "#fff", fontWeight: 700 }}>{pctDisplay(teamTotal.saoRate)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
