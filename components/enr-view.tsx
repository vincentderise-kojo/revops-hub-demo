"use client";

import { useState, useMemo, useCallback } from "react";
import {
  AccountIntelligenceData,
  EnrMatch,
  KojoStatus,
  MatchConfidence,
} from "@/lib/types-account-intelligence";
import { AI_CONFIG } from "@/lib/config";
import { fmtK } from "@/lib/format";
import { normalizeState } from "@/lib/process-account-intelligence";

interface Props {
  data: AccountIntelligenceData;
}

type SortKey =
  | "rank"
  | "firmName"
  | "firmType"
  | "enrRev"
  | "status"
  | "sfdcRev"
  | "delta"
  | "arr"
  | "state";
type SortDir = "asc" | "desc";

const STATUS_OPTIONS: KojoStatus[] = [
  "Customer",
  "Former",
  "Active Opp",
  "Not in SFDC",
];

export default function EnrView({ data }: Props) {
  // Filters
  const [statusFilter, setStatusFilter] = useState<Set<string>>(new Set());
  const [firmTypeFilter, setFirmTypeFilter] = useState<Set<string>>(new Set());
  const [ownerFilter, setOwnerFilter] = useState<string>("");
  const [accuracyFilter, setAccuracyFilter] = useState<string>("all");
  const [search, setSearch] = useState("");

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("rank");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Export modal
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportPasscode, setExportPasscode] = useState("");
  const [exportError, setExportError] = useState(false);

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir(key === "rank" ? "asc" : "desc");
      }
    },
    [sortKey]
  );

  const filtered = useMemo(() => {
    let rows = data.enrMatches;

    // Status filter
    if (statusFilter.size > 0) {
      rows = rows.filter((m) => {
        if (statusFilter.has(m.kojoStatus)) return true;
        if (statusFilter.has("Not in SFDC - ICP") && m.kojoStatus === "Not in SFDC" && m.isIcp) return true;
        if (statusFilter.has("Not in SFDC - Non-ICP") && m.kojoStatus === "Not in SFDC" && !m.isIcp) return true;
        return false;
      });
    }

    // Firm type filter
    if (firmTypeFilter.size > 0) {
      rows = rows.filter((m) =>
        m.enrFirm.firmType.split("/").some((t) => firmTypeFilter.has(t.trim()))
      );
    }

    // Owner filter
    if (ownerFilter) {
      rows = rows.filter(
        (m) => m.matchedAccount?.accountOwner === ownerFilter
      );
    }

    // Accuracy filter
    if (accuracyFilter !== "all") {
      rows = rows.filter((m) => {
        if (accuracyFilter === "no-match") return m.matchedAccount === null;
        if (m.revenueDeltaPct === null) return false;
        const abs = Math.abs(m.revenueDeltaPct);
        if (accuracyFilter === "accurate") return abs <= 0.15;
        if (accuracyFilter === "off") return abs > 0.15 && abs <= 0.3;
        if (accuracyFilter === "wrong") return abs > 0.3;
        return true;
      });
    }

    // Search
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (m) =>
          m.enrFirm.firmName.toLowerCase().includes(q) ||
          (m.matchedAccount?.accountName.toLowerCase().includes(q) ?? false)
      );
    }

    // Sort
    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "rank":
          cmp = a.enrFirm.enrRank2025 - b.enrFirm.enrRank2025;
          break;
        case "firmName":
          cmp = a.enrFirm.firmName.localeCompare(b.enrFirm.firmName);
          break;
        case "firmType":
          cmp = a.enrFirm.firmType.localeCompare(b.enrFirm.firmType);
          break;
        case "enrRev":
          cmp = a.enrFirm.revenue2024Mil - b.enrFirm.revenue2024Mil;
          break;
        case "status":
          cmp = a.kojoStatus.localeCompare(b.kojoStatus);
          break;
        case "sfdcRev":
          cmp = (a.sfdcRevenue || 0) - (b.sfdcRevenue || 0);
          break;
        case "delta":
          cmp = (a.revenueDeltaPct || 0) - (b.revenueDeltaPct || 0);
          break;
        case "arr":
          cmp = (a.sfdcArr || 0) - (b.sfdcArr || 0);
          break;
        case "state":
          cmp = (a.matchedAccount?.billingState || "").localeCompare(
            b.matchedAccount?.billingState || ""
          );
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [data.enrMatches, statusFilter, firmTypeFilter, ownerFilter, accuracyFilter, search, sortKey, sortDir]);

  const handleExport = useCallback(() => {
    if (exportPasscode !== AI_CONFIG.exportPasscode) {
      setExportError(true);
      setExportPasscode("");
      return;
    }
    setShowExportModal(false);
    setExportPasscode("");
    setExportError(false);

    // Build CSV
    const headers = [
      "2025 Rank", "2024 Rank", "Rank Change", "ENR Firm", "Firm Type", "ENR Rev ($M)", "Kojo Status",
      "Match Confidence", "SFDC Account", "SFDC Revenue", "Revenue Delta %",
      "SFDC ARR", "SFDC State", "ENR State", "State Mismatch", "Trade Designation", "ENR Tag", "Family", "Action Needed",
    ];

    const rows = filtered.map((m) => {
      const actionNeeded = getActionNeeded(m);
      const sfdcState = m.matchedAccount?.billingState || "";
      const enrState = m.enrFirm.state || "";
      const mismatch =
        !!sfdcState && !!enrState && normalizeState(sfdcState) !== normalizeState(enrState);
      const rankChange =
        m.enrFirm.enrRank2024 === null
          ? "NEW"
          : m.enrFirm.enrRank2024 > m.enrFirm.enrRank2025
          ? `+${m.enrFirm.enrRank2024 - m.enrFirm.enrRank2025}`
          : m.enrFirm.enrRank2024 < m.enrFirm.enrRank2025
          ? `-${m.enrFirm.enrRank2025 - m.enrFirm.enrRank2024}`
          : "0";
      return [
        m.enrFirm.enrRank2025,
        m.enrFirm.enrRank2024 ?? "",
        rankChange,
        `"${m.enrFirm.firmName}"`,
        m.enrFirm.firmType,
        m.enrFirm.revenue2024Mil,
        m.kojoStatus + (m.kojoStatus === "Not in SFDC" ? (m.isIcp ? " (ICP)" : " (Non-ICP)") : ""),
        m.matchConfidence || "",
        `"${m.matchedAccount?.accountName || ""}"`,
        m.sfdcRevenue || "",
        m.revenueDeltaPct !== null ? `${Math.round(m.revenueDeltaPct * 100)}%` : "",
        m.sfdcArr || "",
        sfdcState,
        enrState,
        mismatch ? "Yes" : "",
        m.matchedAccount?.tradeDesignation || "",
        m.hasEnrTag ? "Yes" : "No",
        m.family ? `"${m.family.ultimateParentName} (${m.family.accountCount})"` : "",
        `"${actionNeeded}"`,
      ].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `enr-account-intelligence-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [filtered, exportPasscode]);

  const SortHeader = ({
    label,
    sortKeyVal,
    align = "left",
  }: {
    label: string;
    sortKeyVal: SortKey;
    align?: "left" | "right" | "center";
  }) => (
    <th
      onClick={() => handleSort(sortKeyVal)}
      style={{
        padding: "8px 10px",
        textAlign: align,
        color: "var(--muted)",
        fontWeight: 600,
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
      }}
    >
      {label}
      {sortKey === sortKeyVal && (
        <span style={{ marginLeft: 4 }}>{sortDir === "asc" ? "▲" : "▼"}</span>
      )}
    </th>
  );

  return (
    <div>
      {/* Filters */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 10,
          marginBottom: 16,
          alignItems: "center",
        }}
      >
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) {
              setStatusFilter((prev) => {
                const next = new Set(prev);
                if (next.has(e.target.value)) next.delete(e.target.value);
                else next.add(e.target.value);
                return next;
              });
            }
          }}
          style={filterSelectStyle}
        >
          <option value="">Kojo Status</option>
          {[...STATUS_OPTIONS, "Not in SFDC - ICP", "Not in SFDC - Non-ICP"].map(
            (s) => (
              <option key={s} value={s}>
                {statusFilter.has(s) ? "✓ " : ""}{s}
              </option>
            )
          )}
        </select>

        <select
          value=""
          onChange={(e) => {
            if (e.target.value) {
              setFirmTypeFilter((prev) => {
                const next = new Set(prev);
                if (next.has(e.target.value)) next.delete(e.target.value);
                else next.add(e.target.value);
                return next;
              });
            }
          }}
          style={filterSelectStyle}
        >
          <option value="">Firm Type</option>
          {data.allFirmTypes.map((t) => (
            <option key={t} value={t}>
              {firmTypeFilter.has(t) ? "✓ " : ""}{t}
            </option>
          ))}
        </select>

        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          style={filterSelectStyle}
        >
          <option value="">Account Owner</option>
          {data.allOwners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>

        <select
          value={accuracyFilter}
          onChange={(e) => setAccuracyFilter(e.target.value)}
          style={filterSelectStyle}
        >
          <option value="all">Revenue Accuracy</option>
          <option value="accurate">Accurate (&lt;15%)</option>
          <option value="off">Off (15-30%)</option>
          <option value="wrong">Wrong (&gt;30%)</option>
          <option value="no-match">No SFDC Match</option>
        </select>

        <input
          type="text"
          placeholder="Search firms..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            ...filterSelectStyle,
            minWidth: 160,
          }}
        />

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>
            {filtered.length} of {data.enrMatches.length}
          </span>
          <button
            onClick={() => setShowExportModal(true)}
            style={{
              padding: "6px 12px",
              fontSize: 11,
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--text)",
              cursor: "pointer",
            }}
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Active filter pills */}
      {(statusFilter.size > 0 || firmTypeFilter.size > 0 || ownerFilter) && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
          {[...statusFilter].map((s) => (
            <FilterPill key={s} label={s} onRemove={() => {
              setStatusFilter((prev) => { const n = new Set(prev); n.delete(s); return n; });
            }} />
          ))}
          {[...firmTypeFilter].map((t) => (
            <FilterPill key={t} label={`Type: ${t}`} onRemove={() => {
              setFirmTypeFilter((prev) => { const n = new Set(prev); n.delete(t); return n; });
            }} />
          ))}
          {ownerFilter && (
            <FilterPill label={`Owner: ${ownerFilter}`} onRemove={() => setOwnerFilter("")} />
          )}
          <button
            onClick={() => {
              setStatusFilter(new Set());
              setFirmTypeFilter(new Set());
              setOwnerFilter("");
              setAccuracyFilter("all");
              setSearch("");
            }}
            style={{ fontSize: 10, color: "var(--muted)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
          >
            Clear all
          </button>
        </div>
      )}

      {/* Table */}
      <div
        style={{
          overflowX: "auto",
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 10,
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 11,
            whiteSpace: "nowrap",
          }}
        >
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border)" }}>
              <SortHeader label="Rank" sortKeyVal="rank" />
              <SortHeader label="ENR Firm" sortKeyVal="firmName" />
              <SortHeader label="Type" sortKeyVal="firmType" />
              <SortHeader label="ENR Rev ($M)" sortKeyVal="enrRev" align="right" />
              <SortHeader label="Kojo Status" sortKeyVal="status" align="center" />
              <th style={thStyle}>Match</th>
              <th style={thStyle}>SFDC Account</th>
              <SortHeader label="SFDC Rev" sortKeyVal="sfdcRev" align="right" />
              <SortHeader label="Rev Delta" sortKeyVal="delta" align="center" />
              <SortHeader label="SFDC ARR" sortKeyVal="arr" align="right" />
              <SortHeader label="SFDC State" sortKeyVal="state" />
              <th style={{ ...thStyle, textAlign: "center" }} title="ENR-reported state for the firm — compare against SFDC State for mismatches">ENR State</th>
              <th style={thStyle}>Trade</th>
              <th style={{ ...thStyle, textAlign: "center" }}>ENR Tag</th>
              <th style={thStyle}>Family</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <EnrRow key={m.enrFirm.enrRank2025} match={m} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
          onClick={() => {
            setShowExportModal(false);
            setExportError(false);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              padding: 24,
              width: 320,
            }}
          >
            <h3 style={{ margin: "0 0 12px", fontSize: 14 }}>Export CSV</h3>
            <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 12px" }}>
              Enter the RevOps export passcode to download.
            </p>
            <input
              type="password"
              value={exportPasscode}
              onChange={(e) => {
                setExportPasscode(e.target.value);
                setExportError(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && handleExport()}
              placeholder="Passcode"
              autoFocus
              style={{
                width: "100%",
                padding: 8,
                fontSize: 13,
                background: "var(--bg)",
                border: `1px solid ${exportError ? "var(--red)" : "var(--border)"}`,
                borderRadius: 6,
                color: "var(--text)",
                marginBottom: 12,
                boxSizing: "border-box",
              }}
            />
            {exportError && (
              <p style={{ fontSize: 11, color: "var(--red)", margin: "-8px 0 12px" }}>
                Incorrect passcode
              </p>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                onClick={() => {
                  setShowExportModal(false);
                  setExportError(false);
                }}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  background: "transparent",
                  border: "1px solid var(--border)",
                  borderRadius: 6,
                  color: "var(--muted)",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                style={{
                  padding: "6px 14px",
                  fontSize: 12,
                  background: "var(--kojo-yellow)",
                  border: "none",
                  borderRadius: 6,
                  color: "#000",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──

function EnrRow({ match: m }: { match: EnrMatch }) {
  const isUnmatched = m.kojoStatus === "Not in SFDC";
  const rowOpacity = isUnmatched ? (m.isIcp ? 0.6 : 0.4) : 1;

  // YoY rank movement. Lower rank number = better position.
  // 2024 rank greater than 2025 rank = firm moved up the list (improved).
  const r25 = m.enrFirm.enrRank2025;
  const r24 = m.enrFirm.enrRank2024;
  let rankDelta: { label: string; color: string } | null = null;
  if (r24 === null) {
    rankDelta = { label: "NEW", color: "var(--kojo-yellow)" };
  } else if (r24 > r25) {
    rankDelta = { label: `▲${r24 - r25}`, color: "var(--green)" };
  } else if (r24 < r25) {
    rankDelta = { label: `▼${r25 - r24}`, color: "var(--red)" };
  } else {
    rankDelta = { label: "—", color: "var(--muted)" };
  }

  // State comparison. Compare normalized values so "California" and "CA" don't flag.
  const sfdcState = m.matchedAccount?.billingState || "";
  const enrState = m.enrFirm.state || "";
  const stateMismatch =
    !!sfdcState &&
    !!enrState &&
    normalizeState(sfdcState) !== normalizeState(enrState);

  return (
    <tr
      style={{
        borderBottom: "1px solid var(--border)",
        opacity: rowOpacity,
      }}
    >
      <td style={tdStyle}>
        <div style={{ fontWeight: 500 }}>#{r25}</div>
        <div style={{ fontSize: 9, color: rankDelta.color, marginTop: 1 }}>
          {rankDelta.label}
          {r24 !== null && rankDelta.label !== "—" && (
            <span style={{ color: "var(--muted)", marginLeft: 4 }}>(was #{r24})</span>
          )}
        </div>
      </td>
      <td style={{ ...tdStyle, fontWeight: 500, color: "var(--text)" }}>
        {m.enrFirm.firmName}
      </td>
      <td style={tdStyle}>{m.enrFirm.firmType}</td>
      <td style={{ ...tdStyle, textAlign: "right", color: "var(--text)" }}>
        ${m.enrFirm.revenue2024Mil.toLocaleString(undefined, {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })}M
      </td>
      <td style={{ ...tdStyle, textAlign: "center" }}>
        <StatusBadge status={m.kojoStatus} isIcp={m.isIcp} />
      </td>
      <td style={{ ...tdStyle, textAlign: "center" }}>
        <MatchBadge confidence={m.matchConfidence} />
      </td>
      <td style={{ ...tdStyle, color: "var(--text)" }}>
        {m.matchedAccount ? (
          m.matchedAccount.accountUrl ? (
            <a
              href={m.matchedAccount.accountUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "var(--text)",
                textDecoration: "none",
                borderBottom: "1px dotted var(--muted)",
              }}
            >
              {m.matchedAccount.accountName}
            </a>
          ) : (
            m.matchedAccount.accountName
          )
        ) : (
          "—"
        )}
      </td>
      <td style={{ ...tdStyle, textAlign: "right", color: "var(--text)" }}>
        {m.sfdcRevenue ? fmtK(m.sfdcRevenue) : "—"}
      </td>
      <td style={{ ...tdStyle, textAlign: "center" }}>
        <DeltaCell pct={m.revenueDeltaPct} />
      </td>
      <td style={{ ...tdStyle, textAlign: "right", color: "var(--text)" }}>
        {m.sfdcArr ? fmtK(m.sfdcArr) : "—"}
      </td>
      <td
        style={{
          ...tdStyle,
          color: stateMismatch ? "var(--red)" : "var(--text)",
          fontWeight: stateMismatch ? 600 : 400,
        }}
        title={stateMismatch ? `SFDC says ${sfdcState}, ENR says ${enrState}` : undefined}
      >
        {sfdcState || "—"}
      </td>
      <td
        style={{
          ...tdStyle,
          textAlign: "center",
          color: stateMismatch ? "var(--red)" : "var(--muted)",
          fontWeight: stateMismatch ? 600 : 400,
        }}
        title={stateMismatch ? `SFDC says ${sfdcState}, ENR says ${enrState}` : undefined}
      >
        {enrState || "—"}
      </td>
      <td style={tdStyle}>{m.matchedAccount?.tradeDesignation || "—"}</td>
      <td style={{ ...tdStyle, textAlign: "center" }}>
        {m.matchedAccount ? (
          m.hasEnrTag ? (
            <span style={{ color: "var(--green)" }}>✓</span>
          ) : (
            <span style={{ color: "var(--red)" }}>✗</span>
          )
        ) : (
          "—"
        )}
      </td>
      <td style={{ ...tdStyle, fontSize: 10, color: "var(--muted)" }}>
        {m.family
          ? `${m.family.ultimateParentName} (${m.family.accountCount})`
          : "—"}
      </td>
    </tr>
  );
}

function StatusBadge({ status, isIcp }: { status: KojoStatus; isIcp: boolean }) {
  const config: Record<string, { bg: string; color: string }> = {
    Customer: { bg: "#22c55e22", color: "#4ade80" },
    Former: { bg: "#f59e0b22", color: "#fbbf24" },
    "Active Opp": { bg: "#3b82f622", color: "#60a5fa" },
    "Not in SFDC": { bg: "#47556922", color: "#64748b" },
  };
  const c = config[status];
  const label =
    status === "Not in SFDC" ? (isIcp ? "Not in SFDC (ICP)" : "Not in SFDC") : status;

  return (
    <span
      style={{
        background: c.bg,
        color: c.color,
        padding: "2px 8px",
        borderRadius: 10,
        fontSize: 10,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function MatchBadge({ confidence }: { confidence: MatchConfidence | null }) {
  if (!confidence) return <span style={{ color: "var(--muted)" }}>—</span>;
  const config: Record<MatchConfidence, { bg: string; color: string }> = {
    Tag: { bg: "#22c55e22", color: "#4ade80" },
    Manual: { bg: "#64748b33", color: "#94a3b8" },
    "Name+State": { bg: "#f59e0b22", color: "#fbbf24" },
    Name: { bg: "#f59e0b22", color: "#fbbf24" },
  };
  const c = config[confidence];
  return (
    <span style={{ background: c.bg, color: c.color, fontSize: 10, padding: "2px 6px", borderRadius: 4 }}>
      {confidence}
    </span>
  );
}

function DeltaCell({ pct }: { pct: number | null }) {
  // Rev Delta = (SFDC Rev - ENR Rev) / ENR Rev.
  // Negative delta = SFDC smaller than ENR = customer is bigger than we think
  //   = upsell opportunity (good). Larger magnitude = stronger signal.
  // Positive delta = SFDC larger than ENR = data concern, not an upsell signal (muted).
  if (pct === null) return <span style={{ color: "var(--muted)" }}>—</span>;
  let color = "var(--muted)";
  if (pct < -0.3) color = "var(--green)";
  else if (pct < -0.15) color = "var(--yellow)";
  return (
    <span style={{ color }}>
      {pct > 0 ? "+" : ""}
      {Math.round(pct * 100)}%
    </span>
  );
}

function FilterPill({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "2px 8px",
        fontSize: 10,
        background: "var(--border)",
        borderRadius: 10,
        color: "var(--text)",
      }}
    >
      {label}
      <button
        onClick={onRemove}
        style={{
          background: "none",
          border: "none",
          color: "var(--muted)",
          cursor: "pointer",
          padding: 0,
          fontSize: 12,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </span>
  );
}

function getActionNeeded(m: EnrMatch): string {
  const actions: string[] = [];
  if (m.revenueDeltaPct !== null && Math.abs(m.revenueDeltaPct) > 0.3) {
    actions.push("Update SFDC Revenue");
  }
  if (m.matchedAccount && !m.hasEnrTag) {
    actions.push("Add ENR Tag");
  }
  if (m.kojoStatus === "Not in SFDC" && m.isIcp) {
    actions.push("Prospect — ICP Match");
  }
  if (m.matchConfidence === "Name" || m.matchConfidence === "Name+State") {
    actions.push("Review Match");
  }
  return actions.join("; ");
}

// ── Styles ──

const thStyle: React.CSSProperties = {
  padding: "8px 10px",
  textAlign: "left",
  color: "var(--muted)",
  fontWeight: 600,
  fontSize: 10,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  whiteSpace: "nowrap",
};

const tdStyle: React.CSSProperties = {
  padding: "8px 10px",
  color: "var(--muted)",
};

const filterSelectStyle: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: 11,
  background: "var(--card)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--text)",
  minWidth: 120,
};
