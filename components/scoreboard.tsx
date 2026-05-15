import { DashboardState } from "@/lib/types";
import { fmtK, fmtGap, pctColor } from "@/lib/format";
import { getMonthlyPipelineGoal, WEEKS_PER_MONTH, GROUP_META, type GroupKey } from "@/lib/config";

// ── Hero row computation ──
const NON_AE_KEYS: GroupKey[] = ["bdr", "field", "perf"];

interface HeroData {
  created: number;
  target: number;
  gap: number;
  pctHit: number;
  status: "green" | "yellow" | "red";
  oppCount: number;
  subtitle: string;
  subLabel: string | null;
}

function computeHero(
  activeGroups: Set<GroupKey>,
  data: DashboardState,
  monthShort: string,
  monthGoal: ReturnType<typeof getMonthlyPipelineGoal>,
): HeroData {
  const blended = data.scoreboard.blended;
  const ae = data.scoreboard.aeUpside;
  const groups = data.scoreboard.groups;

  const activeNonAe = NON_AE_KEYS.filter((g) => activeGroups.has(g));
  const aeActive = activeGroups.has("ae");
  const allBoardPlan = activeNonAe.length === NON_AE_KEYS.length; // all 3 non-AE active

  function trafficLight(pct: number): "green" | "yellow" | "red" {
    if (pct >= 95) return "green";
    if (pct >= 70) return "yellow";
    return "red";
  }

  // All 4 active OR all non-AE active (AE-only or AE+non-AE handled below)
  if (allBoardPlan || (activeNonAe.length === NON_AE_KEYS.length && aeActive)) {
    return {
      created: blended.created,
      target: blended.target,
      gap: blended.gap,
      pctHit: blended.pctHit,
      status: blended.status,
      oppCount: blended.oppCount,
      subtitle: "How much pipeline did we create last week?",
      subLabel: monthGoal ? `${monthShort} goal ${fmtK(monthGoal.totalGoal)} ÷ 4.33 wks` : null,
    };
  }

  // AE-only mode
  if (aeActive && activeNonAe.length === 0) {
    const aeMonthly = ae.target * WEEKS_PER_MONTH;
    return {
      created: ae.created,
      target: ae.target,
      gap: ae.created - ae.target,
      pctHit: ae.pctHit,
      status: ae.status,
      oppCount: ae.oppCount,
      subtitle: "How much AE Self-Set pipeline did we create last week?",
      subLabel: `${monthShort} AE 10% stretch ${fmtK(aeMonthly)} ÷ 4.33 wks`,
    };
  }

  // Subset of non-AE (with or without AE — AE excluded from hero per B-mode rule)
  const nonAeGroupCards: Record<string, { created: number; target: number; oppCount: number }> = {
    bdr: groups.bdrOutbound,
    field: groups.fieldMarketing,
    perf: groups.perfMarketing,
  };

  const sumCreated = activeNonAe.reduce((s, g) => s + nonAeGroupCards[g].created, 0);
  const sumTarget = activeNonAe.reduce((s, g) => s + nonAeGroupCards[g].target, 0);
  const sumOppCount = activeNonAe.reduce((s, g) => s + nonAeGroupCards[g].oppCount, 0);
  const pct = sumTarget > 0 ? (sumCreated / sumTarget) * 100 : 0;

  let subtitle: string;
  let subLabel: string | null = null;

  if (activeNonAe.length === 1) {
    const solo = activeNonAe[0];
    const channelLabel = GROUP_META[solo].displayLabel;
    subtitle = `How much ${channelLabel} pipeline did we create last week?`;
    const channelMonthly = sumTarget * WEEKS_PER_MONTH;
    subLabel = `${monthShort} ${channelLabel} goal ${fmtK(channelMonthly)} ÷ 4.33 wks`;
  } else {
    subtitle = "How much pipeline did we create last week? (filtered)";
    subLabel = null;
  }

  return {
    created: sumCreated,
    target: sumTarget,
    gap: sumCreated - sumTarget,
    pctHit: pct,
    status: trafficLight(pct),
    oppCount: sumOppCount,
    subtitle,
    subLabel,
  };
}

export default function Scoreboard({
  data,
  activeGroups,
  onSolo,
  onReset,
}: {
  data: DashboardState;
  activeGroups: Set<GroupKey>;
  onSolo: (g: GroupKey) => void;
  onReset: () => void;
}) {
  const blended = data.scoreboard.blended;
  const groups = data.scoreboard.groups;
  const ae = data.scoreboard.aeUpside;

  if (!blended || !groups || !ae) {
    return <div className="card">Board-plan data not available.</div>;
  }

  // Monthly goal context for the weekly-target math subtitle
  const weekDate = new Date(data.focusWeekStart);
  const monthKey = `${weekDate.getFullYear()}-${String(weekDate.getMonth() + 1).padStart(2, "0")}`;
  const monthGoal = getMonthlyPipelineGoal(monthKey);
  const monthShort = weekDate.toLocaleString("en-US", { month: "short" });

  const hero = computeHero(activeGroups, data, monthShort, monthGoal);
  const heroColor = pctColor(hero.pctHit);

  return (
    <div className="card">
      {/* Row 1 — Hero (filter-aware) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div>
          <div className="label">Weekly Pipeline Creation</div>
          <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>
            {hero.subtitle}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
            Week of {data.focusWeekLabel}, {new Date(data.focusWeekStart).getFullYear()} · {hero.oppCount} opp{hero.oppCount === 1 ? "" : "s"} created · Board plan (AE Self-Set tracked separately)
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "var(--muted)" }}>Weekly target</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--teal)" }}>
            {fmtK(hero.target)}
          </div>
          {hero.subLabel && (
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
              {hero.subLabel}
            </div>
          )}
        </div>
      </div>

      {/* Hero created row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto auto", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "2px solid var(--border)" }}>
        <div style={{ flex: 1 }}>
          <div className="bar-bg">
            <div
              className="bar-fill"
              style={{ width: `${Math.min(hero.pctHit, 100)}%`, background: heroColor }}
            />
          </div>
        </div>
        <span style={{ fontSize: 24, fontWeight: 700, color: heroColor, minWidth: 80, textAlign: "right" }}>
          {fmtK(hero.created)}
          <span style={{ fontSize: 10, color: "var(--muted)", fontWeight: 400, marginLeft: 4 }}>
            · {hero.oppCount}
          </span>
        </span>
        <span style={{ fontSize: 12, color: "var(--muted)", minWidth: 60, textAlign: "right" }}>
          / {fmtK(hero.target)}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: hero.gap >= 0 ? "var(--green)" : "var(--red)", minWidth: 70, textAlign: "right" }}>
          {fmtGap(hero.gap)}
        </span>
        <span style={{ fontSize: 12, fontWeight: 600, color: heroColor, minWidth: 50, textAlign: "right" }}>
          {Math.round(hero.pctHit)}%
        </span>
      </div>

      {/* Row 2 — 4 clickable owner-group cards (BDR / Field / Perf / AE upside) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginTop: 12 }}>
        {([
          { key: "bdr"   as GroupKey, card: groups.bdrOutbound,    isUpside: false, label: groups.bdrOutbound.displayLabel,    color: groups.bdrOutbound.color },
          { key: "field" as GroupKey, card: groups.fieldMarketing, isUpside: false, label: groups.fieldMarketing.displayLabel, color: groups.fieldMarketing.color },
          { key: "perf"  as GroupKey, card: groups.perfMarketing,  isUpside: false, label: groups.perfMarketing.displayLabel,  color: groups.perfMarketing.color },
          { key: "ae"    as GroupKey, card: ae,                    isUpside: true,  label: ae.label,                           color: "var(--teal)" },
        ]).map(({ key, card, isUpside, label, color }) => {
          const isActive = activeGroups.has(key);
          const isSolo = activeGroups.size === 1 && activeGroups.has(key);
          return (
            <GroupMiniCard
              key={key}
              groupKey={key}
              label={label}
              owner={card.owner}
              color={color}
              created={card.created}
              target={card.target}
              pctHit={card.pctHit}
              oppCount={card.oppCount}
              status={card.status}
              isActive={isActive}
              isSolo={isSolo}
              upsideBadge={isUpside}
              onClick={() => {
                if (isSolo) onReset();
                else onSolo(key);
              }}
            />
          );
        })}
      </div>

      <div
        style={{
          marginTop: 14,
          paddingTop: 10,
          borderTop: "1px solid var(--border)",
          fontSize: 11,
          color: "var(--muted)",
        }}
      >
        <a
          href="https://docs.google.com/spreadsheets/d/14KUMyV6UXWrRlTe-Of-TbKzQtFTnzpIztGI_kO8T5rE/edit?gid=0#gid=0"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "var(--teal)", textDecoration: "none", fontWeight: 600 }}
        >
          ↗ Weekly Pipeline Review — Initiatives Tracker
        </a>
        <span style={{ marginLeft: 8, color: "var(--muted)" }}>
          Active projects, owners, and next steps per channel
        </span>
      </div>
    </div>
  );
}

function GroupMiniCard({
  groupKey: _groupKey,
  label,
  owner,
  color,
  created,
  target,
  pctHit,
  oppCount,
  status,
  isActive,
  isSolo,
  onClick,
  upsideBadge,
}: {
  groupKey: GroupKey;
  label: string;
  owner: string;
  color: string;
  created: number;
  target: number;
  pctHit: number;
  oppCount: number;
  status: "green" | "yellow" | "red";
  isActive: boolean;
  isSolo: boolean;
  onClick: () => void;
  upsideBadge?: boolean;
}) {
  const statusBg: Record<string, string> = {
    green: "var(--green)",
    yellow: "var(--yellow)",
    red: "var(--red)",
  };
  return (
    <button
      onClick={onClick}
      title={isSolo ? `Click to reset all channels` : `Click to focus on ${label} only`}
      style={{
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        fontFamily: "inherit",
        border: `1px solid ${isSolo ? color : "var(--border)"}`,
        borderLeft: `${isSolo ? 5 : 3}px solid ${color}`,
        borderRadius: 6,
        padding: "10px 12px",
        background: isSolo ? "rgba(255,255,255,0.04)" : "var(--bg-elevated, #141414)",
        opacity: isActive ? 1 : 0.55,
        transition: "all 120ms",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color, letterSpacing: 0.4, textTransform: "uppercase" }}>
          {label}
        </span>
        {upsideBadge ? (
          <span style={{ fontSize: 8, color: "var(--muted)", fontWeight: 600, letterSpacing: 0.6, padding: "2px 5px", border: "1px solid var(--border)", borderRadius: 3 }}>
            UPSIDE
          </span>
        ) : (
          <span style={{ width: 8, height: 8, borderRadius: 4, background: statusBg[status] }} />
        )}
      </div>
      <div style={{ fontSize: 9, color: "var(--muted)", marginTop: 2 }}>{owner}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
        <span style={{ fontSize: 18, fontWeight: 700, color: "var(--text)" }}>{fmtK(created)}</span>
        <span style={{ fontSize: 10, color: "var(--muted)" }}>/ {fmtK(target)}</span>
      </div>
      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
        {Math.round(pctHit)}% to target · {oppCount} opp{oppCount === 1 ? "" : "s"}
      </div>
    </button>
  );
}
