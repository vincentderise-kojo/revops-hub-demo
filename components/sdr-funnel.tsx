"use client";

import { SdrFunnelRow } from "@/lib/types-sdr";
import { fmtK } from "@/lib/format";

interface FunnelData {
  teamTotals: {
    meetingsSet: number;
    saos: number;
    conversionRate: number;
    pipelineDollars: number;
    closedWonDollars: number;
  };
  mm: SdrFunnelRow[];
  ent: SdrFunnelRow[];
  mmTotals: SdrFunnelRow;
  entTotals: SdrFunnelRow;
  teamTotal: SdrFunnelRow;
}

function convColor(rate: number): string {
  if (rate >= 0.3) return "var(--green)";
  if (rate >= 0.2) return "var(--kojo-yellow)";
  return "#ff6b6b";
}

function FunnelRepRow({ r }: { r: SdrFunnelRow }) {
  return (
    <tr style={{ borderTop: "1px solid #1a1a1a" }}>
      <td style={{ padding: 8, color: "#fff", fontWeight: 500 }}>{r.sdrName}</td>
      <td style={{ textAlign: "center", padding: 8, color: "#ccc" }}>{r.meetingsSet}</td>
      <td style={{ textAlign: "center", padding: 8, color: "#ccc" }}>{r.saos}</td>
      <td
        style={{
          textAlign: "center",
          padding: 8,
          color: convColor(r.conversionRate),
          fontWeight: 600,
        }}
      >
        {Math.round(r.conversionRate * 100)}%
      </td>
      <td style={{ textAlign: "center", padding: 8, color: "#ccc" }}>{fmtK(r.pipelineDollars)}</td>
      <td style={{ textAlign: "center", padding: 8, color: "#ccc" }}>
        {r.saos > 0 ? fmtK(r.avgDealSize) : "—"}
      </td>
      <td
        style={{
          textAlign: "center",
          padding: 8,
          color: r.closedWonDollars > 0 ? "var(--green)" : "#ccc",
          fontWeight: r.closedWonDollars > 0 ? 600 : 400,
        }}
      >
        {fmtK(r.closedWonDollars)}
      </td>
    </tr>
  );
}

function FunnelTotalRow({
  r,
  label,
  color,
  isBold,
}: {
  r: SdrFunnelRow;
  label: string;
  color: string;
  isBold?: boolean;
}) {
  const bg = isBold ? "#111" : "#0d0d0d";
  const fontSize = isBold ? 12 : 11;

  return (
    <tr style={{ borderTop: isBold ? "2px solid #444" : "1px solid #333", background: bg }}>
      <td style={{ padding: isBold ? "10px 8px" : 8, color, fontWeight: 700, fontSize }}>
        {label}
      </td>
      <td style={{ textAlign: "center", padding: 8, color: "#fff", fontWeight: 700, fontSize }}>
        {r.meetingsSet}
      </td>
      <td style={{ textAlign: "center", padding: 8, color: "#fff", fontWeight: 700, fontSize }}>
        {r.saos}
      </td>
      <td
        style={{
          textAlign: "center",
          padding: 8,
          color: convColor(r.conversionRate),
          fontWeight: 700,
          fontSize,
        }}
      >
        {Math.round(r.conversionRate * 100)}%
      </td>
      <td style={{ textAlign: "center", padding: 8, color: "#fff", fontWeight: 700, fontSize }}>
        {fmtK(r.pipelineDollars)}
      </td>
      <td style={{ textAlign: "center", padding: 8, color: "#ccc", fontSize }}>
        {r.saos > 0 ? fmtK(r.avgDealSize) : "—"}
      </td>
      <td
        style={{
          textAlign: "center",
          padding: 8,
          color: r.closedWonDollars > 0 ? "var(--green)" : "#fff",
          fontWeight: 700,
          fontSize,
        }}
      >
        {fmtK(r.closedWonDollars)}
      </td>
    </tr>
  );
}

export default function SdrFunnel({ data }: { data: FunnelData }) {
  const t = data.teamTotals;

  return (
    <div style={{ paddingTop: 16, borderTop: "1px solid #1a1a1a" }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 10 }}>
        Conversion Funnel — QTD
      </div>

      {/* Team totals bar */}
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[
          { label: "Meetings Set", value: String(t.meetingsSet), color: "#fff" },
          { label: "SAOs", value: String(t.saos), color: "#fff" },
          { label: "Conv. Rate", value: `${Math.round(t.conversionRate * 100)}%`, color: "var(--kojo-yellow)" },
          { label: "Pipeline $", value: fmtK(t.pipelineDollars), color: "#fff" },
          { label: "Closed Won", value: fmtK(t.closedWonDollars), color: "var(--green)" },
        ].map((card, i, arr) => (
          <div key={card.label} style={{ display: "contents" }}>
            <div
              style={{
                flex: 1,
                background: card.label === "Closed Won" ? "#111" : "#111",
                border: card.label === "Closed Won" ? "1px solid #1a3a1a" : "1px solid #222",
                borderRadius: 6,
                padding: 10,
                textAlign: "center",
              }}
            >
              <div style={{ fontSize: 10, color: "#666", textTransform: "uppercase" }}>
                {card.label}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: card.color, margin: "2px 0" }}>
                {card.value}
              </div>
            </div>
            {i < arr.length - 1 && (
              <div style={{ display: "flex", alignItems: "center", color: "#444", fontSize: 18 }}>
                →
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Per-rep conversion table */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr style={{ color: "#666", borderBottom: "1px solid #333" }}>
            <th style={{ textAlign: "left", padding: 8, fontWeight: 500 }}>SDR</th>
            <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>Meetings</th>
            <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>SAOs</th>
            <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>Conv.</th>
            <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>Pipeline $</th>
            <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>Avg Deal</th>
            <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>CW $</th>
          </tr>
        </thead>
        <tbody>
          {/* MidMarket */}
          {data.mm.length > 0 && (
            <>
              <tr>
                <td
                  colSpan={7}
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
              {data.mm.map((r) => (
                <FunnelRepRow key={r.sdrName} r={r} />
              ))}
              <FunnelTotalRow r={data.mmTotals} label="MM Total" color="var(--teal)" />
            </>
          )}

          {/* Enterprise */}
          {data.ent.length > 0 && (
            <>
              <tr>
                <td
                  colSpan={7}
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
              {data.ent.map((r) => (
                <FunnelRepRow key={r.sdrName} r={r} />
              ))}
              <FunnelTotalRow r={data.entTotals} label="ENT Total" color="#8888ff" />
            </>
          )}

          {/* Team Total */}
          <FunnelTotalRow r={data.teamTotal} label="Team Total" color="#fff" isBold />
        </tbody>
      </table>

      {/* Methodology note */}
      <div
        style={{
          marginTop: 12,
          padding: "10px 12px",
          background: "#111",
          border: "1px solid #222",
          borderRadius: 6,
          fontSize: 11,
          color: "#888",
          lineHeight: 1.6,
        }}
      >
        <span style={{ color: "#fff", fontWeight: 600 }}>Methodology:</span> SAOs = all New
        Business opportunities entering Discovery where the SDR is credited as SDR Owner, across all
        source types. This means SDR SAO counts here will be higher than the &quot;SDR Outbound&quot;
        line on Weekly Lookback, because SDRs also work inbound, event, and other leads. Conversion
        rate = SAOs ÷ Meetings Set per SDR over the selected period. Meetings (from SDR Sets report)
        and SAOs (from NB pipeline) are different opportunity types counted independently — not linked
        at the record level. Closed Won $ reflects NB opps attributed to the SDR that reached Closed
        Won stage. A high meeting count with low conversion may indicate qualification issues; low
        meetings with high conversion may indicate capacity constraints.
      </div>
    </div>
  );
}
