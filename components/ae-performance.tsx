"use client";

import { useState, useMemo } from "react";
import type { AePerformanceState, AeMatrixRow, AeDrillDownOpp } from "@/lib/types-ae-performance";
import type { SegmentKey } from "@/lib/types";
import { AE_PERFORMANCE_CONFIG } from "@/lib/config";
import AePerformanceMatrix, { type AeMatrixColumn } from "./ae-performance-matrix";
import AePerformanceDealList from "./ae-performance-deal-list";

function SectionMeta({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, color: "var(--muted)", margin: "-4px 0 12px", letterSpacing: 0.2 }}>
      {children}
    </div>
  );
}

const SEGMENT_LABELS: Record<SegmentKey, string> = {
  all: "All",
  mm: "MidMarket",
  ent: "Enterprise",
};

const STALE_PILLS: ReadonlyArray<7 | 14 | 30> = [7, 14, 30] as const;

interface DrillFilter {
  ae?: string;
  metric?: string;
  section?: "inbound" | "event" | "qualified" | "self-set";
  thresholdDays?: 7 | 14 | 30;
}

export default function AePerformance({ data }: { data: AePerformanceState }) {
  const [segment, setSegment] = useState<SegmentKey>("all");
  const [staleThreshold, setStaleThreshold] = useState<7 | 14 | 30>(14);
  const [drillFilter, setDrillFilter] = useState<DrillFilter>({});

  // Filtered drill-down list — driven by both the cell-click filter AND the segment toggle
  const filteredDrillDown = useMemo(() => {
    return data.drillDownOpps.filter((opp) => {
      if (segment === "mm" && opp.segment !== "MM") return false;
      if (segment === "ent" && opp.segment !== "ENT") return false;
      if (drillFilter.ae && opp.ae !== drillFilter.ae) return false;
      if (drillFilter.section || drillFilter.metric || drillFilter.thresholdDays !== undefined) {
        const matches = opp.appearsIn.some(
          (tag) =>
            (!drillFilter.section || tag.section === drillFilter.section) &&
            (!drillFilter.metric || tag.metric === drillFilter.metric) &&
            (drillFilter.thresholdDays === undefined || tag.thresholdDays === drillFilter.thresholdDays)
        );
        if (!matches) return false;
      }
      return true;
    });
  }, [data.drillDownOpps, segment, drillFilter]);

  const SECTION1_COLUMNS: readonly AeMatrixColumn[] = [
    { metricKey: "oppCount",       label: "# Opps",           tooltip: "Total opps in the rolling 30-day cohort for this AE — the dataset the metrics to the right are computed against." },
    { metricKey: "pctWithinSla",   label: "% Within First-Touch SLA", tooltip: "% of opps whose first activity (LastActivityDate) landed within 48 hours of opp creation. Format: % (touched-in-SLA / total). Untouched opps within the 48h window are excluded (insufficient data); untouched opps past 48h count as failures." },
    { metricKey: "medianTtfHours", label: "Median First Touch", tooltip: "Median time from opp creation to first activity (LastActivityDate). Diagnostic only — not color-coded. Includes both successes and failures so it captures actual cadence." },
    { metricKey: "staleCount",     label: "# Stale",          tooltip: "Qualification-stage opps with no activity in 7+ days. Counts opps that were never touched relative to their created date." },
    { metricKey: "pctAdvanced",    label: "% Advanced (7d+)", tooltip: "% of opps created 7+ days ago that have moved past Qualification stage. Format: % (advanced/eligible). Recently-created opps (< 7d old) are excluded — they haven't had time to advance, so the denominator may be smaller than the # Opps column." },
  ];

  const QUALIFIED_COLUMNS: readonly AeMatrixColumn[] = [
    { metricKey: "totalOpen",  label: "# Open",   tooltip: "Total open pipeline opps for this AE (Discovery+, excludes Closed Won and Closed Lost) — the dataset the staleness metrics are computed against." },
    { metricKey: "staleCount", label: "# Stale",  tooltip: "Open opps with no activity in the last N days (set by the pill above)." },
    { metricKey: "pctStale",   label: "% Stale",  tooltip: "% of open pipeline that is stale at the selected threshold. Format: % (stale/open)." },
  ];

  const SELF_SET_COLUMNS: readonly AeMatrixColumn[] = [
    { metricKey: "selfSetMtd", label: "Self-sets MTD", tooltip: "Count of AE self-set discoveries created in the current calendar month." },
    { metricKey: "vsTarget",   label: "vs Target",     tooltip: `Self-sets MTD minus the 3/month target. Positive = on or above pace, negative = below pace.` },
  ];

  const rowSegmentFilter = (rows: readonly AeMatrixRow[]): AeMatrixRow[] =>
    rows.filter((r) => {
      if (segment === "mm") return r.segment === "MM";
      if (segment === "ent") return r.segment === "ENT";
      return true;
    });

  // Per-section AE→opps maps for inline expansion. An opp belongs in a section's
  // map iff it has at least one tag with that section.
  const oppsByAeBySection = useMemo(() => {
    const sections: Record<"inbound" | "event" | "qualified" | "self-set", Record<string, AeDrillDownOpp[]>> = {
      inbound: {},
      event: {},
      qualified: {},
      "self-set": {},
    };
    for (const opp of data.drillDownOpps) {
      const seenSections = new Set<string>();
      for (const tag of opp.appearsIn) {
        if (seenSections.has(tag.section)) continue;
        seenSections.add(tag.section);
        if (!sections[tag.section][opp.ae]) sections[tag.section][opp.ae] = [];
        sections[tag.section][opp.ae].push(opp);
      }
    }
    return sections;
  }, [data.drillDownOpps]);

  return (
    <>
      {/* SEGMENT TOGGLE — filters AE rows by team membership */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "10px 0",
          borderBottom: "1px solid var(--border)",
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>
          Team
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
          Filters AE rows by team membership (not opp segmentation)
        </span>
      </div>

      {/* SECTION 1 — INBOUND & EVENT FOLLOW-UP */}
      <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3, color: "var(--text)", margin: "22px 0 8px" }}>
        Inbound &amp; Event Follow-Up
      </h2>
      <SectionMeta>
        Cohort: <strong style={{ color: "var(--text)" }}>all Inbound/Event opps created in the last {AE_PERFORMANCE_CONFIG.cohortRollingDays} days</strong>, regardless of current stage.
        <br />
        SLA: <strong style={{ color: "var(--text)" }}>{AE_PERFORMANCE_CONFIG.inboundSlaHours}h</strong> to first touch
        {" · "}# Stale filters to <strong style={{ color: "var(--text)" }}>still-in-Qualification</strong> opps with <strong style={{ color: "var(--text)" }}>{AE_PERFORMANCE_CONFIG.qualificationStaleDays}+ days</strong> no activity
        {" · "}% Advanced eligibility: opps created <strong style={{ color: "var(--text)" }}>{AE_PERFORMANCE_CONFIG.advanceOutWindowDays}+ days ago</strong>
      </SectionMeta>
      {data.qualificationDataAvailable ? (
        <>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: "12px 0 6px" }}>Inbound</h3>
          <AePerformanceMatrix
            columns={SECTION1_COLUMNS}
            rows={rowSegmentFilter(data.inboundRows)}
            section="inbound"
            onCellClick={({ ae, metric }) => setDrillFilter({ ae, metric, section: "inbound" })}
            onHeaderClick={({ metric }) => setDrillFilter({ section: "inbound", metric })}
            oppsByAe={oppsByAeBySection.inbound}
          />
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "var(--text)", margin: "16px 0 6px" }}>Event</h3>
          <AePerformanceMatrix
            columns={SECTION1_COLUMNS}
            rows={rowSegmentFilter(data.eventRows)}
            section="event"
            onCellClick={({ ae, metric }) => setDrillFilter({ ae, metric, section: "event" })}
            onHeaderClick={({ metric }) => setDrillFilter({ section: "event", metric })}
            oppsByAe={oppsByAeBySection.event}
          />
        </>
      ) : (
        <div
          style={{
            padding: "16px 20px",
            background: "rgba(245, 158, 11, 0.08)",
            border: "1px solid rgba(245, 158, 11, 0.3)",
            borderRadius: 6,
            color: "var(--yellow)",
            fontSize: 12,
            lineHeight: 1.5,
          }}
        >
          <strong>Section 1 not yet wired.</strong>{" "}
          Qualification-stage opps require a new <code>qualification</code> tab in the master Google Sheet (Coefficient sync from SFDC). Vincent owns adding it. Once wired, this section will populate automatically.
        </div>
      )}

      {/* SECTION 2 — QUALIFIED */}
      <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3, color: "var(--text)", margin: "22px 0 8px" }}>
        Qualified Pipeline Staleness
      </h2>
      <SectionMeta>
        Staleness: <strong style={{ color: "var(--text)" }}>{staleThreshold}+ days</strong> no activity on open pipeline (Discovery+, excludes Closed Won/Lost). Use the pills below to switch threshold.
      </SectionMeta>
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {STALE_PILLS.map((d) => {
          const active = staleThreshold === d;
          return (
            <button
              key={d}
              onClick={() => setStaleThreshold(d)}
              style={{
                padding: "4px 10px",
                fontSize: 11,
                fontWeight: active ? 700 : 500,
                background: active ? "var(--teal)" : "transparent",
                color: active ? "#0b0b0b" : "var(--text)",
                border: "1px solid var(--border)",
                borderRadius: 4,
                cursor: "pointer",
              }}
            >
              {d}d
            </button>
          );
        })}
      </div>
      <AePerformanceMatrix
        columns={QUALIFIED_COLUMNS}
        rows={rowSegmentFilter(data.qualifiedRowsByThreshold[staleThreshold])}
        section="qualified"
        onCellClick={({ ae, metric }) => setDrillFilter({ ae, metric, section: "qualified", thresholdDays: staleThreshold })}
        onHeaderClick={({ metric }) => setDrillFilter({ section: "qualified", metric, thresholdDays: staleThreshold })}
        oppsByAe={oppsByAeBySection.qualified}
        showSourceColumn
      />

      {/* SECTION 3 — SELF-SET */}
      <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3, color: "var(--text)", margin: "22px 0 8px" }}>
        Self-Set Volume (MTD)
      </h2>
      <SectionMeta>
        Target: <strong style={{ color: "var(--text)" }}>{AE_PERFORMANCE_CONFIG.selfSetMonthlyTarget} self-sets</strong> per AE per month. Counts AE-set discoveries created in the current calendar month.
      </SectionMeta>
      <AePerformanceMatrix
        columns={SELF_SET_COLUMNS}
        rows={rowSegmentFilter(data.selfSetRows)}
        section="self-set"
        onCellClick={({ ae, metric }) => setDrillFilter({ ae, metric, section: "self-set" })}
        onHeaderClick={({ metric }) => setDrillFilter({ section: "self-set", metric })}
        oppsByAe={oppsByAeBySection["self-set"]}
      />

      {/* DRILL-DOWN */}
      <h2 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.3, color: "var(--text)", margin: "22px 0 8px" }}>
        Drill-Down ({filteredDrillDown.length} {filteredDrillDown.length === 1 ? "opp" : "opps"})
      </h2>
      {(drillFilter.ae || drillFilter.section || drillFilter.metric) && (
        <button
          onClick={() => setDrillFilter({})}
          style={{
            fontSize: 11,
            color: "var(--teal)",
            background: "none",
            border: "1px solid var(--border)",
            borderRadius: 4,
            padding: "3px 8px",
            cursor: "pointer",
            marginBottom: 8,
          }}
        >
          Clear matrix filter
        </button>
      )}
      <AePerformanceDealList opps={filteredDrillDown} />

      <div style={{ fontSize: 9, color: "#555", marginTop: 24, fontStyle: "italic" }}>
        Generated: {data.generatedAt}
      </div>
    </>
  );
}
