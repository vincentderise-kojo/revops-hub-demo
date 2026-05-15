"use client";

import { useState, useMemo } from "react";

interface ChangelogEntry {
  date: string;
  app: string;
  status: string;
  title: string;
  description?: string;
}

// ── App badge colors ──
const APP_COLORS: Record<string, string> = {
  "Pipeline Pulse": "var(--blue)",
  "Pipeline Coverage": "var(--teal)",
  "Pipeline Scenarios": "var(--green)",
  "Pricing Calculator": "var(--yellow)",
  "RevOps Support": "var(--green)",
  "RevOps Hub": "var(--muted)",
};

function getAppColor(app: string): string {
  return APP_COLORS[app] || "var(--muted)";
}

// ── Week grouping ──
function getMonday(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getMondayKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

export default function UpdatesPage({ entries }: { entries: ChangelogEntry[] }) {
  const [filter, setFilter] = useState<string>("All");

  // Auto-generate app list from data
  const apps = useMemo(() => {
    const unique = new Set(entries.map((e) => e.app));
    return Array.from(unique).sort();
  }, [entries]);

  // Filter entries
  const filtered = useMemo(() => {
    if (filter === "All") return entries;
    return entries.filter((e) => e.app === filter);
  }, [entries, filter]);

  // Group by week
  const weeks = useMemo(() => {
    const groups: { weekKey: string; weekLabel: string; entries: ChangelogEntry[] }[] = [];
    const map = new Map<string, ChangelogEntry[]>();
    const labelMap = new Map<string, string>();

    for (const entry of filtered) {
      const key = getMondayKey(entry.date);
      const label = getMonday(entry.date);
      if (!map.has(key)) {
        map.set(key, []);
        labelMap.set(key, label);
      }
      map.get(key)!.push(entry);
    }

    // Sort weeks descending
    const keys = Array.from(map.keys()).sort((a, b) => b.localeCompare(a));
    for (const key of keys) {
      groups.push({ weekKey: key, weekLabel: labelMap.get(key)!, entries: map.get(key)! });
    }

    return groups;
  }, [filtered]);

  return (
    <>
      {/* CRESTLINE HEADER BAR */}
      <div className="brand-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/hub" style={{ fontSize: 15, fontWeight: 800, color: "#FFE500", letterSpacing: 1.5, textDecoration: "none" }}>CRESTLINE</a>
          <span style={{ width: 1, height: 16, background: "#555", display: "inline-block" }} />
          <a href="/hub" style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", textDecoration: "none" }}>RevOps Hub</a>
        </div>
      </div>

      {/* PAGE HEADER */}
      <div style={{ padding: "16px 20px 12px", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 8, height: 8, borderRadius: 4, background: "var(--teal)", boxShadow: "0 0 8px #4ecdc488" }} />
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5 }}>Updates</span>
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, paddingLeft: 18 }}>
          What&apos;s been shipped across the RevOps Hub.
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 960, margin: "0 auto" }}>
        {/* FILTER BAR */}
        <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
          <FilterButton label="All" active={filter === "All"} onClick={() => setFilter("All")} />
          {apps.map((app) => (
            <FilterButton key={app} label={app} active={filter === app} onClick={() => setFilter(app)} />
          ))}
        </div>

        {/* ENTRIES */}
        {weeks.length === 0 ? (
          <div style={{ fontSize: 12, color: "var(--muted)", fontStyle: "italic", padding: 20, textAlign: "center" }}>
            No updates yet{filter !== "All" ? ` for ${filter}` : ""}.
          </div>
        ) : (
          weeks.map((week) => (
            <div key={week.weekKey} style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>
                Week of {week.weekLabel}
              </div>
              {week.entries.map((entry, i) => (
                <EntryRow key={`${entry.date}-${i}`} entry={entry} />
              ))}
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ── Filter Button ──
function FilterButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 12px",
        borderRadius: 20,
        fontSize: 10,
        fontWeight: 600,
        background: active ? "#4ecdc433" : "transparent",
        color: active ? "#4ecdc4" : "var(--muted)",
        border: active ? "1px solid #4ecdc455" : "1px solid var(--border)",
        cursor: "pointer",
        fontFamily: "inherit",
        transition: "all 0.15s",
      }}
    >
      {label}
    </button>
  );
}

// ── Entry Row ──
function EntryRow({ entry }: { entry: ChangelogEntry }) {
  const color = getAppColor(entry.app);
  return (
    <div style={{ padding: "8px 0", borderBottom: "1px solid var(--border)", display: "flex", gap: 10, alignItems: "flex-start" }}>
      <span
        style={{
          padding: "2px 8px",
          borderRadius: 4,
          fontSize: 9,
          fontWeight: 600,
          background: `${color}22`,
          color,
          whiteSpace: "nowrap",
          marginTop: 2,
          flexShrink: 0,
        }}
      >
        {entry.app}
      </span>
      <div>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>{entry.title}</div>
        {entry.description && (
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>{entry.description}</div>
        )}
      </div>
    </div>
  );
}
