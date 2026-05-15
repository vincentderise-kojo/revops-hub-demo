"use client";

import { useState, useMemo, useCallback } from "react";
import {
  AccountIntelligenceData,
  AccountFamily,
  SfdcAccount,
} from "@/lib/types-account-intelligence";
import { fmtK } from "@/lib/format";

interface Props {
  data: AccountIntelligenceData;
}

type TopN = 10 | 25 | 50 | 100 | "all";
type SortKey = "revenue" | "arr";
type SortDir = "asc" | "desc";

const TOP_N_OPTIONS: { label: string; value: TopN }[] = [
  { label: "Top 10", value: 10 },
  { label: "Top 25", value: 25 },
  { label: "Top 50", value: 50 },
  { label: "Top 100", value: 100 },
  { label: "All", value: "all" },
];

export default function TopCustomersView({ data }: Props) {
  const [topN, setTopN] = useState<TopN>(25);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAllChildren, setShowAllChildren] = useState<Set<string>>(new Set());

  // Filters
  const [industryFilter, setIndustryFilter] = useState<Set<string>>(new Set());
  const [stateFilter, setStateFilter] = useState<string>("");
  const [tradeOrgFilter, setTradeOrgFilter] = useState<string>("");
  const [enrStatusFilter, setEnrStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [ownerFilter, setOwnerFilter] = useState<string>("");
  const [search, setSearch] = useState("");

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const handleSort = useCallback(
    (key: SortKey) => {
      if (sortKey === key) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortKey(key);
        setSortDir("desc");
      }
    },
    [sortKey]
  );

  const toggleExpand = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const filtered = useMemo(() => {
    let families = data.families;

    // Industry filter
    if (industryFilter.size > 0) {
      families = families.filter((f) =>
        f.members.some((m) => m.industry && industryFilter.has(m.industry))
      );
    }

    // State filter
    if (stateFilter) {
      families = families.filter((f) => f.states.includes(stateFilter));
    }

    // Trade org filter
    if (tradeOrgFilter) {
      families = families.filter((f) => f.tradeOrgs.includes(tradeOrgFilter));
    }

    // ENR status
    if (enrStatusFilter === "enr") {
      families = families.filter((f) => f.enrRank !== null);
    } else if (enrStatusFilter === "not-enr") {
      families = families.filter((f) => f.enrRank === null);
    }

    // Account type
    if (typeFilter === "customer") {
      families = families.filter((f) => f.customerCount > 0);
    } else if (typeFilter === "prospect") {
      families = families.filter((f) => f.prospectCount > 0);
    }

    // Owner filter
    if (ownerFilter) {
      families = families.filter((f) =>
        f.members.some((m) => m.accountOwner === ownerFilter)
      );
    }

    // Search
    if (search) {
      const q = search.toLowerCase();
      families = families.filter(
        (f) =>
          f.ultimateParentName.toLowerCase().includes(q) ||
          f.members.some((m) => m.accountName.toLowerCase().includes(q))
      );
    }

    // Sort
    families = [...families].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "revenue") {
        cmp = a.rankingRevenue - b.rankingRevenue;
      } else {
        cmp = a.totalFamilyArr - b.totalFamilyArr;
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    // TopN
    if (topN !== "all") {
      families = families.slice(0, topN);
    }

    return families;
  }, [data.families, industryFilter, stateFilter, tradeOrgFilter, enrStatusFilter, typeFilter, ownerFilter, search, sortKey, sortDir, topN]);

  return (
    <div>
      {/* Top N Toggle */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginBottom: 16,
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "flex",
            gap: 2,
            background: "var(--bg)",
            borderRadius: 6,
            padding: 3,
          }}
        >
          {TOP_N_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              onClick={() => setTopN(opt.value)}
              style={{
                padding: "6px 14px",
                fontSize: 11,
                background: topN === opt.value ? "var(--card)" : "transparent",
                border: "none",
                borderRadius: 4,
                color: topN === opt.value ? "var(--kojo-yellow)" : "var(--muted)",
                fontWeight: topN === opt.value ? 600 : 400,
                cursor: "pointer",
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) {
              setIndustryFilter((prev) => {
                const next = new Set(prev);
                if (next.has(e.target.value)) next.delete(e.target.value);
                else next.add(e.target.value);
                return next;
              });
            }
          }}
          style={filterSelectStyle}
        >
          <option value="">Industry</option>
          {data.allIndustries.map((i) => (
            <option key={i} value={i}>
              {industryFilter.has(i) ? "✓ " : ""}{i}
            </option>
          ))}
        </select>

        <select
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
          style={filterSelectStyle}
        >
          <option value="">State</option>
          {data.allStates.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={tradeOrgFilter}
          onChange={(e) => setTradeOrgFilter(e.target.value)}
          style={filterSelectStyle}
        >
          <option value="">Trade Organization</option>
          {data.allTradeOrgs.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          value={enrStatusFilter}
          onChange={(e) => setEnrStatusFilter(e.target.value)}
          style={filterSelectStyle}
        >
          <option value="all">ENR Status</option>
          <option value="enr">On ENR Top 600</option>
          <option value="not-enr">Not on ENR</option>
        </select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          style={filterSelectStyle}
        >
          <option value="all">Account Type</option>
          <option value="customer">Customers</option>
          <option value="prospect">Prospects</option>
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

        <input
          type="text"
          placeholder="Search..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ ...filterSelectStyle, minWidth: 140 }}
        />

        <span style={{ fontSize: 11, color: "var(--muted)", marginLeft: "auto" }}>
          {filtered.length} families
        </span>
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
              <th style={{ ...thStyle, width: 24 }}></th>
              <th style={thStyle}>Rank</th>
              <th style={thStyle}>Customer / Parent Entity</th>
              <th
                onClick={() => handleSort("revenue")}
                style={{ ...thStyle, textAlign: "right", cursor: "pointer" }}
              >
                Annual Revenue
                {sortKey === "revenue" && (
                  <span style={{ marginLeft: 4 }}>{sortDir === "asc" ? "▲" : "▼"}</span>
                )}
              </th>
              <th style={{ ...thStyle, textAlign: "center" }}>Rev Source</th>
              <th
                onClick={() => handleSort("arr")}
                style={{ ...thStyle, textAlign: "right", cursor: "pointer" }}
              >
                Family ARR
                {sortKey === "arr" && (
                  <span style={{ marginLeft: 4 }}>{sortDir === "asc" ? "▲" : "▼"}</span>
                )}
              </th>
              <th style={{ ...thStyle, textAlign: "center" }}># Accts</th>
              <th style={{ ...thStyle, textAlign: "center" }}>Cust / Prospect</th>
              <th style={thStyle}>Trade(s)</th>
              <th style={thStyle}>State(s)</th>
              <th style={{ ...thStyle, textAlign: "center" }}>ENR Rank</th>
              <th style={thStyle}>Trade Orgs</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((family, idx) => {
              const isExpanded = expanded.has(family.ultimateParentId);
              const showAll = showAllChildren.has(family.ultimateParentId);
              const hasChildren = family.accountCount > 1;
              const visibleChildren = isExpanded
                ? showAll
                  ? family.members
                  : family.members.slice(0, 4)
                : [];
              const hiddenCount = family.members.length - 4;

              return (
                <ParentRow
                  key={family.ultimateParentId}
                  family={family}
                  rank={idx + 1}
                  isExpanded={isExpanded}
                  hasChildren={hasChildren}
                  visibleChildren={visibleChildren}
                  hiddenCount={hiddenCount}
                  showAll={showAll}
                  onToggle={() => toggleExpand(family.ultimateParentId)}
                  onShowAll={() =>
                    setShowAllChildren((prev) => {
                      const next = new Set(prev);
                      next.add(family.ultimateParentId);
                      return next;
                    })
                  }
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Sub-components ──

function ParentRow({
  family,
  rank,
  isExpanded,
  hasChildren,
  visibleChildren,
  hiddenCount,
  showAll,
  onToggle,
  onShowAll,
}: {
  family: AccountFamily;
  rank: number;
  isExpanded: boolean;
  hasChildren: boolean;
  visibleChildren: SfdcAccount[];
  hiddenCount: number;
  showAll: boolean;
  onToggle: () => void;
  onShowAll: () => void;
}) {
  return (
    <>
      <tr
        style={{
          borderBottom: "1px solid var(--border)",
          background: isExpanded ? "var(--bg)" : "transparent",
          cursor: hasChildren ? "pointer" : "default",
        }}
        onClick={hasChildren ? onToggle : undefined}
      >
        <td style={{ ...tdStyle, color: hasChildren ? "var(--kojo-yellow)" : "var(--border)" }}>
          {hasChildren ? (isExpanded ? "▼" : "▶") : "▶"}
        </td>
        <td style={{ ...tdStyle, fontWeight: 600, color: "var(--text)" }}>{rank}</td>
        <td style={{ ...tdStyle, fontWeight: 600, color: "var(--text)" }}>
          {family.ultimateParentName}
        </td>
        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600, color: "var(--text)" }}>
          {fmtK(family.rankingRevenue)}
        </td>
        <td style={{ ...tdStyle, textAlign: "center" }}>
          <RevSourceLabel source={family.revenueSource} />
        </td>
        <td
          style={{
            ...tdStyle,
            textAlign: "right",
            fontWeight: 600,
            color: "var(--kojo-yellow)",
          }}
        >
          {fmtK(family.totalFamilyArr)}
        </td>
        <td style={{ ...tdStyle, textAlign: "center", color: "var(--text)" }}>
          {family.accountCount}
        </td>
        <td style={{ ...tdStyle, textAlign: "center", color: "var(--text)" }}>
          {family.customerCount} / {family.prospectCount}
        </td>
        <td style={{ ...tdStyle, fontSize: 10 }}>
          {family.tradeDesignations.join(", ") || "—"}
        </td>
        <td style={{ ...tdStyle, fontSize: 10 }}>
          {family.states.join(", ") || "—"}
        </td>
        <td
          style={{
            ...tdStyle,
            textAlign: "center",
            color: family.enrRank ? "var(--kojo-yellow)" : "var(--muted)",
            fontWeight: family.enrRank ? 500 : 400,
          }}
        >
          {family.enrRank ? `#${family.enrRank}` : "—"}
        </td>
        <td style={{ ...tdStyle, fontSize: 10 }}>
          {family.tradeOrgs.slice(0, 3).join(", ") || "—"}
          {family.tradeOrgs.length > 3 && ` +${family.tradeOrgs.length - 3}`}
        </td>
      </tr>

      {/* Child rows */}
      {visibleChildren.map((child) => (
        <tr
          key={child.accountId}
          style={{
            borderBottom: "1px solid #111827",
            background: "#0f172a",
          }}
        >
          <td style={childTdStyle}></td>
          <td style={childTdStyle}></td>
          <td style={{ ...childTdStyle, paddingLeft: 28 }}>
            {child.accountName}
            <TypeBadge type={child.type} />
          </td>
          <td style={{ ...childTdStyle, textAlign: "right" }}>
            {child.annualRevenue > 0 ? fmtK(child.annualRevenue) : "—"}
          </td>
          <td style={childTdStyle}></td>
          <td style={{ ...childTdStyle, textAlign: "right" }}>
            {child.recurringArr > 0 ? fmtK(child.recurringArr) : "—"}
          </td>
          <td style={childTdStyle}></td>
          <td style={childTdStyle}></td>
          <td style={{ ...childTdStyle, fontSize: 10 }}>
            {child.tradeDesignation || "—"}
          </td>
          <td style={{ ...childTdStyle, fontSize: 10 }}>
            {child.billingState || "—"}
          </td>
          <td style={childTdStyle}></td>
          <td style={{ ...childTdStyle, fontSize: 10 }}>
            {child.accountOwner || "—"}
          </td>
        </tr>
      ))}

      {/* Show more link */}
      {isExpanded && !showAll && hiddenCount > 0 && (
        <tr style={{ background: "#0f172a" }}>
          <td style={childTdStyle}></td>
          <td style={childTdStyle}></td>
          <td
            colSpan={10}
            style={{
              ...childTdStyle,
              paddingLeft: 28,
              fontStyle: "italic",
              fontSize: 10,
              color: "var(--muted)",
              cursor: "pointer",
            }}
            onClick={(e) => {
              e.stopPropagation();
              onShowAll();
            }}
          >
            + {hiddenCount} more accounts in family
          </td>
        </tr>
      )}
    </>
  );
}

function RevSourceLabel({ source }: { source: string }) {
  const isProxy = source === "Proxy";
  return (
    <span
      style={{
        fontSize: 10,
        color: isProxy ? "var(--yellow)" : "var(--muted)",
      }}
    >
      {source}
      {isProxy && " ⚠"}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  let bg: string;
  let color: string;
  let label: string;

  if (type === "Customer - Active") {
    bg = "#22c55e22";
    color = "#4ade80";
    label = "Customer";
  } else if (type.toLowerCase().includes("churn") || type.toLowerCase().includes("cancel")) {
    bg = "#f59e0b22";
    color = "#fbbf24";
    label = "Churned";
  } else if (type.toLowerCase().includes("prospect")) {
    bg = "#8b5cf622";
    color = "#a78bfa";
    label = "Prospect";
  } else if (type.toLowerCase().includes("parent")) {
    bg = "#64748b22";
    color = "#94a3b8";
    label = "Parent";
  } else {
    bg = "#64748b22";
    color = "#94a3b8";
    label = type || "Unknown";
  }

  return (
    <span
      style={{
        background: bg,
        color,
        padding: "1px 6px",
        borderRadius: 8,
        fontSize: 9,
        marginLeft: 6,
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
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

const childTdStyle: React.CSSProperties = {
  padding: "6px 10px",
  color: "var(--muted)",
  fontSize: 11,
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
