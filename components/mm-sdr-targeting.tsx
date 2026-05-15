"use client";

import { TargetingState } from "@/lib/types-mm-sdr";

function InfoTip({ text }: { text: string }) {
  return (
    <span
      title={text}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: 14,
        height: 14,
        borderRadius: "50%",
        border: "1px solid #555",
        fontSize: 9,
        color: "#999",
        cursor: "help",
        marginLeft: 4,
        verticalAlign: "middle",
      }}
    >
      ?
    </span>
  );
}

export default function MmSdrTargeting({ data }: { data: TargetingState }) {
  const { rows, teamTotal } = data;

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: "#fff", marginBottom: 10 }}>
        Account Targeting Coverage
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ color: "#999", borderBottom: "1px solid #333" }}>
              <th style={{ textAlign: "left", padding: 8, fontWeight: 500 }}>SDR</th>
              <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>Accts Touched</th>
              <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>Avg Contacts/Acct</th>
              <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>1 Contact Only</th>
              <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>3+ Contacts</th>
              <th style={{ textAlign: "center", padding: 8, fontWeight: 500 }}>
                No Activity 30d
                <InfoTip text="Accounts this SDR has called in FY26 but not in the last 30 days. Baseline is current fiscal year call history — accounts never called won't appear." />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sdrName} style={{ borderTop: "1px solid #2a2a2a" }}>
                <td style={{ padding: 8, color: "#fff", fontWeight: 500 }}>{r.sdrName}</td>
                <td style={{ textAlign: "center", padding: 8, color: "#ddd" }}>{r.uniqueAccountsTouched}</td>
                <td style={{ textAlign: "center", padding: 8, color: r.avgContactsPerAccount >= 2 ? "var(--green)" : r.avgContactsPerAccount >= 1.5 ? "var(--brand-yellow)" : "#ff6b6b", fontWeight: 600 }}>
                  {r.avgContactsPerAccount}
                </td>
                <td style={{ textAlign: "center", padding: 8, color: r.accountsWith1Contact > 0 ? "var(--brand-yellow)" : "#ccc" }}>
                  {r.accountsWith1Contact}
                </td>
                <td style={{ textAlign: "center", padding: 8, color: r.accountsWith3PlusContacts > 0 ? "var(--green)" : "#ccc" }}>
                  {r.accountsWith3PlusContacts}
                </td>
                <td style={{ textAlign: "center", padding: 8, color: r.accountsNoActivity30d > 5 ? "#ff6b6b" : "#ccc" }}>
                  {r.accountsNoActivity30d}
                </td>
              </tr>
            ))}
            {/* Team Total */}
            <tr style={{ borderTop: "2px solid #444", background: "#0d0d0d" }}>
              <td style={{ padding: 8, color: "#fff", fontWeight: 700 }}>Team Total</td>
              <td style={{ textAlign: "center", padding: 8, color: "#fff", fontWeight: 700 }}>{teamTotal.uniqueAccountsTouched}</td>
              <td style={{ textAlign: "center", padding: 8, color: "#fff", fontWeight: 700 }}>{teamTotal.avgContactsPerAccount}</td>
              <td style={{ textAlign: "center", padding: 8, color: "#fff", fontWeight: 700 }}>{teamTotal.accountsWith1Contact}</td>
              <td style={{ textAlign: "center", padding: 8, color: "#fff", fontWeight: 700 }}>{teamTotal.accountsWith3PlusContacts}</td>
              <td style={{ textAlign: "center", padding: 8, color: "#fff", fontWeight: 700 }}>{teamTotal.accountsNoActivity30d}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div style={{ padding: "8px 8px 0", fontSize: 10, color: "#999" }}>
        &ldquo;No Activity 30d&rdquo; = accounts with historical call activity but no calls in the last 30 days.
        Accounts with only 1 contact are a targeting risk — flag for multi-threading.
      </div>
    </div>
  );
}
