"use client";

import { SaoQualityState } from "@/lib/types-mm-sdr";
import { fmtK } from "@/lib/format";

export default function MmSdrSaoQuality({ data }: { data: SaoQualityState }) {
  const { acceptedSaos } = data;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 10 }}>
        Accepted SAO Characteristics
      </div>

      {acceptedSaos.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr style={{ color: "#999", borderBottom: "1px solid #333" }}>
                <th style={{ textAlign: "left", padding: 8, fontWeight: 500 }}>Opp Name</th>
                <th style={{ textAlign: "left", padding: 8, fontWeight: 500 }}>AE</th>
                <th style={{ textAlign: "left", padding: 8, fontWeight: 500 }}>Company</th>
                <th style={{ textAlign: "left", padding: 8, fontWeight: 500 }}>Industry</th>
                <th style={{ textAlign: "left", padding: 8, fontWeight: 500 }}>Entry Point</th>
                <th style={{ textAlign: "right", padding: 8, fontWeight: 500 }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {acceptedSaos.map((s, i) => (
                <tr key={i} style={{ borderTop: "1px solid #2a2a2a" }}>
                  <td style={{ padding: 8, color: "#fff", fontWeight: 500, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.oppName}</td>
                  <td style={{ padding: 8, color: "#ddd" }}>{s.ae}</td>
                  <td style={{ padding: 8, color: "#ddd" }}>{s.company}</td>
                  <td style={{ padding: 8, color: "#ddd" }}>{s.industry || "—"}</td>
                  <td style={{ padding: 8, color: "#ddd" }}>{s.entryPointTitle}</td>
                  <td style={{ textAlign: "right", padding: 8, color: "#fff", fontWeight: 600 }}>{fmtK(s.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ fontSize: 11, color: "#999", fontStyle: "italic" }}>
          No accepted MM outbound SAOs this week.
        </div>
      )}
    </div>
  );
}
