"use client";

import { useMemo, useState } from "react";
import type { AeDrillDownOpp } from "@/lib/types-ae-performance";
import { sfdcOppUrl, AE_PERFORMANCE_CONFIG } from "@/lib/config";
import { fmtK } from "@/lib/format";

const MS_PER_HOUR = 1000 * 60 * 60;
const SLA_MS = AE_PERFORMANCE_CONFIG.inboundSlaHours * MS_PER_HOUR;

interface FirstTouchInfo {
  display: string;
  color: string;
  /** Whether this opp is in an SLA-tracked section (inbound or event). Non-SLA opps show hours but no color. */
  slaTracked: boolean;
}

function firstTouchInfo(opp: AeDrillDownOpp, nowMs: number): FirstTouchInfo {
  const slaTracked = opp.appearsIn.some((t) => t.section === "inbound" || t.section === "event");
  const createdMs = new Date(opp.createdDate).getTime();

  if (opp.lastActivityDate) {
    const lastMs = new Date(opp.lastActivityDate).getTime();
    const ttfHours = (lastMs - createdMs) / MS_PER_HOUR;
    const display = ttfHours < 24 ? `${ttfHours.toFixed(1)}h` : `${(ttfHours / 24).toFixed(1)}d`;
    if (!slaTracked) return { display, color: "var(--text)", slaTracked: false };
    return {
      display,
      color: lastMs - createdMs <= SLA_MS ? "var(--green)" : "var(--red)",
      slaTracked: true,
    };
  }

  // No first touch yet
  if (!slaTracked) return { display: "—", color: "var(--muted)", slaTracked: false };
  const ageMs = nowMs - createdMs;
  if (ageMs > SLA_MS) {
    return { display: "— (past SLA)", color: "var(--red)", slaTracked: true };
  }
  return { display: "— (pending)", color: "var(--muted)", slaTracked: true };
}

type SourceFilter = "all" | "Inbound" | "Events" | "AE Self-Set";
type SectionFilter = "all" | "unqualified" | "qualified";
type StatusFilter = "all" | "stale" | "withinSla" | "advanced";

interface Props {
  opps: readonly AeDrillDownOpp[];
}

export default function AePerformanceDealList({ opps }: Props) {
  const [source, setSource] = useState<SourceFilter>("all");
  const [section, setSection] = useState<SectionFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    return opps.filter((o) => {
      if (source !== "all" && o.source !== source) return false;
      if (section === "unqualified") {
        if (!o.appearsIn.some((t) => t.section === "inbound" || t.section === "event")) return false;
      } else if (section === "qualified") {
        if (!o.appearsIn.some((t) => t.section === "qualified" || t.section === "self-set")) return false;
      }
      if (status === "stale") {
        if (!o.appearsIn.some((t) => t.metric === "staleCount")) return false;
      } else if (status === "withinSla") {
        if (!o.appearsIn.some((t) => t.metric === "pctWithinSla")) return false;
      } else if (status === "advanced") {
        if (!o.appearsIn.some((t) => t.metric === "pctAdvanced")) return false;
      }
      return true;
    });
  }, [opps, source, section, status]);

  return (
    <div>
      {/* Filter pills */}
      <div style={{ display: "flex", gap: 12, marginBottom: 10, fontSize: 11 }}>
        <FilterGroup label="Source" value={source} setValue={setSource} options={[
          { v: "all", l: "All" },
          { v: "Inbound", l: "Inbound" },
          { v: "Events", l: "Events" },
          { v: "AE Self-Set", l: "Self-set" },
        ]} />
        <FilterGroup label="Section" value={section} setValue={setSection} options={[
          { v: "all", l: "All" },
          { v: "unqualified", l: "Unqualified" },
          { v: "qualified", l: "Qualified" },
        ]} />
        <FilterGroup label="Status" value={status} setValue={setStatus} options={[
          { v: "all", l: "All" },
          { v: "stale", l: "Stale" },
          { v: "withinSla", l: "Within SLA" },
          { v: "advanced", l: "Advanced" },
        ]} />
      </div>

      {filtered.length === 0 ? (
        <div style={{ fontSize: 11, color: "var(--muted)", padding: "12px 0" }}>No opps match the current filters.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <Th>Opp</Th>
              <Th>AE</Th>
              <Th>Source</Th>
              <Th>Stage</Th>
              <Th align="right">Created</Th>
              <Th align="right">Close Date</Th>
              <Th align="right" tooltip={`Hours from opp creation to first activity. Green = within ${AE_PERFORMANCE_CONFIG.inboundSlaHours}h SLA, red = past SLA. Only colored for Inbound + Event opps.`}>First Touch</Th>
              <Th align="right">Days Since Last Touch</Th>
              <Th align="right" tooltip="Days the opp has been in its current stage (from SFDC Stage Duration field).">Stage Duration</Th>
              <Th align="right">Amount</Th>
              <Th align="right">Annual Revenue</Th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => {
              const ft = firstTouchInfo(o, Date.now());
              return (
                <tr key={o.oppId} style={{ borderTop: "1px solid var(--border)" }}>
                  <td style={{ padding: "6px 10px" }}>
                    <a href={sfdcOppUrl(o.oppId)} target="_blank" rel="noreferrer" style={{ color: "var(--teal)", textDecoration: "none" }}>
                      {o.name || o.oppId}
                    </a>
                  </td>
                  <td style={{ padding: "6px 10px" }}>{o.ae}</td>
                  <td style={{ padding: "6px 10px" }}>{o.source}</td>
                  <td style={{ padding: "6px 10px" }}>{o.stage}</td>
                  <td style={{ padding: "6px 10px", textAlign: "right", color: "var(--muted)" }}>
                    {new Date(o.createdDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </td>
                  <td style={{ padding: "6px 10px", textAlign: "right", color: "var(--muted)" }}>
                    {o.closeDate ? new Date(o.closeDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—"}
                  </td>
                  <td style={{ padding: "6px 10px", textAlign: "right", color: ft.color, fontWeight: ft.slaTracked ? 600 : 400 }}>
                    {ft.display}
                  </td>
                  <td style={{ padding: "6px 10px", textAlign: "right", color: o.daysSinceLastActivity !== null && o.daysSinceLastActivity >= 7 ? "var(--red)" : "var(--text)" }}>
                    {o.daysSinceLastActivity ?? "—"}
                  </td>
                  <td style={{ padding: "6px 10px", textAlign: "right", color: "var(--muted)" }}>
                    {o.stageDurationDays ? `${Math.round(o.stageDurationDays)}d` : "—"}
                  </td>
                  <td style={{ padding: "6px 10px", textAlign: "right" }}>
                    ${Math.round(o.amount).toLocaleString()}
                  </td>
                  <td style={{ padding: "6px 10px", textAlign: "right", color: "var(--muted)" }}>
                    {o.annualRevenue ? fmtK(o.annualRevenue) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Th({ children, align = "left", tooltip }: { children: React.ReactNode; align?: "left" | "right"; tooltip?: string }) {
  return (
    <th
      title={tooltip}
      style={{
        textAlign: align,
        padding: "6px 10px",
        fontSize: 9,
        color: "var(--muted)",
        fontWeight: 600,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        cursor: tooltip ? "help" : "default",
      }}
    >
      {children}{tooltip ? " ⓘ" : ""}
    </th>
  );
}

interface FilterGroupProps<T extends string> {
  label: string;
  value: T;
  setValue: (v: T) => void;
  options: ReadonlyArray<{ v: T; l: string }>;
}

function FilterGroup<T extends string>({ label, value, setValue, options }: FilterGroupProps<T>) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <span style={{ color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 600, fontSize: 9 }}>{label}</span>
      <div style={{ display: "flex", gap: 0, border: "1px solid var(--border)", borderRadius: 4, overflow: "hidden" }}>
        {options.map((o) => {
          const active = value === o.v;
          return (
            <button
              key={o.v}
              onClick={() => setValue(o.v)}
              style={{
                padding: "3px 8px",
                fontSize: 10,
                fontWeight: active ? 700 : 500,
                background: active ? "var(--teal)" : "transparent",
                color: active ? "#0b0b0b" : "var(--text)",
                border: "none",
                cursor: active ? "default" : "pointer",
              }}
            >
              {o.l}
            </button>
          );
        })}
      </div>
    </div>
  );
}
