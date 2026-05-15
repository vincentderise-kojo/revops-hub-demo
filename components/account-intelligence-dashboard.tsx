"use client";

import { useState, useMemo } from "react";
import {
  AccountIntelligenceData,
  EnrHeroStats,
  TopCustomersHeroStats,
  UpsellHeroStats,
} from "@/lib/types-account-intelligence";
import {
  computeEnrHeroStats,
  computeTopCustomersHeroStats,
} from "@/lib/process-account-intelligence";
import { fmtK } from "@/lib/format";
import EnrView from "./enr-view";
import TopCustomersView from "./top-customers-view";
import AccountMethodology from "./account-methodology";
import UpsellSignalsView from "./upsell-signals-view";

type Tab = "enr" | "customers" | "upsell" | "methodology";

interface Props {
  data: AccountIntelligenceData;
}

export default function AccountIntelligenceDashboard({ data }: Props) {
  const [tab, setTab] = useState<Tab>("enr");

  const enrStats = useMemo(() => computeEnrHeroStats(data.enrMatches), [data.enrMatches]);
  const customerStats = useMemo(
    () => computeTopCustomersHeroStats(data.families),
    [data.families]
  );
  // Upsell hero stats are computed inside UpsellSignalsView so they reflect active filters.

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        color: "var(--text)",
      }}
    >
      {/* Header */}
      <div
        style={{
          background: "var(--charcoal)",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <a
            href="/hub"
            style={{
              color: "var(--muted)",
              textDecoration: "none",
              fontSize: 12,
            }}
          >
            ← Hub
          </a>
          <h1 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
            Account Intelligence
          </h1>
        </div>
        <div style={{ fontSize: 10, color: "var(--muted)" }}>
          {data.dataSourceLabel}
        </div>
      </div>

      {/* Tab Bar */}
      <div
        style={{
          padding: "0 24px",
          borderBottom: "1px solid var(--border)",
          display: "flex",
          gap: 0,
        }}
      >
        {(
          [
            { key: "enr", label: "ENR Top 600" },
            { key: "customers", label: "Top Customers" },
            { key: "upsell", label: "Upsell Signals" },
            { key: "methodology", label: "Methodology" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            className={`tab-btn ${tab === t.key ? "active" : ""}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Hero Stats — Upsell tab renders its own hero inside the view so it reflects active filters */}
      <div style={{ padding: "16px 24px 0" }}>
        {tab === "enr" && <EnrHeroStatsBar stats={enrStats} />}
        {tab === "customers" && <CustomerHeroStatsBar stats={customerStats} />}
      </div>

      {/* Tab Content */}
      <div style={{ padding: "16px 24px 40px" }}>
        {tab === "enr" && <EnrView data={data} />}
        {tab === "customers" && <TopCustomersView data={data} />}
        {tab === "upsell" && <UpsellSignalsView data={data} />}
        {tab === "methodology" && <AccountMethodology />}
      </div>
    </div>
  );
}

// ── Hero Stat Bars ──

function EnrHeroStatsBar({ stats }: { stats: EnrHeroStats }) {
  const items = [
    { label: "Kojo Customers", value: `${stats.kojoCustomers} of 600` },
    { label: "Active Opps", value: String(stats.activeOpps) },
    { label: "Not in SFDC", value: String(stats.notInSfdc) },
    { label: "ENR Customer ARR", value: fmtK(stats.enrCustomerArr) },
    {
      label: "Revenue Accuracy",
      value: `${Math.round(stats.revenueAccuracyPct * 100)}%`,
    },
    {
      label: "ENR Tagged",
      value: `${stats.enrTaggedCount} / ${stats.enrMatchedCount}`,
    },
    {
      label: "Market Penetration",
      value: `${(stats.marketPenetrationPct * 100).toFixed(1)}%`,
    },
    { label: "Former Customers", value: String(stats.formerCustomers) },
  ];

  return <HeroStatGrid items={items} />;
}

function CustomerHeroStatsBar({ stats }: { stats: TopCustomersHeroStats }) {
  const items = [
    { label: "Total Customer ARR", value: fmtK(stats.totalCustomerArr) },
    { label: "Customer Families", value: String(stats.customerFamilies) },
    {
      label: "Top 10 Concentration",
      value: `${Math.round(stats.top10ConcentrationPct * 100)}%`,
    },
    { label: "ENR-Listed", value: String(stats.enrListedCount) },
    { label: "Avg Family ARR", value: fmtK(stats.avgFamilyArr) },
    {
      label: "Multi-Account Families",
      value: String(stats.multiAccountFamilies),
    },
    { label: "Proxy Revenue", value: String(stats.proxyRevenueCount) },
    { label: "States Covered", value: String(stats.statesCovered) },
  ];

  return <HeroStatGrid items={items} />;
}

export function UpsellHeroStatsBar({ stats }: { stats: UpsellHeroStats }) {
  const items = [
    { label: "Customers Analyzed", value: String(stats.totalCustomersAnalyzed) },
    { label: "Strong Signals", value: String(stats.strongSignalCount) },
    { label: "Moderate Signals", value: String(stats.moderateSignalCount) },
    { label: "ARR w/ Strong Signal", value: fmtK(stats.arrWithStrongSignal) },
    {
      label: "Avg Discount",
      value: stats.avgDiscountPct !== null
        ? `${Math.round(stats.avgDiscountPct * 100)}%`
        : "—",
    },
    { label: "Sub-Annual Billing", value: String(stats.subAnnualCount) },
    { label: "Size Corrections", value: String(stats.sizeCorrections) },
    { label: "Data Gaps", value: String(stats.dataGapCount) },
  ];

  return <HeroStatGrid items={items} />;
}

export function HeroStatGrid({
  items,
}: {
  items: { label: string; value: string }[];
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 10,
        marginBottom: 8,
      }}
    >
      {items.map((item) => (
        <div
          key={item.label}
          style={{
            background: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            padding: "10px 12px",
          }}
        >
          <div
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              color: "var(--muted)",
              marginBottom: 4,
            }}
          >
            {item.label}
          </div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
