"use client";

import { SdrMonthlyAttainment } from "@/lib/types-sdr";

export default function SdrMonthlyAttainmentBar({ data }: { data: SdrMonthlyAttainment }) {
  const pct = Math.max(0, Math.min(100, data.attainmentPercent));
  const pctLabel = `${pct.toFixed(1)}%`;

  return (
    <div
      style={{
        background: "#111",
        border: "1px solid #1a1a1a",
        borderRadius: 6,
        padding: "14px 16px",
        marginBottom: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: "#666",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          Riley · {data.monthLabel} Attainment
        </div>
        <div style={{ fontSize: 11, color: "#888" }}>
          <span style={{ color: "#fff", fontWeight: 600 }}>{data.totalSaos.toFixed(2)}</span>
          {" / "}
          <span style={{ color: "#fff", fontWeight: 600 }}>{data.totalQuota}</span>
          {" SAO points"}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div
          style={{
            fontSize: 28,
            fontWeight: 700,
            color: "#fff",
            fontVariantNumeric: "tabular-nums",
            minWidth: 84,
          }}
        >
          {pctLabel}
        </div>
        <div
          style={{
            flex: 1,
            height: 10,
            background: "#1a1a1a",
            borderRadius: 5,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: "var(--teal)",
              transition: "width 200ms ease",
            }}
          />
        </div>
      </div>
    </div>
  );
}
