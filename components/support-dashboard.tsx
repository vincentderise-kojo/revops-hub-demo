"use client";

import { useState, useMemo } from "react";
import { SupportData, SupportTicket } from "@/lib/parse-support";

// ── Helpers ──

function statusOrder(s: SupportTicket["status"]): number {
  if (s === "Open") return 0;
  if (s === "Processing") return 1;
  if (s === "Resolved") return 2;
  return 3;
}

function priorityColor(p: string): string {
  if (p === "P0" || p === "P1") return "var(--red)";
  if (p === "P2") return "var(--yellow)";
  return "var(--muted)";
}

function statusColor(s: string): string {
  if (s === "Open") return "var(--red)";
  if (s === "Processing") return "var(--yellow)";
  if (s === "Resolved") return "var(--green)";
  return "var(--muted)";
}

function statusBg(s: string): string {
  if (s === "Open") return "#ef444422";
  if (s === "Processing") return "#f59e0b22";
  if (s === "Resolved") return "#22c55e22";
  return "#8899aa22";
}

function formatAge(submittedAt: string): string {
  const diff = Date.now() - new Date(submittedAt).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `${days}d`;
}

function formatSubmitted(submittedAt: string): string {
  const d = new Date(submittedAt);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (diffDays === 0) return `Today ${time}`;
  if (diffDays === 1) return `Yesterday ${time}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function slackDeepLink(messageTs: string): string {
  const tsWithoutDot = messageTs.replace(".", "");
  return `https://kojo-app.slack.com/archives/C02HZ3KV6SX/p${tsWithoutDot}`;
}

function isOverdue(ticket: SupportTicket): boolean {
  if (ticket.status !== "Open") return false;
  const age = Date.now() - new Date(ticket.submittedAt).getTime();
  return age > 24 * 60 * 60 * 1000;
}

function avgResolutionHours(tickets: SupportTicket[]): string {
  const resolved = tickets.filter((t) => t.resolutionMinutes !== null);
  if (resolved.length === 0) return "—";
  const avg = resolved.reduce((s, t) => s + t.resolutionMinutes!, 0) / resolved.length;
  return `${(avg / 60).toFixed(1)}h`;
}

// ── Main Component ──

export default function SupportDashboard({ data }: { data: SupportData }) {
  const [activeTab, setActiveTab] = useState<"queue" | "analytics">("queue");

  const now = useMemo(() => new Date(), []);
  const fourteenDaysAgo = useMemo(() => new Date(now.getTime() - 14 * 86_400_000), [now]);

  const queueTickets = useMemo(() => {
    const recent = data.tickets.filter((t) => new Date(t.submittedAt) >= fourteenDaysAgo);
    return recent.sort((a, b) => {
      const oa = statusOrder(a.status);
      const ob = statusOrder(b.status);
      if (oa !== ob) return oa - ob;
      if (a.status === "Resolved") {
        return new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime();
      }
      return new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime();
    });
  }, [data.tickets, fourteenDaysAgo]);

  const openCount = queueTickets.filter((t) => t.status === "Open").length;
  const processingCount = queueTickets.filter((t) => t.status === "Processing").length;
  const resolvedCount = queueTickets.filter((t) => t.status === "Resolved").length;

  const fetchedAt = new Date(data.fetchedAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <>
      {/* KOJO HEADER BAR */}
      <div className="kojo-header">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <a href="/hub" style={{ fontSize: 15, fontWeight: 800, color: "#FFE500", letterSpacing: 1.5, textDecoration: "none" }}>KOJO</a>
          <span style={{ width: 1, height: 16, background: "#555", display: "inline-block" }} />
          <a href="/hub" style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", textDecoration: "none" }}>RevOps Hub</a>
        </div>
        <span style={{ fontSize: 10, color: "#777", letterSpacing: 0.3 }}>Fetched at {fetchedAt}</span>
      </div>

      {/* APP HEADER */}
      <div style={{ padding: "16px 20px 0", borderBottom: "1px solid var(--border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ width: 8, height: 8, borderRadius: 4, background: "var(--kojo-yellow)", boxShadow: "0 0 8px #f59e0b88" }} />
          <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: -0.5 }}>RevOps Support</span>
          <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: 4 }}>Ticket Queue & Analytics</span>
        </div>
        {/* Tabs */}
        <div style={{ display: "flex", gap: 24, paddingLeft: 18 }}>
          <button
            onClick={() => setActiveTab("queue")}
            style={{
              background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
              fontSize: 12, fontWeight: 600, padding: "8px 0",
              color: activeTab === "queue" ? "var(--text)" : "var(--muted)",
              borderBottom: activeTab === "queue" ? "2px solid var(--kojo-yellow)" : "2px solid transparent",
            }}
          >
            Queue
          </button>
          <button
            onClick={() => setActiveTab("analytics")}
            style={{
              background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
              fontSize: 12, fontWeight: 600, padding: "8px 0",
              color: activeTab === "analytics" ? "var(--text)" : "var(--muted)",
              borderBottom: activeTab === "analytics" ? "2px solid var(--kojo-yellow)" : "2px solid transparent",
            }}
          >
            Analytics
          </button>
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 960, margin: "0 auto" }}>
        {activeTab === "queue" ? (
          <QueueView tickets={queueTickets} openCount={openCount} processingCount={processingCount} resolvedCount={resolvedCount} />
        ) : (
          <AnalyticsView tickets={data.tickets} />
        )}
      </div>
    </>
  );
}

// ── Queue View ──

function QueueView({ tickets, openCount, processingCount, resolvedCount }: {
  tickets: SupportTicket[];
  openCount: number;
  processingCount: number;
  resolvedCount: number;
}) {
  return (
    <>
      {/* Summary Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
        <SummaryCard label="Open" value={openCount} color="var(--red)" />
        <SummaryCard label="Processing" value={processingCount} color="var(--yellow)" />
        <SummaryCard label="Resolved" value={resolvedCount} color="var(--green)" />
        <SummaryCard label="Avg Resolution" value={avgResolutionHours(tickets)} color="var(--teal)" />
      </div>

      {/* Ticket Table */}
      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Tickets — Last 14 Days</div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 14 }}>
          {tickets.length} tickets. Open tickets sorted to top — oldest first to catch anything missed.
        </div>
        <div style={{ overflowX: "auto" }}>
          <table>
            <thead>
              <tr>
                <th style={{ width: 80 }}>Status</th>
                <th style={{ textAlign: "left" }}>Subject</th>
                <th style={{ textAlign: "left" }}>Requester</th>
                <th>Priority</th>
                <th style={{ textAlign: "left" }}>Category</th>
                <th>Submitted</th>
                <th>Age</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((t) => (
                <tr key={t.messageTs}>
                  <td>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600,
                      background: statusBg(t.status), color: statusColor(t.status),
                    }}>
                      {t.status}
                    </span>
                  </td>
                  <td style={{ textAlign: "left", fontWeight: 500, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    <a href={slackDeepLink(t.messageTs)} target="_blank" rel="noopener noreferrer" style={{ color: "var(--text)", textDecoration: "none" }}>
                      {t.subject || "(no subject)"}
                    </a>
                  </td>
                  <td style={{ textAlign: "left" }} className="muted">{t.requester}</td>
                  <td style={{ color: priorityColor(t.priority), fontWeight: 600 }}>{t.priority}</td>
                  <td style={{ textAlign: "left" }} className="muted">{t.categoryShort}</td>
                  <td className="muted" style={{ fontSize: 10 }}>{formatSubmitted(t.submittedAt)}</td>
                  <td style={{
                    fontWeight: isOverdue(t) ? 700 : 400,
                    color: isOverdue(t) ? "var(--red)" : "var(--muted)",
                  }}>
                    {formatAge(t.submittedAt)}
                  </td>
                </tr>
              ))}
              {tickets.length === 0 && (
                <tr><td colSpan={7} style={{ textAlign: "center", color: "var(--muted)", padding: 20 }}>No tickets in the last 14 days</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

function SummaryCard({ label, value, color }: { label: string; value: number | string; color: string }) {
  return (
    <div style={{ background: "var(--bg)", borderRadius: 8, padding: 12, borderTop: `3px solid ${color}` }}>
      <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color }}>{value}</div>
    </div>
  );
}

// ── Analytics Helpers ──

interface WeekBucket {
  label: string;
  tickets: SupportTicket[];
  avgResolutionMins: number | null;
}

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function bucketByWeek(tickets: SupportTicket[]): WeekBucket[] {
  const buckets = new Map<string, SupportTicket[]>();

  for (const t of tickets) {
    const monday = getMonday(new Date(t.submittedAt));
    const key = monday.toISOString();
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(t);
  }

  const sorted = Array.from(buckets.entries()).sort(
    (a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime(),
  );

  return sorted.map(([mondayIso, tix]) => {
    const monday = new Date(mondayIso);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const label = `${monday.getMonth() + 1}/${monday.getDate()}\u2013${sunday.getMonth() + 1}/${sunday.getDate()}`;

    const resolved = tix.filter((t) => t.resolutionMinutes !== null);
    const avgResolutionMins = resolved.length > 0
      ? resolved.reduce((s, t) => s + t.resolutionMinutes!, 0) / resolved.length
      : null;

    return { label, tickets: tix, avgResolutionMins };
  });
}

interface CategoryCount {
  name: string;
  count: number;
  pct: number;
  color: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  Salesforce: "var(--blue)",
  Routing: "var(--yellow)",
  "Deal Desk": "var(--green)",
  Other: "var(--muted)",
};

function countCategories(tickets: SupportTicket[]): CategoryCount[] {
  const counts = new Map<string, number>();
  for (const t of tickets) {
    const cat = t.categoryShort || "Other";
    counts.set(cat, (counts.get(cat) || 0) + 1);
  }
  const total = tickets.length || 1;
  return Array.from(counts.entries())
    .map(([name, count]) => ({
      name,
      count,
      pct: Math.round((count / total) * 100),
      color: CATEGORY_COLORS[name] || "var(--muted)",
    }))
    .sort((a, b) => b.count - a.count);
}

interface RequesterCount {
  name: string;
  count: number;
}

function countRequesters(tickets: SupportTicket[]): RequesterCount[] {
  const counts = new Map<string, number>();
  for (const t of tickets) {
    counts.set(t.requester, (counts.get(t.requester) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
}

// ── Analytics View ──

function AnalyticsView({ tickets }: { tickets: SupportTicket[] }) {
  const [range, setRange] = useState<14 | 30 | 90>(30);

  const filtered = useMemo(() => {
    const cutoff = new Date(Date.now() - range * 86_400_000);
    return tickets.filter((t) => new Date(t.submittedAt) >= cutoff);
  }, [tickets, range]);

  const weeks = useMemo(() => bucketByWeek(filtered), [filtered]);
  const categories = useMemo(() => countCategories(filtered), [filtered]);
  const requesters = useMemo(() => countRequesters(filtered), [filtered]);

  const totalTickets = filtered.length;
  const knownStatus = filtered.filter((t) => t.status !== "Unknown");
  const resolvedCount = knownStatus.filter((t) => t.status === "Resolved").length;
  const resolutionRate = knownStatus.length > 0 ? Math.round((resolvedCount / knownStatus.length) * 100) : 0;
  const resolvedWithTime = filtered.filter((t) => t.resolutionMinutes !== null);
  const avgResMins = resolvedWithTime.length > 0
    ? resolvedWithTime.reduce((s, t) => s + t.resolutionMinutes!, 0) / resolvedWithTime.length
    : 0;
  const avgResHours = avgResMins > 0 ? `${(avgResMins / 60).toFixed(1)}h` : "\u2014";
  const numWeeks = Math.max(range / 7, 1);
  const ticketsPerWeek = (totalTickets / numWeeks).toFixed(1);

  const maxWeekCount = Math.max(...weeks.map((w) => w.tickets.length), 1);
  const maxResTime = Math.max(...weeks.map((w) => w.avgResolutionMins ?? 0), 1);
  const chartHeight = 120;

  return (
    <>
      {/* Time Range Control */}
      <div className="card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Analytics</div>
        <select
          value={range}
          onChange={(e) => setRange(parseInt(e.target.value) as 14 | 30 | 90)}
          style={{
            padding: "6px 10px", borderRadius: 6, border: "1px solid var(--border)",
            background: "var(--bg)", color: "var(--teal)", fontSize: 12, fontFamily: "inherit",
          }}
        >
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
        <SummaryCard label="Total Tickets" value={totalTickets} color="var(--teal)" />
        <SummaryCard label="Resolution Rate" value={`${resolutionRate}%`} color="var(--green)" />
        <SummaryCard label="Avg Resolution" value={avgResHours} color="var(--yellow)" />
        <SummaryCard label="Tickets/Week" value={ticketsPerWeek} color="var(--blue)" />
      </div>

      {/* Weekly Volume & Resolution Chart */}
      <div className="card">
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>Weekly Volume & Resolution Time</div>
        <div style={{ position: "relative", height: chartHeight + 30 }}>
          <div style={{ display: "flex", alignItems: "flex-end", height: chartHeight, gap: 4 }}>
            {weeks.map((w, i) => {
              const barH = (w.tickets.length / maxWeekCount) * (chartHeight - 10);
              const resY = w.avgResolutionMins !== null
                ? chartHeight - (w.avgResolutionMins / maxResTime) * (chartHeight - 10) - 5
                : null;
              return (
                <div key={i} style={{ flex: 1, position: "relative", height: chartHeight }}>
                  {/* Volume bar */}
                  <div style={{
                    position: "absolute", bottom: 0, left: "15%", right: "15%",
                    height: barH, background: "#4ecdc466", borderRadius: "3px 3px 0 0",
                  }} />
                  {/* Resolution time marker */}
                  {resY !== null && (
                    <div style={{
                      position: "absolute", left: "50%", transform: "translateX(-50%)",
                      top: resY, width: 8, height: 3, borderRadius: 1,
                      background: "var(--yellow)", zIndex: 2,
                    }} />
                  )}
                </div>
              );
            })}
          </div>
          {/* X axis */}
          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            {weeks.map((w, i) => (
              <div key={i} style={{ flex: 1, textAlign: "center", fontSize: 7, color: "var(--muted)" }}>
                {i % 2 === 0 ? w.label.split("\u2013")[0] : ""}
              </div>
            ))}
          </div>
          {/* Legend */}
          <div style={{ display: "flex", gap: 14, fontSize: 9, marginTop: 6, color: "var(--muted)" }}>
            <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#4ecdc466", borderRadius: 2, marginRight: 4 }} />Volume</span>
            <span><span style={{ display: "inline-block", width: 8, height: 3, background: "var(--yellow)", borderRadius: 1, marginRight: 4, verticalAlign: "middle" }} />Avg Resolution</span>
          </div>
        </div>
      </div>

      {/* Category Breakdown */}
      <div className="card">
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>By Category</div>
        {categories.map((c) => (
          <div key={c.name} style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
              <span style={{ color: "var(--text)" }}>{c.name}</span>
              <span style={{ color: "var(--muted)" }}>{c.count} ({c.pct}%)</span>
            </div>
            <div style={{ height: 6, background: "var(--bg)", borderRadius: 3, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${c.pct}%`, background: c.color, borderRadius: 3 }} />
            </div>
          </div>
        ))}
        {categories.length === 0 && <div style={{ fontSize: 11, color: "var(--muted)" }}>No data</div>}
      </div>

      {/* Top Requesters */}
      <div className="card">
        <div style={{ fontSize: 12, fontWeight: 600, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 12 }}>Top Requesters</div>
        {requesters.map((r) => (
          <div key={r.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 6 }}>
            <span style={{ color: "var(--text)" }}>{r.name}</span>
            <span style={{ color: "var(--teal)", fontWeight: 600 }}>{r.count}</span>
          </div>
        ))}
        {requesters.length === 0 && <div style={{ fontSize: 11, color: "var(--muted)" }}>No data</div>}
      </div>
    </>
  );
}
