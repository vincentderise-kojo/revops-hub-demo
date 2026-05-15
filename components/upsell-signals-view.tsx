"use client";

import { useState, useMemo, useCallback } from "react";
import {
  AccountIntelligenceData,
  UpsellSignal,
  SignalStrength,
  SfdcAccount,
  DiscountHistory,
  GmvMotion,
} from "@/lib/types-account-intelligence";
import { AI_CONFIG, UPSELL_CONFIG, GMV_CONFIG } from "@/lib/config";
import { fmtK } from "@/lib/format";
import { computeUpsellHeroStats } from "@/lib/process-account-intelligence";
import { UpsellHeroStatsBar } from "./account-intelligence-dashboard";

interface Props {
  data: AccountIntelligenceData;
}

type SortKey =
  | "signalCount"
  | "familyName"
  | "arr"
  | "enrRank"
  | "sfdcRev"
  | "enrRev"
  | "revDelta"
  | "gmv"
  | "gmvRatio"
  | "contractAcr"
  | "discount"
  | "frequency";
type SortDir = "asc" | "desc";

const SIGNAL_OPTIONS: { label: string; value: string }[] = [
  { label: "All Signals", value: "all" },
  { label: "Strong", value: "strong" },
  { label: "Moderate", value: "moderate" },
  { label: "Weak", value: "weak" },
  { label: "No Data", value: "no-data" },
];

const VECTOR_OPTIONS: { label: string; value: string }[] = [
  { label: "All Vectors", value: "all" },
  { label: "Size Correction", value: "size" },
  { label: "Discount", value: "discount" },
  { label: "Billing", value: "billing" },
];

export default function UpsellSignalsView({ data }: Props) {
  const [signalFilter, setSignalFilter] = useState("all");
  const [vectorFilter, setVectorFilter] = useState("all");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [search, setSearch] = useState("");
  const [hideNoData, setHideNoData] = useState(false);

  const [sortKey, setSortKey] = useState<SortKey>("signalCount");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const [showExportModal, setShowExportModal] = useState(false);
  const [exportPasscode, setExportPasscode] = useState("");
  const [exportError, setExportError] = useState(false);

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir(key === "familyName" || key === "enrRank" ? "asc" : "desc");
      }
    },
    [sortKey]
  );

  const allOwners = useMemo(() => {
    const owners = new Set<string>();
    for (const s of data.upsellSignals) {
      for (const m of s.family.members) {
        if (m.accountOwner && m.type === "Customer - Active") {
          owners.add(m.accountOwner);
        }
      }
    }
    return [...owners].sort();
  }, [data.upsellSignals]);

  const filtered = useMemo(() => {
    let rows = data.upsellSignals;

    if (signalFilter !== "all") {
      rows = rows.filter((s) => s.overallSignal === signalFilter);
    }

    if (vectorFilter === "size") {
      rows = rows.filter((s) => s.sizeSignal === "strong" || s.sizeSignal === "moderate");
    } else if (vectorFilter === "discount") {
      rows = rows.filter((s) => s.discountSignal === "strong" || s.discountSignal === "moderate");
    } else if (vectorFilter === "billing") {
      rows = rows.filter((s) => s.termsSignal === "strong" || s.termsSignal === "moderate");
    }

    if (ownerFilter) {
      rows = rows.filter((s) =>
        s.family.members.some(
          (m) => m.accountOwner === ownerFilter && m.type === "Customer - Active"
        )
      );
    }

    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((s) =>
        s.family.ultimateParentName.toLowerCase().includes(q)
      );
    }

    if (hideNoData) {
      rows = rows.filter((s) => s.overallSignal !== "no-data");
    }

    rows = [...rows].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "signalCount":
          cmp = a.signalCount - b.signalCount;
          if (cmp === 0) cmp = a.totalFamilyArr - b.totalFamilyArr;
          break;
        case "familyName":
          cmp = a.family.ultimateParentName.localeCompare(b.family.ultimateParentName);
          break;
        case "arr":
          cmp = a.totalFamilyArr - b.totalFamilyArr;
          break;
        case "enrRank": {
          // Unranked (null) always sorts to the end regardless of direction
          if (a.enrRank === null && b.enrRank === null) return 0;
          if (a.enrRank === null) return 1;
          if (b.enrRank === null) return -1;
          const rankCmp = a.enrRank - b.enrRank;
          return sortDir === "asc" ? rankCmp : -rankCmp;
        }
        case "sfdcRev":
          cmp = a.sfdcRevenue - b.sfdcRevenue;
          break;
        case "enrRev":
          cmp = (a.enrRevenue || 0) - (b.enrRevenue || 0);
          break;
        case "revDelta":
          cmp = (a.revenueDeltaPct || 0) - (b.revenueDeltaPct || 0);
          break;
        case "gmv":
          cmp = (a.t12Gmv ?? -1) - (b.t12Gmv ?? -1);
          break;
        case "gmvRatio":
          cmp = (a.gmvToArRatio ?? -1) - (b.gmvToArRatio ?? -1);
          break;
        case "contractAcr":
          cmp = (a.contractAcr ?? -1) - (b.contractAcr ?? -1);
          break;
        case "discount":
          cmp = (a.currentDiscountPct || 0) - (b.currentDiscountPct || 0);
          break;

        case "frequency":
          cmp = (a.currentInvoiceFrequency || "").localeCompare(
            b.currentInvoiceFrequency || ""
          );
          break;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return rows;
  }, [data.upsellSignals, signalFilter, vectorFilter, ownerFilter, search, hideNoData, sortKey, sortDir]);

  // Hero stats reflect active filters so the numbers match the visible rows.
  const filteredHeroStats = useMemo(() => computeUpsellHeroStats(filtered), [filtered]);

  const handleExport = useCallback(() => {
    if (exportPasscode !== AI_CONFIG.exportPasscode) {
      setExportError(true);
      setExportPasscode("");
      return;
    }
    setShowExportModal(false);
    setExportPasscode("");
    setExportError(false);

    const headers = [
      "Overall Signal", "# Signals", "Customer / Parent", "State",
      "Original ARR", "Original ARR Source", "Current ARR", "ARR Growth", "Upsold?",
      "Captured Upsell ARR", "Recently Upsold", "Recent Upsell Date", "Recent Upsell ARR",
      "Renewal Pending", "Renewal Close Date",
      "ENR Rank",
      "SFDC Revenue", "ENR Revenue", "Rev Delta", "T12 GMV", "GMV/AR Ratio", "GMV Motion", "Stated ACR", "Stated ACR Δ%", "Stated ACR Source", "Quote Field ACR", "PDF ACR", "ACR Mismatch %", "Size Signal",
      "Active Products", "List BPS", "Actual BPS", "BPS Delta %",
      "Current Discount", "Original Discount", "Discount Signal",
      "Invoice Frequency", "Billing Signal",
      "Owner(s)", "Action Needed",
    ];

    const csvRows = filtered.map((s) => {
      const actions = getActionNeeded(s);
      const parent = s.family.members.find(
        (m) => m.accountName.toLowerCase() === s.family.ultimateParentName.toLowerCase()
      );
      return [
        s.overallSignal,
        `${s.signalCount}/3`,
        `"${s.family.ultimateParentName}"`,
        parent?.billingState || "",
        s.originalFamilyArr || "",
        s.originalArrSource,
        s.currentFamilyArr,
        s.arrGrowthPct !== null ? `${Math.round(s.arrGrowthPct * 100)}%` : "",
        s.hasBeenUpsold ? "Yes" : "No",
        s.capturedUpsellArr || "",
        s.isRecentlyUpsold ? "Yes" : "No",
        s.recentUpsellDate ?? "",
        s.recentUpsellArr || "",
        s.hasOpenRenewal ? "Yes" : "No",
        s.renewalCloseDate ?? "",
        s.enrRank ?? "",
        s.sfdcRevenue,
        s.enrRevenue ?? "",
        s.revenueDeltaPct !== null ? `${Math.round(s.revenueDeltaPct * 100)}%` : "",
        s.t12Gmv ?? "",
        s.gmvToArRatio !== null ? `${Math.round(s.gmvToArRatio * 100)}%` : "",
        s.gmvMotion,
        s.contractAcr ?? "",
        s.contractAcrDeltaPct !== null ? `${Math.round(s.contractAcrDeltaPct * 100)}%` : "",
        s.pdfStatedAcr !== null ? "PDF" : (s.contractAcr !== null ? "Quote" : ""),
        s.quoteFieldAcr ?? "",
        s.pdfStatedAcr ?? "",
        s.acrMismatchPct !== null ? `${Math.round(s.acrMismatchPct * 100)}%` : "",
        s.sizeSignal,
        `"${s.activeProducts.join(", ")}"`,
        s.listBps !== null ? s.listBps.toFixed(1) : "",
        s.actualBps !== null ? s.actualBps.toFixed(1) : "",
        s.bpsDeltaPct !== null ? `${Math.round(s.bpsDeltaPct * 100)}%` : "",
        s.currentDiscountPct !== null ? `${Math.round(s.currentDiscountPct * 100)}%` : "",
        s.originalDiscountPct !== null ? `${Math.round(s.originalDiscountPct * 100)}%` : "",
        s.discountSignal,
        s.currentInvoiceFrequency ?? "",
        s.termsSignal,
        `"${s.accountOwners.join(", ")}"`,
        `"${actions}"`,
      ].join(",");
    });

    const csv = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `upsell-signals-${new Date().toISOString().slice(0, 10)}.csv`;
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
        ...thStyle,
        textAlign: align,
        cursor: "pointer",
        userSelect: "none",
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
      {/* Hero Stats — filter-aware */}
      <UpsellHeroStatsBar stats={filteredHeroStats} />

      {/* GMV snapshot callout — static snapshot from Customer Summary */}
      {data.gmvSnapshot && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            background: "#0f172a",
            border: "1px solid var(--border)",
            borderRadius: 8,
            marginBottom: 12,
            fontSize: 11,
            color: "var(--muted)",
          }}
        >
          <span style={{ color: "var(--yellow)", fontWeight: 600 }}>GMV snapshot (static)</span>
          <span>
            T12 window through <strong style={{ color: "var(--text)" }}>{data.gmvSnapshot.windowEnd}</strong>.
            Matched <strong style={{ color: "var(--text)" }}>{data.gmvSnapshot.matchedFamilies}</strong> of{" "}
            {data.upsellSignals.length} families. Demo build — sourced from synthetic data generator.
          </span>
        </div>
      )}

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
          value={signalFilter}
          onChange={(e) => setSignalFilter(e.target.value)}
          style={filterSelectStyle}
        >
          {SIGNAL_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={vectorFilter}
          onChange={(e) => setVectorFilter(e.target.value)}
          style={filterSelectStyle}
        >
          {VECTOR_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          style={filterSelectStyle}
        >
          <option value="">Account Owner</option>
          {allOwners.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Search families..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...filterSelectStyle, minWidth: 160 }}
        />

        <label
          style={{
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
            color: "var(--muted)",
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={hideNoData}
            onChange={(e) => setHideNoData(e.target.checked)}
          />
          Hide no-data
        </label>

        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--muted)" }}>
            {filtered.length} of {data.upsellSignals.length}
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

      {/* How to use */}
      <div
        style={{
          fontSize: 11,
          color: "var(--muted)",
          lineHeight: 1.6,
          padding: "10px 14px",
          background: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 8,
          marginBottom: 12,
        }}
      >
        <div style={{ color: "var(--text)", fontWeight: 600, marginBottom: 6 }}>
          How to use
        </div>
        <ol style={{ margin: 0, paddingLeft: 20 }}>
          <li>
            Sort by <strong style={{ color: "var(--text)" }}>signal count</strong> to
            find customers with the most vectors firing at once.
          </li>
          <li>
            <strong style={{ color: "#4ade80" }}>Recently Upsold</strong> (green) means
            an Upsell closed-won in the last 12 months — the CSM already did the work,
            pricing is locked until renewal, and the billing/discount signals are
            dampened so these families don&apos;t crowd the top.
          </li>
          <li>
            <strong style={{ color: "#60a5fa" }}>Renewal Pending</strong> (blue) flags
            families with an open renewal opp — bundle upsell asks into the renewal
            rather than opening a separate thread.
          </li>
          <li>
            Original ARR is pulled from the first closed-won New Business opp when
            available, falling back to the Original ARR field on the account.
          </li>
          <li>
            Gray <strong>&quot;No Data&quot;</strong> rows mean we&apos;re missing
            information in Salesforce — flagging those for cleanup is part of the
            value.
          </li>
        </ol>
      </div>

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
              <SortHeader label="Signal" sortKeyVal="signalCount" align="center" />
              <th style={thStyle}># Signals</th>
              <SortHeader label="Customer / Parent" sortKeyVal="familyName" />
              <th style={{ ...thStyle, textAlign: "center" }} title="Billing state on the parent account (child rows show child state)">State</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Original ARR</th>
              <SortHeader label="Current ARR" sortKeyVal="arr" align="right" />
              <th style={{ ...thStyle, textAlign: "center" }}>Growth</th>
              <SortHeader label="ENR Rank" sortKeyVal="enrRank" align="center" />
              {/* Size Vector */}
              <th style={{ ...thStyle, ...sectionHeaderStyle }}>|</th>
              <SortHeader label="SFDC Rev" sortKeyVal="sfdcRev" align="right" />
              <SortHeader label="ENR Rev" sortKeyVal="enrRev" align="right" />
              <SortHeader label="Rev Delta" sortKeyVal="revDelta" align="center" />
              <SortHeader label="T12 GMV" sortKeyVal="gmv" align="right" />
              <SortHeader label="GMV / AR" sortKeyVal="gmvRatio" align="center" />
              <SortHeader label="Stated ACR" sortKeyVal="contractAcr" align="right" />
              <th style={{ ...thStyle, textAlign: "center" }}>Size</th>
              {/* Discount Vector */}
              <th style={{ ...thStyle, ...sectionHeaderStyle }}>|</th>
              <th style={{ ...thStyle, textAlign: "left" }}>Products</th>
              <th style={{ ...thStyle, textAlign: "right" }}>List BPS</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Actual BPS</th>
              <th style={{ ...thStyle, textAlign: "center" }}>BPS Δ</th>
              <SortHeader label="Discount" sortKeyVal="discount" align="right" />
              <th style={{ ...thStyle, textAlign: "right" }}>Original</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Disc.</th>
              {/* Billing Vector */}
              <th style={{ ...thStyle, ...sectionHeaderStyle }}>|</th>
              <SortHeader label="Frequency" sortKeyVal="frequency" />
              <th style={{ ...thStyle, textAlign: "center" }}>Billing</th>
              {/* Owner */}
              <th style={thStyle}>Owner(s)</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <UpsellRow
                key={s.family.ultimateParentId}
                signal={s}
                isExpanded={expanded.has(s.family.ultimateParentId)}
                onToggle={() => toggleExpand(s.family.ultimateParentId)}
              />
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

function UpsellRow({
  signal: s,
  isExpanded,
  onToggle,
}: {
  signal: UpsellSignal;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const isNoData = s.overallSignal === "no-data";
  // Identify the parent account (by name match) so we can exclude it from the
  // child list — otherwise the parent renders both as the header row and as a
  // child when expanded (e.g., Broadway Electric Service Company / Besko).
  const parentAccount = s.family.members.find(
    (m) => m.accountName.toLowerCase() === s.family.ultimateParentName.toLowerCase()
  );
  const childMembers = parentAccount
    ? s.family.members.filter((m) => m.accountId !== parentAccount.accountId)
    : s.family.members;
  const hasChildren = childMembers.length > 0;
  const parentUrl = parentAccount?.accountUrl ?? s.accountUrl;

  return (
    <>
      <tr
        style={{
          borderBottom: "1px solid var(--border)",
          opacity: isNoData ? 0.5 : 1,
          background: isExpanded ? "var(--bg)" : "transparent",
          cursor: hasChildren ? "pointer" : "default",
        }}
        onClick={hasChildren ? onToggle : undefined}
      >
        <td style={{ ...tdStyle, textAlign: "center" }}>
          <SignalBadge strength={s.overallSignal} />
        </td>
        <td style={{ ...tdStyle, textAlign: "center", fontWeight: 600, color: "var(--text)" }}>
          {s.signalCount}/3
        </td>
        <td style={{ ...tdStyle, fontWeight: 500, color: "var(--text)" }}>
          <span style={{ color: hasChildren ? "var(--kojo-yellow)" : "var(--border)", marginRight: 6, fontSize: 10 }}>
            {hasChildren ? (isExpanded ? "▼" : "▶") : "▶"}
          </span>
          {parentUrl ? (
            <a
              href={parentUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{ color: "var(--text)", textDecoration: "none", borderBottom: "1px dotted var(--muted)" }}
            >
              {s.family.ultimateParentName}
            </a>
          ) : (
            s.family.ultimateParentName
          )}
          {hasChildren && (
            <span style={{ fontSize: 10, color: "var(--muted)", marginLeft: 6 }}>
              (+{childMembers.length})
            </span>
          )}
          {s.isRecentlyUpsold && (
            <span
              title={s.recentUpsellDate ? `Upsold ${s.recentUpsellDate} (+${fmtK(s.recentUpsellArr)} ARR) — pricing locked until renewal` : undefined}
              style={{
                marginLeft: 8,
                padding: "1px 6px",
                fontSize: 9,
                background: "#22c55e22",
                color: "#4ade80",
                borderRadius: 8,
                whiteSpace: "nowrap",
              }}
            >
              Recently Upsold
            </span>
          )}
          {s.hasOpenRenewal && (
            <span
              title={s.renewalCloseDate ? `Renewal close date: ${s.renewalCloseDate}` : undefined}
              style={{
                marginLeft: 8,
                padding: "1px 6px",
                fontSize: 9,
                background: "#3b82f622",
                color: "#60a5fa",
                borderRadius: 8,
                whiteSpace: "nowrap",
              }}
            >
              Renewal Pending
            </span>
          )}
          <GmvMotionPill signal={s} />
        </td>
        <td style={{ ...tdStyle, textAlign: "center", color: "var(--muted)", fontSize: 10 }}>
          {parentAccount?.billingState || "-"}
        </td>
        <td style={{ ...tdStyle, textAlign: "right", color: "var(--muted)" }}>
          {s.originalFamilyArr > 0 ? fmtK(s.originalFamilyArr) : "\u2014"}
        </td>
        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: "var(--kojo-yellow)" }}>
          {fmtK(s.currentFamilyArr)}
        </td>
        <td style={{ ...tdStyle, textAlign: "center" }}>
          <ArrGrowthCell originalArr={s.originalFamilyArr} currentArr={s.currentFamilyArr} hasBeenUpsold={s.hasBeenUpsold} />
        </td>
        <td
          style={{
            ...tdStyle,
            textAlign: "center",
            color: s.enrRank ? "var(--kojo-yellow)" : "var(--muted)",
            fontWeight: s.enrRank ? 500 : 400,
          }}
        >
          {s.enrRank ? `#${s.enrRank}` : "\u2014"}
        </td>

        <td style={separatorTdStyle} />
        <td style={{ ...tdStyle, textAlign: "right", color: "var(--text)" }}>
          {fmtK(s.sfdcRevenue)}
        </td>
        <td style={{ ...tdStyle, textAlign: "right", color: "var(--text)" }}>
          {s.enrRevenue ? fmtK(s.enrRevenue) : "\u2014"}
        </td>
        <td style={{ ...tdStyle, textAlign: "center" }}>
          <DeltaCell pct={s.revenueDeltaPct} />
        </td>
        <td style={{ ...tdStyle, textAlign: "right", color: s.t12Gmv !== null ? "var(--text)" : "var(--muted)" }}>
          {s.t12Gmv !== null ? fmtK(s.t12Gmv) : "\u2014"}
        </td>
        <td style={{ ...tdStyle, textAlign: "center" }}>
          <GmvRatioCell ratio={s.gmvToArRatio} motion={s.gmvMotion} />
        </td>
        <td style={{ ...tdStyle, textAlign: "right" }}>
          {s.contractAcr !== null ? (
            <>
              <div style={{ fontWeight: 600 }}>
                ${(s.contractAcr / 1_000_000).toFixed(1)}M
              </div>
              <div style={{ fontSize: 10, color: "var(--muted)" }}>
                {s.pdfStatedAcr !== null ? "(PDF)" : "(Quote)"}
              </div>
              {s.contractAcrDeltaPct !== null && (
                <div
                  style={{
                    fontSize: 11,
                    color:
                      s.contractAcrDeltaPct > 0
                        ? "var(--kojo-green)"
                        : "var(--kojo-red)",
                  }}
                >
                  {s.contractAcrDeltaPct > 0 ? "+" : ""}
                  {Math.round(s.contractAcrDeltaPct * 100)}% vs SFDC
                </div>
              )}
              {s.acrMismatch && s.acrMismatchPct !== null && (
                <div style={{ fontSize: 10, color: "var(--kojo-yellow)" }} title={
                  `PDF \$${((s.pdfStatedAcr ?? 0) / 1_000_000).toFixed(1)}M vs Quote field \$${((s.quoteFieldAcr ?? 0) / 1_000_000).toFixed(1)}M`
                }>
                  ⚠ field Δ {s.acrMismatchPct > 0 ? "+" : ""}{Math.round(s.acrMismatchPct * 100)}%
                </div>
              )}
            </>
          ) : (
            <span
              style={{ color: "var(--muted)" }}
              title={
                s.contractAcrError === "no_signed_contract"
                  ? "No closed-won opp with synced quote"
                  : s.contractAcrError === "no_pdf"
                  ? "Latest signed contract has no PDF attached"
                  : s.contractAcrError === "acr_not_found"
                  ? "ACR line not found in PDF (older contract format)"
                  : s.contractAcrError === "sfdc_fetch_failed"
                  ? "SFDC fetch failed on last snapshot run — retry next refresh"
                  : "No contract data"
              }
            >
              —
            </span>
          )}
        </td>
        <td style={{ ...tdStyle, textAlign: "center" }}>
          <SignalBadge strength={s.sizeSignal} />
        </td>

        <td style={separatorTdStyle} />
        <td style={{ ...tdStyle, maxWidth: 220 }}>
          {s.activeProducts.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
              {s.activeProducts.map((p) => (
                <ProductPill key={p} product={p} />
              ))}
            </div>
          ) : (
            <span style={{ color: "var(--muted)" }}>{"\u2014"}</span>
          )}
        </td>
        <td style={{ ...tdStyle, textAlign: "right", color: "var(--muted)" }}>
          {s.listBps !== null ? s.listBps.toFixed(1) : "\u2014"}
        </td>
        <td style={{ ...tdStyle, textAlign: "right", color: "var(--text)" }}>
          {s.actualBps !== null ? s.actualBps.toFixed(1) : "\u2014"}
        </td>
        <td style={{ ...tdStyle, textAlign: "center" }}>
          <BpsDeltaCell deltaPct={s.bpsDeltaPct} />
        </td>
        <td style={{ ...tdStyle, textAlign: "right", color: "var(--text)" }}>
          {s.currentDiscountPct !== null ? `${Math.round(s.currentDiscountPct * 100)}%` : "\u2014"}
        </td>
        <td style={{ ...tdStyle, textAlign: "right", color: "var(--muted)" }}>
          {s.originalDiscountPct !== null ? `${Math.round(s.originalDiscountPct * 100)}%` : "\u2014"}
        </td>
        <td style={{ ...tdStyle, textAlign: "center" }}>
          <SignalBadge strength={s.discountSignal} />
        </td>

        <td style={separatorTdStyle} />
        <td style={{ ...tdStyle, color: s.isSubAnnual ? "var(--yellow)" : "var(--muted)" }}>
          {s.currentInvoiceFrequency ?? "\u2014"}
        </td>
        <td style={{ ...tdStyle, textAlign: "center" }}>
          <SignalBadge strength={s.termsSignal} />
        </td>

        <td style={{ ...tdStyle, fontSize: 10, color: "var(--muted)" }}>
          {s.accountOwners.join(", ") || "\u2014"}
        </td>
      </tr>

      {/* Expand panel — quadrant tile spans the full table above the child rows. */}
      {isExpanded && s.gmvMotion !== "no-data" && (
        <tr style={{ background: "#0f172a", borderBottom: "1px solid #111827" }}>
          <td colSpan={TOTAL_COLS} style={{ padding: "14px 18px" }}>
            <ExpandPanelQuadrantTile signal={s} />
          </td>
        </tr>
      )}

      {/* Expand panel — Contract Reference tile */}
      {isExpanded && (s.contractAcr !== null || s.contractAcrError) && (
        <tr style={{ background: "#0f172a", borderBottom: "1px solid #111827" }}>
          <td colSpan={TOTAL_COLS} style={{ padding: "0 18px 14px" }}>
            <div
              style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 16,
                marginTop: 12,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
                Contract Reference
              </div>
              {s.contractAcr !== null ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "6px 16px", fontSize: 12 }}>
                    <div style={{ color: "var(--muted)" }}>Stated ACR:</div>
                    <div style={{ fontWeight: 600 }}>
                      ${s.contractAcr.toLocaleString("en-US")}
                    </div>
                    <div style={{ color: "var(--muted)" }}>Signed date:</div>
                    <div>{s.contractAcrSignedDate ?? "—"}</div>
                    <div style={{ color: "var(--muted)" }}>Source PDF:</div>
                    <div>
                      {s.contractAcrSourceUrl ? (
                        <a
                          href={s.contractAcrSourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ color: "var(--teal)", textDecoration: "underline" }}
                        >
                          Open in Salesforce
                        </a>
                      ) : (
                        <span style={{ color: "var(--muted)" }}>—</span>
                      )}
                    </div>
                    <div style={{ color: "var(--muted)" }}>Parser:</div>
                    <div>
                      <code style={{ fontSize: 11 }}>{s.contractAcrMethod ?? "—"}</code>
                    </div>
                    {s.quoteFieldAcr !== null && (
                      <>
                        <div style={{ color: "var(--muted)" }}>Quote field:</div>
                        <div>
                          ${s.quoteFieldAcr.toLocaleString("en-US")}
                        </div>
                      </>
                    )}
                    {s.pdfStatedAcr !== null && (
                      <>
                        <div style={{ color: "var(--muted)" }}>PDF parse:</div>
                        <div>
                          ${s.pdfStatedAcr.toLocaleString("en-US")}
                        </div>
                      </>
                    )}
                  </div>
                  {s.acrMismatch && s.acrMismatchPct !== null && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: 8,
                        background: "var(--bg)",
                        borderLeft: "3px solid var(--kojo-yellow)",
                        borderRadius: 4,
                        fontSize: 11,
                        lineHeight: 1.5,
                      }}
                    >
                      <strong>Audit flag:</strong> Quote field and signed PDF disagree by{" "}
                      {s.acrMismatchPct > 0 ? "+" : ""}{Math.round(s.acrMismatchPct * 100)}%.{" "}
                      Usually means the Quote field was edited after signing, or the PDF was generated from a different revision.
                    </div>
                  )}
                  {s.contractAcrExcerpt && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 4 }}>Excerpt:</div>
                      <pre
                        style={{
                          fontSize: 11,
                          background: "var(--bg)",
                          padding: 8,
                          borderRadius: 4,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          maxHeight: 160,
                          overflow: "auto",
                          margin: 0,
                        }}
                      >
                        {s.contractAcrExcerpt}
                      </pre>
                    </div>
                  )}
                </>
              ) : (
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  No Stated ACR captured. Error:{" "}
                  <code style={{ fontSize: 11 }}>{s.contractAcrError}</code>.{" "}
                  {s.contractAcrError === "acr_not_found" &&
                    "PDF was downloaded but the Annual Construction Revenue line was not found (likely an older contract format)."}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}

      {/* Child rows — parent excluded to avoid duplicate row */}
      {isExpanded &&
        childMembers.map((child) => (
          <ChildRow key={child.accountId} account={child} discountHistory={s.discountHistory} />
        ))}
    </>
  );
}

// Full column count in the Upsell Signals table — used by the expand panel colSpan.
// Parent row: Signal, #Signals, Name, State, OrigARR, CurARR, Growth, ENRRank,
//   sep, SFDC Rev, ENR Rev, Rev Delta, T12 GMV, GMV/AR, Size,
//   sep, Products, List BPS, Actual BPS, BPS Δ, Discount, Original, Disc,
//   sep, Frequency, Billing, Owner = 27
const TOTAL_COLS = 27;

function ChildRow({ account, discountHistory }: { account: SfdcAccount; discountHistory: DiscountHistory[] }) {
  // Find opps for this specific account
  const accountOpps = discountHistory.filter(
    (d) => d.accountName.toLowerCase().trim() === account.accountName.toLowerCase().trim()
  );
  const latestOpp = accountOpps.length > 0 ? accountOpps[accountOpps.length - 1] : null;
  const firstOpp = accountOpps.length > 0 ? accountOpps[0] : null;

  return (
    <tr style={{ borderBottom: "1px solid #111827", background: "#0f172a" }}>
      {/* Signal + # Signals — empty for children */}
      <td style={childTdStyle} />
      <td style={childTdStyle} />
      {/* Name */}
      <td style={{ ...childTdStyle, paddingLeft: 28 }}>
        {account.accountUrl ? (
          <a
            href={account.accountUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "var(--text)", textDecoration: "none", borderBottom: "1px dotted var(--muted)" }}
          >
            {account.accountName}
          </a>
        ) : (
          <span style={{ color: "var(--text)" }}>{account.accountName}</span>
        )}
        <TypeBadge type={account.type} />
      </td>
      {/* State */}
      <td style={{ ...childTdStyle, textAlign: "center", fontSize: 10 }}>
        {account.billingState || "-"}
      </td>
      {/* Original ARR */}
      <td style={{ ...childTdStyle, textAlign: "right" }}>
        {account.originalArr > 0 ? fmtK(account.originalArr) : "\u2014"}
      </td>
      {/* Current ARR */}
      <td style={{ ...childTdStyle, textAlign: "right" }}>
        {account.recurringArr > 0 ? fmtK(account.recurringArr) : "\u2014"}
      </td>
      {/* Growth — empty for children */}
      <td style={childTdStyle} />
      {/* ENR Rank — empty */}
      <td style={childTdStyle} />
      {/* Size vector separator */}
      <td style={childTdStyle} />
      {/* SFDC Rev */}
      <td style={{ ...childTdStyle, textAlign: "right" }}>
        {account.annualRevenue > 0 ? fmtK(account.annualRevenue) : "\u2014"}
      </td>
      {/* ENR Rev + Rev Delta + T12 GMV + GMV/AR + Size Signal — empty on children */}
      <td style={childTdStyle} />
      <td style={childTdStyle} />
      <td style={childTdStyle} />
      <td style={childTdStyle} />
      <td style={childTdStyle} />
      {/* Discount vector separator */}
      <td style={childTdStyle} />
      {/* Products, List BPS, Actual BPS, BPS Δ — empty for children */}
      <td style={childTdStyle} />
      <td style={childTdStyle} />
      <td style={childTdStyle} />
      <td style={childTdStyle} />
      {/* Current Discount */}
      <td style={{ ...childTdStyle, textAlign: "right", color: "var(--text)" }}>
        {latestOpp?.discountPct != null ? `${Math.round(latestOpp.discountPct * 100)}%` : "\u2014"}
      </td>
      {/* Original Discount */}
      <td style={{ ...childTdStyle, textAlign: "right" }}>
        {firstOpp?.discountPct != null ? `${Math.round(firstOpp.discountPct * 100)}%` : "\u2014"}
      </td>
      {/* Discount Signal — empty for children */}
      <td style={childTdStyle} />
      {/* Billing vector separator */}
      <td style={childTdStyle} />
      {/* Invoice Frequency */}
      <td style={{ ...childTdStyle, color: "var(--text)" }}>
        {latestOpp?.invoiceFrequency ?? "\u2014"}
      </td>
      {/* Billing Signal — empty for children */}
      <td style={childTdStyle} />
      {/* Owner */}
      <td style={{ ...childTdStyle, fontSize: 10 }}>
        {account.accountOwner || "\u2014"}
      </td>
    </tr>
  );
}

function TypeBadge({ type }: { type: string }) {
  let bg: string;
  let color: string;
  let label: string;

  if (type === "Customer - Active") {
    bg = "#22c55e22"; color = "#4ade80"; label = "Customer";
  } else if (type.toLowerCase().includes("churn") || type.toLowerCase().includes("cancel")) {
    bg = "#f59e0b22"; color = "#fbbf24"; label = "Churned";
  } else if (type.toLowerCase().includes("prospect")) {
    bg = "#8b5cf622"; color = "#a78bfa"; label = "Prospect";
  } else if (type.toLowerCase().includes("parent")) {
    bg = "#64748b22"; color = "#94a3b8"; label = "Parent";
  } else {
    bg = "#64748b22"; color = "#94a3b8"; label = type || "Unknown";
  }

  return (
    <span style={{ background: bg, color, padding: "1px 6px", borderRadius: 8, fontSize: 9, marginLeft: 6, whiteSpace: "nowrap" }}>
      {label}
    </span>
  );
}

function ArrGrowthCell({ originalArr, currentArr, hasBeenUpsold }: { originalArr: number; currentArr: number; hasBeenUpsold: boolean }) {
  if (originalArr <= 0) return <span style={{ color: "var(--muted)" }}>{"\u2014"}</span>;
  const growthPct = (currentArr - originalArr) / originalArr;
  if (hasBeenUpsold) {
    return (
      <span
        style={{
          background: "#3b82f622",
          color: "#60a5fa",
          padding: "2px 8px",
          borderRadius: 10,
          fontSize: 10,
          whiteSpace: "nowrap",
        }}
      >
        +{Math.round(growthPct * 100)}% Upsold
      </span>
    );
  }
  if (Math.abs(growthPct) < 0.01) {
    return <span style={{ color: "var(--muted)", fontSize: 10 }}>Flat</span>;
  }
  return (
    <span style={{ color: growthPct > 0 ? "var(--green)" : "var(--red)", fontSize: 10 }}>
      {growthPct > 0 ? "+" : ""}{Math.round(growthPct * 100)}%
    </span>
  );
}

function SignalBadge({ strength }: { strength: SignalStrength }) {
  // Colors encode upsell opportunity, not risk:
  // strong = big opportunity (green), moderate = some opportunity (yellow),
  // weak = nothing to act on (muted gray), no-data = missing inputs (muted gray italic).
  const config: Record<SignalStrength, { bg: string; color: string; label: string; italic?: boolean }> = {
    strong: { bg: "#22c55e22", color: "#4ade80", label: "Strong" },
    moderate: { bg: "#f59e0b22", color: "#fbbf24", label: "Moderate" },
    weak: { bg: "#64748b22", color: "#94a3b8", label: "Weak" },
    "no-data": { bg: "#64748b22", color: "#94a3b8", label: "No Data", italic: true },
  };
  const c = config[strength];
  return (
    <span
      style={{
        background: c.bg,
        color: c.color,
        padding: "2px 8px",
        borderRadius: 10,
        fontSize: 10,
        whiteSpace: "nowrap",
        fontStyle: c.italic ? "italic" : "normal",
      }}
    >
      {c.label}
    </span>
  );
}

function ProductPill({ product }: { product: string }) {
  const config: Record<string, { bg: string; color: string; label: string }> = {
    Procurement: { bg: "#eab30822", color: "#facc15", label: "Proc" },
    AP: { bg: "#3b82f622", color: "#60a5fa", label: "AP" },
    InventoryManagement: { bg: "#8b5cf622", color: "#a78bfa", label: "Inv" },
    ToolTracking: { bg: "#14b8a622", color: "#2dd4bf", label: "Tool" },
    PreFab: { bg: "#22c55e22", color: "#4ade80", label: "PreFab" },
    ProCore: { bg: "#f9731622", color: "#fb923c", label: "ProCore" },
  };
  const c = config[product] ?? { bg: "#64748b22", color: "#94a3b8", label: product };
  return (
    <span
      title={product}
      style={{
        background: c.bg,
        color: c.color,
        padding: "1px 7px",
        borderRadius: 8,
        fontSize: 9,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {c.label}
    </span>
  );
}

function BpsDeltaCell({ deltaPct }: { deltaPct: number | null }) {
  if (deltaPct === null) return <span style={{ color: "var(--muted)" }}>{"\u2014"}</span>;
  // Positive delta = actual below list (pricing compression)
  // Negative delta = actual above list (premium pricing)
  let color = "var(--muted)";
  const pct = Math.round(deltaPct * 100);
  if (deltaPct > 0.3) color = "var(--red)";
  else if (deltaPct > 0.15) color = "var(--yellow)";
  else if (deltaPct < -0.05) color = "var(--green)";
  const sign = deltaPct > 0 ? "-" : "+"; // display as "below" or "above" list
  return (
    <span style={{ color, fontSize: 10 }}>
      {sign}{Math.abs(pct)}%
    </span>
  );
}

function GmvRatioCell({ ratio, motion }: { ratio: number | null; motion: GmvMotion }) {
  if (ratio === null) return <span style={{ color: "var(--muted)" }}>{"\u2014"}</span>;
  // Colors mirror the Rev Delta convention: motion = opportunity (green),
  // right-sized = neutral. Reprice = high GMV/AR (big opportunity to raise price).
  // Wallet Share = low GMV/AR (big opportunity to sell more).
  let color = "var(--muted)";
  if (motion === "reprice") color = "var(--green)";
  else if (motion === "wallet-share") color = "var(--yellow)";
  return (
    <span style={{ color, fontSize: 11 }}>
      {Math.round(ratio * 100)}%
    </span>
  );
}

function GmvMotionPill({ signal: s }: { signal: UpsellSignal }) {
  if (s.gmvMotion === "no-data" || s.gmvMotion === "right-sized") return null;
  const isReprice = s.gmvMotion === "reprice";
  const label = isReprice ? "Reprice" : "Wallet Share";
  const bg = isReprice ? "#22c55e22" : "#eab30822";
  const color = isReprice ? "#4ade80" : "#facc15";
  const ratioPct = s.gmvToArRatio !== null ? `${Math.round(s.gmvToArRatio * 100)}%` : "";
  const title = isReprice
    ? `GMV ${ratioPct} of AR — customer spends like a bigger company than SFDC shows. Investigate whether AR is stale before repricing.`
    : `GMV ${ratioPct} of AR — low platform penetration in a large customer. Wallet-share expansion opportunity.`;
  return (
    <span
      title={title}
      style={{
        marginLeft: 8,
        padding: "1px 6px",
        fontSize: 9,
        background: bg,
        color,
        borderRadius: 8,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function ExpandPanelQuadrantTile({ signal: s }: { signal: UpsellSignal }) {
  // Plot GMV/AR ratio (x) against ENR rev delta (y). Two shaded guide bands:
  // the 25–35% right-sized band on x, and the "accurate" zone on y (±15%).
  const ratio = s.gmvToArRatio ?? 0;
  const enrDelta = s.revenueDeltaPct;

  const width = 260;
  const height = 160;
  const pad = { top: 14, right: 14, bottom: 26, left: 40 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  // Scales auto-expand to fit outliers so e.g. Adams (GMV/AR 202%, ENR Δ +118%) doesn't clip.
  const xMax = Math.max(1.0, ratio * 1.15, 0.5);
  const yMax = Math.max(1.0, Math.abs(enrDelta ?? 0) * 1.15);
  const xScale = (v: number) => pad.left + (Math.min(v, xMax) / xMax) * plotW;
  const yScale = (v: number) => pad.top + plotH - ((Math.max(-yMax, Math.min(yMax, v)) + yMax) / (2 * yMax)) * plotH;

  const ratioPct = Math.round(ratio * 100);
  const deltaPct = enrDelta !== null ? Math.round(enrDelta * 100) : null;

  return (
    <div style={{ display: "flex", gap: 20, alignItems: "stretch", flexWrap: "wrap" }}>
      <svg width={width} height={height} style={{ background: "#020617", borderRadius: 6 }}>
        {/* Right-sized band (25–35% of AR) */}
        <rect
          x={xScale(GMV_CONFIG.lowerBand)}
          y={pad.top}
          width={xScale(GMV_CONFIG.upperBand) - xScale(GMV_CONFIG.lowerBand)}
          height={plotH}
          fill="#64748b22"
        />
        {/* Axes */}
        <line x1={pad.left} y1={pad.top + plotH} x2={pad.left + plotW} y2={pad.top + plotH} stroke="#334155" />
        <line x1={pad.left} y1={pad.top} x2={pad.left} y2={pad.top + plotH} stroke="#334155" />
        {/* Zero line for ENR delta */}
        <line x1={pad.left} y1={yScale(0)} x2={pad.left + plotW} y2={yScale(0)} stroke="#334155" strokeDasharray="3 3" />
        {/* Dot = this family */}
        {enrDelta !== null ? (
          <circle cx={xScale(ratio)} cy={yScale(enrDelta)} r={5} fill="#facc15" stroke="#020617" strokeWidth={1.5} />
        ) : (
          <line x1={xScale(ratio)} y1={pad.top} x2={xScale(ratio)} y2={pad.top + plotH} stroke="#facc15" strokeDasharray="2 3" />
        )}
        {/* Axis labels */}
        <text x={pad.left} y={height - 8} fontSize={9} fill="#94a3b8">GMV / AR →</text>
        <text x={pad.left + plotW} y={height - 8} fontSize={9} fill="#94a3b8" textAnchor="end">
          0 · {Math.round(GMV_CONFIG.lowerBand * 100)}–{Math.round(GMV_CONFIG.upperBand * 100)}% band · {Math.round(xMax * 100)}%
        </text>
        <text x={8} y={pad.top + 6} fontSize={9} fill="#94a3b8">ENR Δ</text>
        <text x={8} y={pad.top + 14} fontSize={9} fill="#64748b">+{Math.round(yMax * 100)}%</text>
        <text x={8} y={yScale(0) + 3} fontSize={9} fill="#64748b">0</text>
        <text x={8} y={pad.top + plotH - 2} fontSize={9} fill="#64748b">-{Math.round(yMax * 100)}%</text>
      </svg>
      <div style={{ minWidth: 200, display: "flex", flexDirection: "column", gap: 6, fontSize: 11, color: "var(--muted)" }}>
        <div style={{ color: "var(--text)", fontWeight: 600, fontSize: 12 }}>
          Size vector position
        </div>
        <div>
          GMV/AR <strong style={{ color: "var(--text)" }}>{ratioPct}%</strong>
          {" · "}
          {s.gmvMotion === "reprice" && <span style={{ color: "#4ade80" }}>Reprice zone</span>}
          {s.gmvMotion === "wallet-share" && <span style={{ color: "#facc15" }}>Wallet Share zone</span>}
          {s.gmvMotion === "right-sized" && <span style={{ color: "#94a3b8" }}>Right-sized</span>}
        </div>
        <div>
          ENR Δ {deltaPct !== null ? <strong style={{ color: "var(--text)" }}>{deltaPct > 0 ? "+" : ""}{deltaPct}%</strong> : <em>{"\u2014"}</em>}
        </div>
        {s.t12Gmv !== null && (
          <div style={{ fontSize: 10 }}>
            T12 GMV {fmtK(s.t12Gmv)} on AR {fmtK(s.sfdcRevenue)}
          </div>
        )}
        <div style={{ fontSize: 10, marginTop: 2 }}>
          Band {Math.round(GMV_CONFIG.lowerBand * 100)}–{Math.round(GMV_CONFIG.upperBand * 100)}% anchors to the 30% GMV/AR heuristic. Outside the band fires Size with the ENR delta via max().
        </div>
      </div>
    </div>
  );
}

function DeltaCell({ pct }: { pct: number | null }) {
  if (pct === null) return <span style={{ color: "var(--muted)" }}>{"\u2014"}</span>;
  // Rev Delta = (SFDC Rev - ENR Rev) / ENR Rev.
  // Negative delta = SFDC smaller than ENR = customer is bigger than we think
  //   = upsell opportunity (good). Larger magnitude = stronger signal.
  // Positive delta = SFDC larger than ENR = data concern, not an upsell signal (muted).
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

function getActionNeeded(s: UpsellSignal): string {
  const actions: string[] = [];
  if (s.isRecentlyUpsold) {
    actions.push(
      `Recently upsold${s.recentUpsellDate ? ` ${s.recentUpsellDate}` : ""} — monitor, pricing locked until renewal`
    );
  }
  if (s.hasOpenRenewal) {
    actions.push(
      `Renewal pending${s.renewalCloseDate ? ` (close ${s.renewalCloseDate})` : ""} — bundle upsell asks into renewal`
    );
  }
  if (s.gmvMotion === "reprice" && s.gmvToArRatio !== null) {
    actions.push(`Reprice — GMV ${Math.round(s.gmvToArRatio * 100)}% of AR; investigate AR and pricing`);
  } else if (s.gmvMotion === "wallet-share" && s.gmvToArRatio !== null) {
    actions.push(`Wallet Share — GMV ${Math.round(s.gmvToArRatio * 100)}% of AR; low platform penetration`);
  }
  if (s.sizeSignal === "strong" && s.gmvMotion !== "reprice" && s.gmvMotion !== "wallet-share") {
    actions.push("Update SFDC Revenue (delta >30%)");
  }
  if (s.discountSignal === "strong") {
    const pct = s.currentDiscountPct !== null ? Math.round(s.currentDiscountPct * 100) : "?";
    const yrs = s.contractVintageYears !== null ? s.contractVintageYears.toFixed(1) : "?";
    actions.push(`Review discount — ${pct}% in year ${yrs}`);
  } else if (s.discountSignal === "no-data") {
    actions.push("Missing discount data");
  }
  // Only push billing action if it's still a live signal after dampening
  if (s.isSubAnnual && s.currentInvoiceFrequency && !s.isRecentlyUpsold) {
    actions.push(`Convert to annual billing (currently ${s.currentInvoiceFrequency})`);
  }
  if (s.sizeSignal === "no-data" && s.discountSignal === "no-data" && !s.isRecentlyUpsold) {
    actions.push("Missing revenue data — update SFDC");
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

const sectionHeaderStyle: React.CSSProperties = {
  color: "var(--border)",
  textAlign: "center",
  padding: "8px 2px",
  fontSize: 10,
};

const childTdStyle: React.CSSProperties = {
  padding: "6px 10px",
  color: "var(--muted)",
  fontSize: 11,
};

const separatorTdStyle: React.CSSProperties = {
  padding: "8px 2px",
  color: "var(--border)",
  textAlign: "center",
  fontSize: 10,
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
