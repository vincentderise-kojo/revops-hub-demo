"use client";

import { fmtK } from "@/lib/format";

interface KpiData {
  saosThisWeek: number;
  saosWow: number;
  pipelineThisWeek: number;
  pipelineWow: number;
  meetingsThisWeek: number;
  meetingsWow: number;
  conversionRate: number;
  conversionWow: number;
}

function TrendArrow({ value, format }: { value: number; format: "number" | "dollar" | "pct" }) {
  const isPositive = value >= 0;
  const color = isPositive ? "var(--green)" : "var(--red)";
  const arrow = isPositive ? "↑" : "↓";
  let label: string;

  if (format === "dollar") {
    label = `${arrow} ${fmtK(Math.abs(value))} vs prior week`;
  } else if (format === "pct") {
    label = `${arrow} ${Math.abs(Math.round(value * 100))}pts vs prior week`;
  } else {
    const abs = Math.abs(value);
    const display = Number.isInteger(abs) ? abs.toString() : abs.toFixed(2);
    label = `${arrow} ${display} vs prior week`;
  }

  return <div style={{ fontSize: 11, color }}>{label}</div>;
}

export default function SdrKpiCards({ data }: { data: KpiData }) {
  const cards = [
    {
      label: "SAO Points Last Week",
      value: data.saosThisWeek.toFixed(2),
      trend: data.saosWow,
      format: "number" as const,
    },
    {
      label: "Pipeline $ Last Week",
      value: fmtK(data.pipelineThisWeek),
      format: "dollar" as const,
      trend: data.pipelineWow,
    },
    {
      label: "Meetings Set Last Week",
      value: String(data.meetingsThisWeek),
      format: "number" as const,
      trend: data.meetingsWow,
    },
    {
      label: "Conversion Rate Last Week",
      value: `${Math.round(data.conversionRate * 100)}%`,
      format: "pct" as const,
      trend: data.conversionWow,
      valueColor: "var(--brand-yellow)",
    },
  ];

  return (
    <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
      {cards.map((card) => (
        <div
          key={card.label}
          style={{
            flex: 1,
            background: "#111",
            border: "1px solid #222",
            borderRadius: 8,
            padding: 12,
          }}
        >
          <div
            style={{
              fontSize: 10,
              color: "#666",
              textTransform: "uppercase",
              letterSpacing: 0.5,
            }}
          >
            {card.label}
          </div>
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: "valueColor" in card && card.valueColor ? card.valueColor : "#fff",
              margin: "4px 0",
            }}
          >
            {card.value}
          </div>
          <TrendArrow value={card.trend} format={card.format} />
        </div>
      ))}
    </div>
  );
}
