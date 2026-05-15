"use client";

import { useMemo, useState } from "react";
import { SegmentedDashboardState, SegmentKey, DealInsightRequest, DealRow, InspectionCache } from "@/lib/types";
import { SdrPerformanceState } from "@/lib/types-sdr";
import AePerformance from "./ae-performance";
import type { AePerformanceState } from "@/lib/types-ae-performance";
import { GROUP_KEYS, type GroupKey } from "@/lib/config";
import { fmtK } from "@/lib/format";
import { computeMtdHeadline } from "@/lib/mtd-headline";
import ExecSummary from "./exec-summary";
import Scoreboard from "./scoreboard";
import PacingSection from "./pacing-section";
import MtdTracker from "./mtd-tracker";
import DealList from "./deal-list";
import Methodology from "./methodology";
import SdrPerformance from "./sdr-performance";
import ExportButton from "./export-button";
import DealInsightPanel from "./deal-insight-panel";

interface DashboardProps {
  data: SegmentedDashboardState;
  sdrData?: SdrPerformanceState;
  aePerformance: AePerformanceState;
  inspections: InspectionCache;
}

const SEGMENT_LABELS: Record<SegmentKey, string> = {
  all: "All",
  mm: "MidMarket",
  ent: "Enterprise",
};

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        fontSize: 22,
        fontWeight: 800,
        letterSpacing: -0.3,
        color: "var(--text)",
        margin: "22px 0 8px",
      }}
    >
      {children}
    </h2>
  );
}

export default function Dashboard({ data, sdrData, aePerformance, inspections }: DashboardProps) {
  const [view, setView] = useState<"lookback" | "ae" | "sdr" | "method">("lookback");
  const [segment, setSegment] = useState<SegmentKey>("all");
  const [activeGroups, setActiveGroups] = useState<Set<GroupKey>>(
    () => new Set(GROUP_KEYS)
  );
  const [selectedDeal, setSelectedDeal] = useState<DealInsightRequest | null>(null);

  function toggleGroup(g: GroupKey) {
    setActiveGroups((prev) => {
      const next = new Set(prev);
      if (next.has(g)) {
        if (next.size === 1) return prev; // never empty
        next.delete(g);
      } else {
        next.add(g);
      }
      return next;
    });
  }

  function soloGroup(g: GroupKey) {
    setActiveGroups(new Set([g]));
  }

  function resetGroups() {
    setActiveGroups(new Set(GROUP_KEYS));
  }

  // Segment toggle picks which pre-computed DashboardState to render.
  const segmentData = data[segment];

  const mtdHeadline = useMemo(
    () => computeMtdHeadline(activeGroups, segmentData.mtd.current),
    [activeGroups, segmentData.mtd.current]
  );

  const blended = segmentData.scoreboard.blended;
  const pctHit = blended ? Math.round(blended.pctHit) : 0;
  const gapAbs = blended ? Math.abs(blended.gap) : 0;
  const badgeClass = blended?.status === "green" ? "badge badge-green" :
                     blended?.status === "yellow" ? "badge badge-yellow" :
                     "badge badge-red";

  const latestDisco = segmentData.latestDiscoveryDate
    ? new Date(segmentData.latestDiscoveryDate).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;
  const refreshedAt = segmentData.renderedAt
    ? new Date(segmentData.renderedAt).toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
      }) + " ET"
    : null;

  return (
    <>
      {segmentData.meta?.showRolloverBanner && (
        <div style={{
          background: "rgba(245, 158, 11, 0.08)",
          borderBottom: "1px solid rgba(245, 158, 11, 0.3)",
          padding: "8px 20px",
          fontSize: 11,
          color: "var(--yellow)",
          fontWeight: 600,
          letterSpacing: 0.3,
        }}>
          ⚠ {segmentData.meta.nextUnloadedMonthKey?.startsWith("2026-07") ? "Q3'26" : "Next quarter"} board goals not loaded
          — update <code>lib/config.ts</code> before the quarter starts.
        </div>
      )}

      {/* KOJO HEADER BAR */}
      <div className="kojo-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a
            href="/hub"
            style={{
              fontSize: 15,
              fontWeight: 800,
              color: "#FFE500",
              letterSpacing: 1.5,
              textDecoration: "none",
            }}
          >
            KOJO
          </a>
          <span
            style={{
              width: 1,
              height: 16,
              background: "#555",
              display: "inline-block",
            }}
          />
          <a
            href="/hub"
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--text)",
              textDecoration: "none",
            }}
          >
            RevOps Hub
          </a>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {(latestDisco || refreshedAt) && (
            <span
              style={{
                fontSize: 10,
                color: "#777",
                letterSpacing: 0.3,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                lineHeight: 1.3,
              }}
            >
              {latestDisco && <span>Latest disco: {latestDisco}</span>}
              {refreshedAt && <span>Refreshed: {refreshedAt}</span>}
            </span>
          )}
          <ExportButton slug="pipeline-pulse" />
        </div>
      </div>

      {/* APP HEADER */}
      <div
        style={{
          padding: "16px 20px 0",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            marginBottom: 10,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                background: "var(--kojo-yellow)",
                boxShadow: "0 0 8px #FFE50088",
              }}
            />
            <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5 }}>
              Pipeline Pulse
            </span>
            <span
              style={{ fontSize: 11, color: "var(--muted)", marginLeft: 4 }}
            >
              Source-Adjusted Coverage
            </span>
          </div>
          {view === "lookback" && (
            <div style={{ display: "flex", gap: 6 }}>
              <div className={badgeClass}>{pctHit}% TO WEEKLY GOAL</div>
              <div className={badgeClass}>
                WEEKLY GAP: {fmtK(gapAbs)}
              </div>
              {(() => {
                const mtdGap = mtdHeadline.filteredGapToTarget;
                const mtdAboveGoal = mtdGap <= 0;
                return (
                  <div className={mtdAboveGoal ? "badge badge-green" : "badge badge-red"}>
                    MTD: {mtdAboveGoal ? `+${fmtK(Math.abs(mtdGap))} PAST GOAL` : `${fmtK(mtdGap)} TO GO`}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
        <div>
          <button
            className={`tab-btn ${view === "lookback" ? "active" : ""}`}
            onClick={() => setView("lookback")}
          >
            Weekly Lookback
          </button>
          <button
            className={`tab-btn ${view === "ae" ? "active" : ""}`}
            onClick={() => setView("ae")}
          >
            AE Performance
          </button>
          <button
            className={`tab-btn ${view === "sdr" ? "active" : ""}`}
            onClick={() => setView("sdr")}
          >
            SDR Performance
          </button>
          <button
            className={`tab-btn ${view === "method" ? "active" : ""}`}
            onClick={() => setView("method")}
          >
            Sources &amp; Methodology
          </button>
        </div>
      </div>

      {/* SEGMENT TOGGLE — applies to every module on the Weekly Lookback tab */}
      {view === "lookback" && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "10px 20px",
            borderBottom: "1px solid var(--border)",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <span
            style={{
              fontSize: 10,
              color: "var(--muted)",
              textTransform: "uppercase",
              letterSpacing: 0.8,
              fontWeight: 600,
            }}
          >
            Segment
          </span>
          <div style={{ display: "flex", gap: 0, border: "1px solid var(--border)", borderRadius: 6, overflow: "hidden" }}>
            {(["all", "mm", "ent"] as SegmentKey[]).map((s, i) => {
              const active = segment === s;
              return (
                <button
                  key={s}
                  onClick={() => setSegment(s)}
                  style={{
                    padding: "4px 12px",
                    fontSize: 11,
                    fontWeight: active ? 700 : 500,
                    background: active ? "var(--teal)" : "transparent",
                    color: active ? "#0b0b0b" : "var(--text)",
                    border: "none",
                    borderLeft: i === 0 ? "none" : "1px solid var(--border)",
                    cursor: active ? "default" : "pointer",
                    fontFamily: "inherit",
                    letterSpacing: 0.3,
                  }}
                >
                  {SEGMENT_LABELS[s]}
                </button>
              );
            })}
          </div>
          <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: 4 }}>
            {segment === "all"
              ? "Full board plan"
              : `${SEGMENT_LABELS[segment]} slice of the board plan — targets scaled by segment quota share`}
          </span>
        </div>
      )}

      {/* CONTENT */}
      <div
        style={{ padding: 16, maxWidth: 960, margin: "0 auto" }}
      >
        {view === "lookback" && (
          <>
            <SectionTitle>Executive Summary</SectionTitle>
            <ExecSummary data={segmentData} />
            {segmentData.coverageDiagnostic && (
              <a
                href="#methodology"
                onClick={(e) => { e.preventDefault(); setView("method"); }}
                style={{
                  display: "block",
                  fontSize: 10,
                  color: "var(--muted)",
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  textAlign: "right",
                  marginBottom: 6,
                  textDecoration: "none",
                  cursor: "pointer",
                }}
              >
                Implied Q2 coverage: <strong style={{ color: "var(--teal)" }}>{segmentData.coverageDiagnostic.impliedQ2Avg.toFixed(2)}×</strong>
                {" "}avg · <strong style={{ color: "var(--muted)" }}>{segmentData.coverageDiagnostic.historicalBaseline.toFixed(1)}×</strong> historical baseline
                {" "}<span style={{ opacity: 0.6 }}>(ⓘ details)</span>
              </a>
            )}
            <SectionTitle>Weekly Pipeline Creation</SectionTitle>
            <Scoreboard
              data={segmentData}
              activeGroups={activeGroups}
              onSolo={soloGroup}
              onReset={resetGroups}
            />
            <SectionTitle>Month-to-Date Pipeline Creation</SectionTitle>
            <MtdTracker
              data={segmentData}
              activeGroups={activeGroups}
              onToggleGroup={toggleGroup}
            />
            <SectionTitle>Q2&apos;26 Pacing</SectionTitle>
            <PacingSection data={segmentData} />
            <DealList
              data={segmentData}
              activeGroups={activeGroups}
              onToggleGroup={toggleGroup}
              inspections={inspections}
              onInspect={(d: DealRow) =>
                setSelectedDeal({
                  oppId: d.oppId,
                  oppName: d.name,
                  accountName: d.name,         // DealRow lacks accountName; opp name is the closest match for Pulse
                  owner: d.owner,
                  amount: d.amount,
                  stage: d.stage,
                  closeDate: "",               // Pulse data doesn't surface close date in DealRow
                  discoveryDate: d.discoveryDateIso.slice(0, 10),
                  inactiveDays: null,
                  segment: d.segment,
                  annualRevenue: 0,
                })
              }
            />
          </>
        )}
        {view === "ae" && <AePerformance data={aePerformance} />}
        {view === "sdr" && sdrData && <SdrPerformance data={sdrData} />}
        {view === "method" && <Methodology data={data.all} />}
      </div>

      {selectedDeal && (
        <DealInsightPanel
          deal={selectedDeal}
          inspections={inspections}
          onClose={() => setSelectedDeal(null)}
        />
      )}
    </>
  );
}
