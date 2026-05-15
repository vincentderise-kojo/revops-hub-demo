"use client";

import { useState } from "react";
import type { AeMatrixRow, AeMetricCell, AeDrillDownOpp } from "@/lib/types-ae-performance";
import { sfdcOppUrl, AE_PERFORMANCE_CONFIG } from "@/lib/config";
import { fmtK } from "@/lib/format";

export interface AeMatrixColumn {
  /** Matches the key used in AeMatrixRow.metrics */
  metricKey: string;
  /** Header label shown in the table */
  label: string;
  /** Native browser tooltip on hover — explains what the metric means */
  tooltip?: string;
}

interface Props {
  columns: readonly AeMatrixColumn[];
  rows: readonly AeMatrixRow[];
  /** Called when an AE name or metric cell is clicked. */
  onCellClick?: (info: { ae: string; metric?: string }) => void;
  /** Section name passed back on header clicks (filters drill-down by section). */
  section?: "inbound" | "event" | "qualified" | "self-set";
  /** Called when a metric column header is clicked. */
  onHeaderClick?: (info: { section: string; metric: string }) => void;
  /** Per-AE opp lists for inline expansion. Keyed by AE name; opps already scoped to this section. */
  oppsByAe?: Record<string, readonly AeDrillDownOpp[]>;
  /** Show Source column in the inline expansion. Useful for sections with mixed sources (e.g., Qualified pipeline). */
  showSourceColumn?: boolean;
}

const COLOR_BG: Record<AeMetricCell["color"], string> = {
  green:   "rgba(34, 197, 94, 0.15)",
  yellow:  "rgba(245, 158, 11, 0.18)",
  red:     "rgba(239, 68, 68, 0.18)",
  neutral: "transparent",
};

const COLOR_FG: Record<AeMetricCell["color"], string> = {
  green:   "var(--green)",
  yellow:  "var(--yellow)",
  red:     "var(--red)",
  neutral: "var(--text)",
};

const MS_PER_HOUR = 1000 * 60 * 60;
const SLA_MS = AE_PERFORMANCE_CONFIG.inboundSlaHours * MS_PER_HOUR;

export default function AePerformanceMatrix({ columns, rows, onCellClick, section, onHeaderClick, oppsByAe, showSourceColumn }: Props) {
  const [expandedAes, setExpandedAes] = useState<Set<string>>(new Set());

  function toggleExpanded(ae: string) {
    setExpandedAes((prev) => {
      const next = new Set(prev);
      if (next.has(ae)) next.delete(ae);
      else next.add(ae);
      return next;
    });
  }

  if (rows.length === 0) {
    return (
      <div style={{ fontSize: 11, color: "var(--muted)", padding: "12px 0" }}>
        No AEs match the current filter.
      </div>
    );
  }

  const mmRows = rows.filter((r) => r.segment === "MM");
  const entRows = rows.filter((r) => r.segment === "ENT");
  const expandable = !!oppsByAe;
  const totalCols = columns.length + 1;

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: "1px solid var(--border)" }}>
          <th style={{ textAlign: "left", padding: "8px 10px", fontWeight: 600, fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.5 }}>
            AE
          </th>
          {columns.map((c) => (
            <th
              key={c.metricKey}
              onClick={() => onHeaderClick && section ? onHeaderClick({ section, metric: c.metricKey }) : undefined}
              title={c.tooltip}
              style={{
                textAlign: "right",
                padding: "8px 10px",
                fontWeight: 600,
                fontSize: 10,
                color: "var(--muted)",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                cursor: onHeaderClick ? "pointer" : c.tooltip ? "help" : "default",
              }}
            >
              {c.label}{c.tooltip ? " ⓘ" : ""}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {mmRows.length > 0 && <SegmentHeader label="MidMarket" cols={totalCols} />}
        {mmRows.flatMap((r) => renderRowWithExpansion(r, columns, totalCols, onCellClick, expandable, expandedAes.has(r.ae), () => toggleExpanded(r.ae), oppsByAe?.[r.ae], !!showSourceColumn))}
        {entRows.length > 0 && <SegmentHeader label="Enterprise" cols={totalCols} />}
        {entRows.flatMap((r) => renderRowWithExpansion(r, columns, totalCols, onCellClick, expandable, expandedAes.has(r.ae), () => toggleExpanded(r.ae), oppsByAe?.[r.ae], !!showSourceColumn))}
      </tbody>
    </table>
  );
}

function SegmentHeader({ label, cols }: { label: string; cols: number }) {
  return (
    <tr>
      <td
        colSpan={cols}
        style={{
          padding: "10px 10px 4px",
          fontSize: 9,
          color: "var(--muted)",
          textTransform: "uppercase",
          letterSpacing: 0.8,
          fontWeight: 600,
        }}
      >
        {label}
      </td>
    </tr>
  );
}

function renderRowWithExpansion(
  row: AeMatrixRow,
  columns: readonly AeMatrixColumn[],
  totalCols: number,
  onCellClick: Props["onCellClick"],
  expandable: boolean,
  isExpanded: boolean,
  onToggle: () => void,
  opps: readonly AeDrillDownOpp[] | undefined,
  showSourceColumn: boolean
) {
  const aeRow = (
    <tr key={row.ae} style={{ borderTop: "1px solid var(--border)" }}>
      <td
        style={{
          padding: "8px 10px",
          fontWeight: 600,
          color: "var(--text)",
          cursor: onCellClick || expandable ? "pointer" : "default",
        }}
        onClick={() => {
          if (expandable) onToggle();
          if (onCellClick) onCellClick({ ae: row.ae });
        }}
      >
        {expandable && (
          <span style={{ display: "inline-block", width: 12, color: "var(--muted)", marginRight: 4, fontSize: 10 }}>
            {isExpanded ? "▾" : "▸"}
          </span>
        )}
        {row.ae}
      </td>
      {columns.map((c) => {
        const cell = row.metrics[c.metricKey];
        if (!cell) {
          return (
            <td key={c.metricKey} style={{ padding: "8px 10px", textAlign: "right", color: "var(--muted)" }}>
              —
            </td>
          );
        }
        return (
          <td
            key={c.metricKey}
            onClick={(e) => {
              e.stopPropagation();
              if (onCellClick) onCellClick({ ae: row.ae, metric: c.metricKey });
            }}
            style={{
              padding: "8px 10px",
              textAlign: "right",
              fontWeight: 600,
              cursor: onCellClick ? "pointer" : "default",
              background: COLOR_BG[cell.color],
              color: COLOR_FG[cell.color],
            }}
          >
            {cell.display}
          </td>
        );
      })}
    </tr>
  );

  if (!expandable || !isExpanded) return [aeRow];

  const expansionRow = (
    <tr key={`${row.ae}__expanded`} style={{ background: "rgba(255,255,255,0.02)" }}>
      <td colSpan={totalCols} style={{ padding: "0 10px 10px 28px", borderBottom: "1px solid var(--border)" }}>
        <InlineOppList opps={opps ?? []} showSourceColumn={showSourceColumn} />
      </td>
    </tr>
  );

  return [aeRow, expansionRow];
}

function InlineOppList({ opps, showSourceColumn }: { opps: readonly AeDrillDownOpp[]; showSourceColumn: boolean }) {
  if (opps.length === 0) {
    return (
      <div style={{ fontSize: 10, color: "var(--muted)", padding: "8px 0" }}>
        No opps in this section.
      </div>
    );
  }

  const nowMs = Date.now();

  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, marginTop: 4 }}>
      <thead>
        <tr style={{ borderBottom: "1px solid var(--border)" }}>
          <Th>Opp</Th>
          {showSourceColumn && <Th>Source</Th>}
          <Th>Stage</Th>
          <Th align="right">Created</Th>
          <Th align="right">Close Date</Th>
          <Th align="right">First Touch</Th>
          <Th align="right">Days Since Last Touch</Th>
          <Th align="right">Stage Duration</Th>
          <Th align="right">Amount</Th>
          <Th align="right">Annual Revenue</Th>
        </tr>
      </thead>
      <tbody>
        {opps.map((o) => {
          const createdMs = new Date(o.createdDate).getTime();
          const slaTracked = o.appearsIn.some((t) => t.section === "inbound" || t.section === "event");
          let firstTouchDisplay: string;
          let firstTouchColor: string;

          if (o.lastActivityDate) {
            const lastMs = new Date(o.lastActivityDate).getTime();
            const ttfHours = (lastMs - createdMs) / MS_PER_HOUR;
            firstTouchDisplay = ttfHours < 24 ? `${ttfHours.toFixed(1)}h` : `${(ttfHours / 24).toFixed(1)}d`;
            firstTouchColor = !slaTracked ? "var(--text)" : (lastMs - createdMs <= SLA_MS ? "var(--green)" : "var(--red)");
          } else {
            const ageMs = nowMs - createdMs;
            if (!slaTracked) {
              firstTouchDisplay = "—";
              firstTouchColor = "var(--muted)";
            } else if (ageMs > SLA_MS) {
              firstTouchDisplay = "— (past SLA)";
              firstTouchColor = "var(--red)";
            } else {
              firstTouchDisplay = "— (pending)";
              firstTouchColor = "var(--muted)";
            }
          }

          return (
            <tr key={o.oppId} style={{ borderTop: "1px solid var(--border)" }}>
              <td style={{ padding: "5px 8px" }}>
                <a href={sfdcOppUrl(o.oppId)} target="_blank" rel="noreferrer" style={{ color: "var(--teal)", textDecoration: "none" }}>
                  {o.name || o.oppId}
                </a>
              </td>
              {showSourceColumn && <td style={{ padding: "5px 8px" }}>{o.source}</td>}
              <td style={{ padding: "5px 8px" }}>{o.stage}</td>
              <td style={{ padding: "5px 8px", textAlign: "right", color: "var(--muted)" }}>
                {new Date(o.createdDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </td>
              <td style={{ padding: "5px 8px", textAlign: "right", color: "var(--muted)" }}>
                {o.closeDate ? new Date(o.closeDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—"}
              </td>
              <td style={{ padding: "5px 8px", textAlign: "right", color: firstTouchColor, fontWeight: slaTracked ? 600 : 400 }}>
                {firstTouchDisplay}
              </td>
              <td style={{ padding: "5px 8px", textAlign: "right", color: o.daysSinceLastActivity !== null && o.daysSinceLastActivity >= 7 ? "var(--red)" : "var(--text)" }}>
                {o.daysSinceLastActivity ?? "—"}
              </td>
              <td style={{ padding: "5px 8px", textAlign: "right", color: "var(--muted)" }}>
                {o.stageDurationDays ? `${Math.round(o.stageDurationDays)}d` : "—"}
              </td>
              <td style={{ padding: "5px 8px", textAlign: "right" }}>
                ${Math.round(o.amount).toLocaleString()}
              </td>
              <td style={{ padding: "5px 8px", textAlign: "right", color: "var(--muted)" }}>
                {o.annualRevenue ? fmtK(o.annualRevenue) : "—"}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Th({ children, align = "left" }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th style={{ textAlign: align, padding: "5px 8px", fontSize: 9, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5 }}>
      {children}
    </th>
  );
}
