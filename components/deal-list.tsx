"use client";

import { useMemo, useState } from "react";
import { DashboardState, DealRow, SourceLabel, InspectionCache } from "@/lib/types";
import { fmtK, fmtM } from "@/lib/format";
import { sfdcOppUrl, GROUP_META, GROUP_KEYS, type GroupKey } from "@/lib/config";

type Period = "currentWeek" | "lastWeek" | "thisMonth" | "lastMonth" | "currentQuarter";

const PERIOD_LABELS: Record<Period, string> = {
  currentWeek: "Current Week",
  lastWeek: "Last Week",
  thisMonth: "This Month",
  lastMonth: "Last Month",
  currentQuarter: "Current Quarter",
};


// Pill colors per source, matching the owner-group palette used across the dashboard
const SOURCE_PILL: Record<SourceLabel, { bg: string; fg: string }> = {
  "SDR Outbound":  { bg: "rgba(34, 197, 94, 0.15)",  fg: "var(--green)" },
  "6sense/Warmly": { bg: "rgba(34, 197, 94, 0.15)",  fg: "var(--green)" },
  "Inbound":       { bg: "rgba(245, 158, 11, 0.15)", fg: "var(--yellow)" },
  "Events":        { bg: "rgba(59, 130, 246, 0.15)", fg: "var(--blue)" },
  "Partner":       { bg: "rgba(59, 130, 246, 0.15)", fg: "var(--blue)" },
  "Webinar":       { bg: "rgba(59, 130, 246, 0.15)", fg: "var(--blue)" },
  "AE Self-Set":   { bg: "rgba(78, 205, 196, 0.15)", fg: "var(--teal)" },
};

type SortKey = "date" | "name" | "amount" | "owner" | "sdrOwner" | "segment" | "stage" | "source";
type SortDir = "asc" | "desc";

// Per-column default direction on first click — dates/amounts default desc (newest/biggest first)
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  date: "desc",
  name: "asc",
  amount: "desc",
  owner: "asc",
  sdrOwner: "asc",
  segment: "asc",
  stage: "asc",
  source: "asc",
};

// ── Timezone-safe date helpers (compare YYYY-MM-DD strings, no timestamps) ──

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00"); // noon avoids DST edge cases
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

function getMondayStr(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return toDateStr(d);
}

function periodRange(period: Period): { start: string; end: string } {
  const today = toDateStr(new Date());
  switch (period) {
    case "currentWeek": {
      const mon = getMondayStr(today);
      return { start: mon, end: addDays(mon, 6) };
    }
    case "lastWeek": {
      const mon = getMondayStr(today);
      return { start: addDays(mon, -7), end: addDays(mon, -1) };
    }
    case "thisMonth": {
      const d = new Date();
      return { start: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`, end: today };
    }
    case "lastMonth": {
      const d = new Date();
      const pm = d.getMonth() === 0 ? 11 : d.getMonth() - 1;
      const py = d.getMonth() === 0 ? d.getFullYear() - 1 : d.getFullYear();
      const lastDay = new Date(py, pm + 1, 0).getDate();
      return {
        start: `${py}-${String(pm + 1).padStart(2, "0")}-01`,
        end: `${py}-${String(pm + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
      };
    }
    case "currentQuarter": {
      const d = new Date();
      const qm = Math.floor(d.getMonth() / 3) * 3;
      return { start: `${d.getFullYear()}-${String(qm + 1).padStart(2, "0")}-01`, end: today };
    }
  }
}

function compare(a: DealRow, b: DealRow, key: SortKey, dir: SortDir): number {
  let av: string | number;
  let bv: string | number;
  switch (key) {
    case "date":
      av = a.discoveryDateIso;
      bv = b.discoveryDateIso;
      break;
    case "amount":
      av = a.amount;
      bv = b.amount;
      break;
    default:
      av = (a[key] as string).toLowerCase();
      bv = (b[key] as string).toLowerCase();
  }
  if (av < bv) return dir === "asc" ? -1 : 1;
  if (av > bv) return dir === "asc" ? 1 : -1;
  return 0;
}

export default function DealList({
  data,
  activeGroups,
  onToggleGroup,
  onInspect,
  inspections,
}: {
  data: DashboardState;
  activeGroups: Set<GroupKey>;
  onToggleGroup: (g: GroupKey) => void;
  onInspect?: (deal: DealRow) => void;
  inspections?: InspectionCache;
}) {
  const inspectionsByOppId = inspections?.inspections ?? {};
  const [period, setPeriod] = useState<Period>("lastWeek");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const allSelected = activeGroups.size === GROUP_KEYS.length;

  const filteredSorted = useMemo(() => {
    const { start, end } = periodRange(period);
    // Build allowed sources set from active groups
    const allowedSources = new Set<SourceLabel>();
    for (const g of activeGroups) {
      for (const s of GROUP_META[g].sources) allowedSources.add(s);
    }
    const filtered = data.deals.filter((d) => {
      // Compare date-only strings (YYYY-MM-DD) to avoid timezone issues
      const dateOnly = d.discoveryDateIso.slice(0, 10);
      if (dateOnly < start || dateOnly > end) return false;
      if (!allowedSources.has(d.source)) return false;
      return true;
    });
    return [...filtered].sort((a, b) => compare(a, b, sortKey, sortDir));
  }, [data.deals, period, activeGroups, sortKey, sortDir]);

  const totalAmount = useMemo(
    () => filteredSorted.reduce((s, d) => s + d.amount, 0),
    [filteredSorted]
  );

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(DEFAULT_DIR[key]);
    }
  }

  const formattedTotal = totalAmount >= 1_000_000 ? fmtM(totalAmount) : fmtK(totalAmount);

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10, flexWrap: "wrap", gap: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            Deals Created — {PERIOD_LABELS[period]}{" "}
            <span style={{ color: "var(--muted)", fontWeight: 400 }}>
              ({filteredSorted.length} · {formattedTotal})
            </span>
          </div>
          {!allSelected && (
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 3 }}>
              Filtered: {GROUP_KEYS.filter((g) => activeGroups.has(g)).map((g) => GROUP_META[g].displayLabel).join(", ")}
            </div>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <label style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4 }}>
              Period
            </label>
            <select
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              style={{
                padding: "4px 8px",
                borderRadius: 4,
                border: "1px solid var(--border)",
                background: "var(--bg)",
                color: "var(--text)",
                fontSize: 12,
                fontFamily: "inherit",
              }}
            >
              {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                <option key={p} value={p}>
                  {PERIOD_LABELS[p]}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {GROUP_KEYS.map((g) => {
              const meta = GROUP_META[g];
              const active = activeGroups.has(g);
              return (
                <button
                  key={g}
                  onClick={() => onToggleGroup(g)}
                  title={`${active ? "Hide" : "Show"} ${meta.displayLabel}`}
                  style={{
                    padding: "3px 8px",
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: 0.2,
                    borderRadius: 10,
                    border: `1px solid ${active ? meta.color : "var(--border)"}`,
                    background: active ? meta.activeBg : "transparent",
                    color: active ? meta.color : "var(--muted)",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    opacity: active ? 1 : 0.5,
                    transition: "all 100ms",
                  }}
                >
                  {meta.displayLabel}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {filteredSorted.length === 0 ? (
        <div style={{ fontSize: 12, color: "var(--muted)", padding: "20px 0", textAlign: "center" }}>
          No deals matching {PERIOD_LABELS[period].toLowerCase()}
          {!allSelected && ` with selected groups`}.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <SortableTh label="Date" sortKey="date" current={sortKey} dir={sortDir} onClick={handleSort} />
              <SortableTh label="Opportunity" sortKey="name" current={sortKey} dir={sortDir} onClick={handleSort} />
              <SortableTh label="Amount" sortKey="amount" current={sortKey} dir={sortDir} onClick={handleSort} />
              <SortableTh label="Owner" sortKey="owner" current={sortKey} dir={sortDir} onClick={handleSort} />
              <SortableTh label="SDR" sortKey="sdrOwner" current={sortKey} dir={sortDir} onClick={handleSort} />
              <SortableTh label="Seg" sortKey="segment" current={sortKey} dir={sortDir} onClick={handleSort} />
              <SortableTh label="Stage" sortKey="stage" current={sortKey} dir={sortDir} onClick={handleSort} />
              <SortableTh label="Source" sortKey="source" current={sortKey} dir={sortDir} onClick={handleSort} />
              {onInspect && <th style={{ textAlign: "center", width: 80 }}>Endgame</th>}
            </tr>
          </thead>
          <tbody>
            {filteredSorted.map((d) => (
              <tr key={d.oppId}>
                <td className="muted" style={{ textAlign: "left" }}>{d.date}</td>
                <td style={{ textAlign: "left", fontWeight: 500 }}>
                  {d.oppId ? (
                    <a
                      href={sfdcOppUrl(d.oppId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "var(--text)", textDecoration: "none", borderBottom: "1px dotted var(--muted)" }}
                    >
                      {d.name}
                    </a>
                  ) : (
                    d.name
                  )}
                </td>
                <td style={{ textAlign: "left", fontWeight: 600 }}>{fmtK(d.amount)}</td>
                <td className="muted" style={{ textAlign: "left" }}>{d.owner}</td>
                <td className="muted" style={{ textAlign: "left" }}>{d.sdrOwner || "—"}</td>
                <td style={{ textAlign: "left" }}>
                  <span
                    className="seg-badge"
                    style={{
                      background: d.segment === "ENT" ? "#4ecdc422" : "#3b82f622",
                      color: d.segment === "ENT" ? "var(--teal)" : "var(--blue)",
                    }}
                  >
                    {d.segment}
                  </span>
                </td>
                <td className="muted" style={{ textAlign: "left", fontSize: 10 }}>{d.stage}</td>
                <td style={{ textAlign: "left" }}>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "2px 8px",
                      borderRadius: 10,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: 0.2,
                      background: SOURCE_PILL[d.source]?.bg ?? "rgba(255,255,255,0.08)",
                      color: SOURCE_PILL[d.source]?.fg ?? "var(--muted)",
                    }}
                  >
                    {d.source}
                  </span>
                </td>
                {onInspect && (
                  <td style={{ textAlign: "center" }}>
                    {inspectionsByOppId[d.oppId] ? (
                      <button
                        onClick={() => onInspect(d)}
                        title="Open Endgame inspection card"
                        style={{
                          padding: "3px 8px",
                          fontSize: 10,
                          fontWeight: 700,
                          letterSpacing: 0.3,
                          borderRadius: 10,
                          border: "1px solid var(--teal)",
                          background: "rgba(78, 205, 196, 0.12)",
                          color: "var(--teal)",
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        Inspect ⚡
                      </button>
                    ) : (
                      <span style={{ fontSize: 9, color: "var(--muted)", opacity: 0.5 }}>—</span>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function SortableTh({
  label,
  sortKey,
  current,
  dir,
  onClick,
}: {
  label: string;
  sortKey: SortKey;
  current: SortKey;
  dir: SortDir;
  onClick: (k: SortKey) => void;
}) {
  const isActive = current === sortKey;
  return (
    <th
      onClick={() => onClick(sortKey)}
      style={{
        textAlign: "left",
        cursor: "pointer",
        userSelect: "none",
        color: isActive ? "var(--teal)" : undefined,
      }}
    >
      {label}
      <span style={{ marginLeft: 4, opacity: isActive ? 1 : 0.25, fontSize: 9 }}>
        {isActive ? (dir === "asc" ? "▲" : "▼") : "▲▼"}
      </span>
    </th>
  );
}
