"use client";

import { SdrPerformanceState } from "@/lib/types-sdr";
import SdrKpiCards from "./sdr-kpi-cards";
import SdrHeatmap from "./sdr-heatmap";
import SdrRepTable from "./sdr-rep-table";
import SdrFunnel from "./sdr-funnel";
import SdrMonthlyAttainmentBar from "./sdr-monthly-attainment";

export default function SdrPerformance({ data }: { data: SdrPerformanceState }) {
  return (
    <>
      {/* MONTHLY ATTAINMENT BAR */}
      <SdrMonthlyAttainmentBar data={data.monthlyAttainment} />

      {/* SOURCE CONTEXT BANNER */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 12px",
          background: "#111",
          borderRadius: 6,
          marginBottom: 16,
          border: "1px solid #1a1a1a",
        }}
      >
        <div
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            background: "var(--green)",
          }}
        />
        <span style={{ fontSize: 11, color: "#888" }}>
          Showing{" "}
          <span style={{ color: "#fff", fontWeight: 600 }}>all sources</span>{" "}
          attributed by SDR Owner — SAO counts may differ from the SDR Outbound
          line on Weekly Lookback, as SDRs also work inbound and event leads
        </span>
      </div>

      {/* EXECUTIVE SUMMARY */}
      <div
        style={{
          padding: "12px 0 16px",
          borderBottom: "1px solid #1a1a1a",
          marginBottom: 16,
        }}
      >
        <div
          style={{
            fontSize: 10,
            color: "#666",
            textTransform: "uppercase",
            letterSpacing: 1,
            marginBottom: 8,
          }}
        >
          Executive Summary — {data.focusWeekLabel}
        </div>
        <div
          style={{ fontSize: 13, color: "#ccc", lineHeight: 1.7 }}
          dangerouslySetInnerHTML={{ __html: data.execSummary }}
        />
      </div>

      {/* KPI CARDS */}
      <SdrKpiCards data={data.kpiCards} />

      {/* HEATMAP */}
      <SdrHeatmap data={data.heatmap} />

      {/* REP DETAIL TABLE */}
      <SdrRepTable data={data.repDetail} />

      {/* CONVERSION FUNNEL */}
      <SdrFunnel data={data.funnel} />
    </>
  );
}
