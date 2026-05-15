"use client";

import { SaoPipelineState } from "@/lib/types-mm-sdr";
import { fmtK } from "@/lib/format";

function pctDisplay(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}

const statusColors: Record<string, string> = {
  Accepted: "var(--green)",
  Rejected: "#ff6b6b",
  Pending: "var(--brand-yellow)",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function MmSdrSaoPipeline({ data }: { data: SaoPipelineState }) {
  const { acceptanceSummary, teamTotal, detailLog, rejectionLog } = data;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 10 }}>
        SAO Acceptance / Rejection
      </div>

      {/* 4.1 Acceptance Summary */}
      <div style={{ overflowX: "auto", marginBottom: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ color: "#999", borderBottom: "1px solid #333" }}>
              <th style={{ textAlign: "left", padding: 8, fontWeight: 500 }}>AE</th>
              <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>SAOs Rcvd</th>
              <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>Accepted</th>
              <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>Rejected</th>
              <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>Accept %</th>
              <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>Pending</th>
            </tr>
          </thead>
          <tbody>
            {acceptanceSummary.map((r) => (
              <tr key={r.aeName} style={{ borderTop: "1px solid #2a2a2a" }}>
                <td style={{ padding: 8, color: "#fff", fontWeight: 500 }}>{r.aeName}</td>
                <td style={{ textAlign: "center", padding: 8, color: "#ddd" }}>{r.saosReceived}</td>
                <td style={{ textAlign: "center", padding: 8, color: "var(--green)", fontWeight: 600 }}>{r.accepted}</td>
                <td style={{ textAlign: "center", padding: 8, color: r.rejected > 0 ? "#ff6b6b" : "#ccc", fontWeight: r.rejected > 0 ? 600 : 400 }}>
                  {r.rejected}
                </td>
                <td style={{ textAlign: "center", padding: 8, color: r.acceptanceRate >= 0.8 ? "var(--green)" : r.acceptanceRate >= 0.6 ? "var(--brand-yellow)" : "#ff6b6b", fontWeight: 600 }}>
                  {pctDisplay(r.acceptanceRate)}
                </td>
                <td style={{ textAlign: "center", padding: 8, color: "#bbb" }}>{r.pending}</td>
              </tr>
            ))}
            <tr style={{ borderTop: "2px solid #444", background: "#0d0d0d" }}>
              <td style={{ padding: 8, color: "#fff", fontWeight: 700 }}>Team Total</td>
              <td style={{ textAlign: "center", padding: 8, color: "#fff", fontWeight: 700 }}>{teamTotal.saosReceived}</td>
              <td style={{ textAlign: "center", padding: 8, color: "var(--green)", fontWeight: 700 }}>{teamTotal.accepted}</td>
              <td style={{ textAlign: "center", padding: 8, color: "#fff", fontWeight: 700 }}>{teamTotal.rejected}</td>
              <td style={{ textAlign: "center", padding: 8, color: "#fff", fontWeight: 700 }}>{pctDisplay(teamTotal.acceptanceRate)}</td>
              <td style={{ textAlign: "center", padding: 8, color: "#fff", fontWeight: 700 }}>{teamTotal.pending}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 4.2 Detail Log */}
      {detailLog.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#fff", marginBottom: 8 }}>
            SAO Detail
          </div>
          <div style={{ fontSize: 10, color: "#999", fontStyle: "italic", marginBottom: 8 }}>
            Filtered by Qualification Set Date in selected week — this is when the meeting was booked, not when the opp entered pipeline.
          </div>
          <div style={{ overflowX: "auto", marginBottom: 16 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ color: "#999", borderBottom: "1px solid #333" }}>
                  <th style={{ textAlign: "left", padding: 8, fontWeight: 500 }}>Opportunity</th>
                  <th style={{ textAlign: "left", padding: 8, fontWeight: 500 }}>AE</th>
                  <th style={{ textAlign: "left", padding: 8, fontWeight: 500 }}>SDR</th>
                  <th style={{ textAlign: "right", padding: 8, fontWeight: 500 }}>Amount</th>
                  <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>Set Date</th>
                  <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>Stage</th>
                  <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {detailLog.map((r, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #2a2a2a" }}>
                    <td style={{ padding: 8, fontWeight: 500 }}>
                      {r.oppId ? (
                        <a
                          href={`https://crestline.lightning.force.com/lightning/r/Opportunity/${r.oppId}/view`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "var(--teal)", textDecoration: "none" }}
                        >
                          {r.oppName}
                        </a>
                      ) : (
                        <span style={{ color: "#fff" }}>{r.oppName}</span>
                      )}
                    </td>
                    <td style={{ padding: 8, color: "#ddd" }}>{r.ae}</td>
                    <td style={{ padding: 8, color: "#ddd" }}>{r.sdr}</td>
                    <td style={{ textAlign: "right", padding: 8, color: "#fff", fontWeight: 600 }}>{fmtK(r.amount)}</td>
                    <td style={{ textAlign: "center", padding: 8, color: "#ddd" }}>{formatDate(r.qualSetDate)}</td>
                    <td style={{ textAlign: "center", padding: 8, color: "#ddd" }}>{r.stage || "—"}</td>
                    <td style={{ textAlign: "center", padding: 8 }}>
                      <span style={{
                        color: statusColors[r.status],
                        fontWeight: 600,
                        fontSize: 10,
                      }}>
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* 4.3 Rejection Log */}
      {rejectionLog.length > 0 && (
        <>
          <div style={{ fontSize: 12, fontWeight: 600, color: "#ff6b6b", marginBottom: 8 }}>
            Rejection Log
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ color: "#999", borderBottom: "1px solid #333" }}>
                  <th style={{ textAlign: "left", padding: 8, fontWeight: 500 }}>Opp Name</th>
                  <th style={{ textAlign: "left", padding: 8, fontWeight: 500 }}>AE</th>
                  <th style={{ textAlign: "left", padding: 8, fontWeight: 500 }}>SDR</th>
                  <th style={{ textAlign: "left", padding: 8, fontWeight: 500 }}>Reason</th>
                  <th style={{ textAlign: "left", padding: 8, fontWeight: 500 }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {rejectionLog.map((r, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #2a2a2a" }}>
                    <td style={{ padding: 8, color: "#fff", fontWeight: 500, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.oppName}</td>
                    <td style={{ padding: 8, color: "#ddd" }}>{r.ae}</td>
                    <td style={{ padding: 8, color: "#ddd" }}>{r.sdr}</td>
                    <td style={{ padding: 8, color: "#ff6b6b" }}>{r.rejectionReason}</td>
                    <td style={{ padding: 8, color: "#bbb", maxWidth: 250, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.notes || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {rejectionLog.length === 0 && (
        <div style={{ fontSize: 11, color: "#999", fontStyle: "italic" }}>
          No rejections this week.
        </div>
      )}
    </div>
  );
}
