"use client";

import { useMemo } from "react";
import { DashboardState, MtdMonth, MtdWeekRow } from "@/lib/types";
import { fmtK } from "@/lib/format";
import { WEEKS_PER_MONTH, GROUP_KEYS, GROUP_META, type GroupKey } from "@/lib/config";
import { computeMtdHeadline } from "@/lib/mtd-headline";

export default function MtdTracker({
  data,
  activeGroups,
  onToggleGroup,
}: {
  data: DashboardState;
  activeGroups: Set<GroupKey>;
  onToggleGroup: (g: GroupKey) => void;
}) {
  const { current, previous } = useMemo(() => {
    return {
      current: filterMonth(data.mtd.current, activeGroups),
      previous: filterMonth(data.mtd.previous, activeGroups),
    };
  }, [data.mtd.current, data.mtd.previous, activeGroups]);

  const headline = useMemo(
    () => computeMtdHeadline(activeGroups, data.mtd.current),
    [activeGroups, data.mtd.current]
  );

  // MoM callout math — driven by filtered values
  const curWeeksCompleted = current.weeks.filter((w) => w.created > 0 && !w.isCurrentWeek).length;
  const avgPerWeek = curWeeksCompleted > 0 ? current.totalCreated / curWeeksCompleted : 0;
  const projected = avgPerWeek * WEEKS_PER_MONTH;
  const remaining = WEEKS_PER_MONTH - curWeeksCompleted;
  const neededPerWeek = remaining > 0 ? (current.monthlyTarget - current.totalCreated) / remaining : 0;
  const monthShort = current.month.slice(0, 3);

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 6, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
            Month-to-Date Pipeline Creation
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)" }}>
            Cumulative weekly creation vs. Q2&apos;26 board plan monthly goal — where are the gaps building?
          </div>
        </div>
        <div style={{ textAlign: "right", whiteSpace: "nowrap" }}>
          <div style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.8, fontWeight: 600 }}>
            {monthShort} MTD
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, color: "var(--teal)", marginTop: 2 }}>
            {fmtK(headline.primaryCreated)}{" "}
            <span style={{ fontSize: 14, color: "var(--muted)", fontWeight: 500 }}>/</span>{" "}
            {fmtK(headline.primaryTarget)}{" "}
            <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>{headline.primaryLabel}</span>
            {headline.upsideAmount !== null && (
              <>
                {" "}
                <span style={{ color: "var(--muted)" }}>·</span>{" "}
                <span style={{ fontSize: 14, color: "var(--teal)" }}>+{fmtK(headline.upsideAmount)}</span>{" "}
                <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 500 }}>AE upside</span>
              </>
            )}
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
            {Math.round(current.pctHit)}% to {monthShort} {headline.primaryLabel === "AE upside" ? "AE" : "goal"} · {remaining.toFixed(1)} wks remain
          </div>
        </div>
      </div>

      {/* Channel pills */}
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 12 }}>
        <span style={{ fontSize: 10, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 0.4, marginRight: 4 }}>
          Channels
        </span>
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

      <div className="side-by-side">
        <MonthColumn month={previous} />
        <MonthColumn month={current} />
      </div>

      <div className="callout callout-yellow">
        <strong style={{ color: "var(--yellow)" }}>Month-over-month:</strong>{" "}
        {previous.month} closed at {fmtK(previous.totalCreated)} (
        {Math.round(previous.pctHit)}% of its {fmtK(previous.monthlyTarget)}{" "}
        {headline.primaryLabel === "AE upside" ? "AE stretch" : "board plan"} target)
        {previous.weeks.length >= 4 &&
          ` with a back-loaded build — weeks 3 and 4 produced ${fmtK(previous.weeks[2]?.created || 0)} and ${fmtK(previous.weeks[3]?.created || 0)}`}
        . {current.month} is at {fmtK(current.totalCreated)} through week{" "}
        {curWeeksCompleted} ({Math.round(current.pctHit)}% of{" "}
        {fmtK(current.monthlyTarget)} target). At current pace (~
        {fmtK(avgPerWeek)}/wk), {current.month} projects to ~
        {fmtK(projected)} — roughly {Math.round((projected / current.monthlyTarget) * 100)}%
        of target. To close the gap, the remaining {remaining.toFixed(1)} weeks
        need ~{fmtK(neededPerWeek)}/wk.
      </div>
    </div>
  );
}

function filterMonth(
  source: MtdMonth,
  activeGroups: Set<GroupKey>,
): MtdMonth {
  const aeOnly = activeGroups.size === 1 && activeGroups.has("ae");

  // AE-only mode: AE is the primary metric. Show AE creation in the table.
  if (aeOnly) {
    return {
      ...source,
      monthlyTarget: source.byGroup.ae.monthlyTarget,
      weeks: source.byGroup.ae.weeks,
      totalCreated: source.byGroup.ae.totalCreated,
      pctHit: source.byGroup.ae.monthlyTarget > 0
        ? (source.byGroup.ae.totalCreated / source.byGroup.ae.monthlyTarget) * 100
        : 0,
      gapToTarget: source.byGroup.ae.monthlyTarget - source.byGroup.ae.totalCreated,
    };
  }

  // Otherwise: only non-AE active groups appear in the table. AE is upside,
  // shown only in the headline callout — it never enters the board-plan tables.
  const NON_AE: GroupKey[] = GROUP_KEYS.filter((g) => g !== "ae");
  const nonAeActive = NON_AE.filter((g) => activeGroups.has(g));
  const allBoardPlan = nonAeActive.length === NON_AE.length;

  // Fast path — when ALL non-AE are active, the upstream MtdMonth's per-week
  // creation already excludes AE. Use it directly.
  if (allBoardPlan) {
    return source;
  }

  // Subset of non-AE active. Re-walk per-week from byGroup.
  const breakdowns = nonAeActive.map((g) => source.byGroup[g]);
  const weekCount = source.weeks.length;
  const weeks: MtdWeekRow[] = [];
  let cum = 0;
  for (let i = 0; i < weekCount; i++) {
    const created = breakdowns.reduce((s, b) => s + b.weeks[i].created, 0);
    const mmCreated = breakdowns.reduce((s, b) => s + b.weeks[i].mmCreated, 0);
    const entCreated = breakdowns.reduce((s, b) => s + b.weeks[i].entCreated, 0);
    cum += created;
    const ref = source.weeks[i];
    weeks.push({
      weekLabel: ref.weekLabel,
      weekStartIso: ref.weekStartIso,
      weekEndIso: ref.weekEndIso,
      created,
      mmCreated,
      entCreated,
      cumulative: cum,
      gapToTarget: 0, // backfilled below
      isFocusWeek: ref.isFocusWeek,
      isCurrentWeek: ref.isCurrentWeek,
    });
  }

  const totalCreated = weeks.reduce((s, w) => s + w.created, 0);
  const monthlyTarget = breakdowns.reduce((s, b) => s + b.monthlyTarget, 0);
  const pctHit = monthlyTarget > 0 ? (totalCreated / monthlyTarget) * 100 : 0;
  const gapToTarget = monthlyTarget - totalCreated;

  for (const w of weeks) {
    w.gapToTarget = monthlyTarget - w.cumulative;
  }

  return {
    ...source,
    monthlyTarget,
    totalCreated,
    pctHit,
    gapToTarget,
    weeks,
  };
}

function MonthColumn({ month }: { month: MtdMonth }) {
  const pct = Math.round(month.pctHit);
  const badgeClass =
    pct >= 80 ? "badge-green" : pct >= 50 ? "badge-yellow" : "badge-red";

  return (
    <div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--muted)",
          marginBottom: 8,
        }}
      >
        {month.month} {month.year}{" "}
        <span style={{ fontSize: 10, fontWeight: 400 }}>
          ({fmtK(month.monthlyTarget)} target)
        </span>
        <span className={`badge ${badgeClass}`} style={{ marginLeft: 8 }}>
          {pct}% — {fmtK(month.gapToTarget)} gap
        </span>
      </div>

      <table>
        <thead>
          <tr>
            <th style={{ textAlign: "left" }}>Week</th>
            <th>Created</th>
            <th>MM</th>
            <th>ENT</th>
            <th>MTD</th>
            <th>Gap</th>
          </tr>
        </thead>
        <tbody>
          {month.weeks.map((w, i) => (
            <WeekRow key={i} week={w} monthlyTarget={month.monthlyTarget} />
          ))}
          {/* Summary row */}
          <tr style={{ borderTop: "2px solid var(--border)" }}>
            <td style={{ fontSize: 10, fontWeight: 700, textAlign: "left" }}>Total</td>
            <td style={{ fontWeight: 700 }}>{fmtK(month.totalCreated)}</td>
            <td style={{ fontWeight: 700, color: "var(--blue)", fontSize: 10 }}>
              {fmtK(month.weeks.reduce((s, w) => s + w.mmCreated, 0))}
            </td>
            <td style={{ fontWeight: 700, color: "var(--teal)", fontSize: 10 }}>
              {fmtK(month.weeks.reduce((s, w) => s + w.entCreated, 0))}
            </td>
            <td style={{ fontWeight: 700 }}>{fmtK(month.totalCreated)}</td>
            <td style={{ fontWeight: 700, color: month.gapToTarget > 0 ? "var(--red)" : "var(--green)" }}>
              {fmtK(month.gapToTarget)}
            </td>
          </tr>
          {/* Remaining projection row for current month */}
          {month.weeks.some((w) => w.isFocusWeek) && (
            <tr style={{ borderTop: "1px dashed var(--border)" }}>
              <td
                colSpan={4}
                style={{
                  fontSize: 10,
                  color: "var(--muted)",
                  fontStyle: "italic",
                  textAlign: "left",
                }}
              >
                ~{(WEEKS_PER_MONTH - month.weeks.filter((w) => w.created > 0 && !w.isCurrentWeek).length).toFixed(1)}{" "}
                weeks remain → need{" "}
                {fmtK(
                  (month.monthlyTarget - month.totalCreated) /
                    Math.max(
                      WEEKS_PER_MONTH -
                        month.weeks.filter((w) => w.created > 0 && !w.isCurrentWeek).length,
                      0.1
                    )
                )}
                /wk to close gap
              </td>
              <td></td>
              <td></td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Progress bars */}
      <div style={{ marginTop: 8 }}>
        {month.weeks.map((w, i) => {
          if (w.created === 0 && !w.isFocusWeek) return null;
          const pctMtd = (w.cumulative / month.monthlyTarget) * 100;
          const mmPct =
            w.cumulative > 0
              ? (month.weeks
                  .slice(0, i + 1)
                  .reduce((s, wk) => s + wk.mmCreated, 0) /
                  w.cumulative) *
                100
              : 0;

          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 3,
              }}
            >
              <span
                style={{
                  fontSize: 9,
                  color: "var(--muted)",
                  width: 46,
                  textAlign: "right",
                }}
              >
                {w.weekLabel.split("–")[1]}
              </span>
              <div
                style={{
                  flex: 1,
                  height: 10,
                  background: "var(--bg)",
                  borderRadius: 3,
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(pctMtd, 100)}%`,
                    borderRadius: 3,
                    display: "flex",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${mmPct}%`,
                      background: "var(--blue)",
                    }}
                  />
                  <div
                    style={{
                      height: "100%",
                      flex: 1,
                      background: "var(--teal)",
                    }}
                  />
                </div>
              </div>
              <span
                style={{
                  fontSize: 9,
                  color: "var(--muted)",
                  width: 28,
                }}
              >
                {Math.round(pctMtd)}%
              </span>
            </div>
          );
        })}
        {/* Target reference line if current month */}
        {month.weeks.some((w) => w.isFocusWeek) && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              marginBottom: 3,
            }}
          >
            <span
              style={{
                fontSize: 9,
                color: "var(--muted)",
                width: 46,
                textAlign: "right",
              }}
            >
              Target
            </span>
            <div
              style={{
                flex: 1,
                height: 10,
                background: "var(--bg)",
                borderRadius: 3,
                border: "1px dashed #4ecdc444",
              }}
            />
            <span style={{ fontSize: 9, color: "var(--teal)", width: 28 }}>
              100%
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function WeekRow({
  week,
  monthlyTarget,
}: {
  week: MtdWeekRow;
  monthlyTarget: number;
}) {
  const gapPct = week.gapToTarget / monthlyTarget;
  // gapToTarget < 0 means cumulative has eclipsed the monthly target — show green
  // to mirror the total row's behavior. Otherwise size of remaining gap drives color.
  const gapColor =
    week.gapToTarget <= 0 ? "var(--green)" :
    gapPct > 0.5 ? "var(--red)" :
    gapPct > 0.2 ? "var(--yellow)" :
    "var(--text)";

  const rowOpacity = week.isCurrentWeek ? 0.5 : 1;

  return (
    <tr
      style={
        week.isFocusWeek ? { background: "#4ecdc408" } :
        week.isCurrentWeek ? { opacity: rowOpacity, fontStyle: "italic" } :
        undefined
      }
    >
      <td
        style={{
          fontSize: 10,
          textAlign: "left",
          ...(week.isFocusWeek
            ? { color: "var(--teal)", fontWeight: 600 }
            : week.isCurrentWeek
            ? { color: "var(--muted)" }
            : {}),
        }}
      >
        {week.weekLabel}
        {week.isFocusWeek && " ←"}
        {week.isCurrentWeek && " (in progress)"}
      </td>
      <td style={{ fontWeight: 600 }}>{fmtK(week.created)}</td>
      <td style={{ color: "var(--blue)", fontSize: 10 }}>
        {fmtK(week.mmCreated)}
      </td>
      <td style={{ color: "var(--teal)", fontSize: 10 }}>
        {fmtK(week.entCreated)}
      </td>
      <td style={{ fontWeight: 600 }}>{fmtK(week.cumulative)}</td>
      <td style={{ fontWeight: 600, color: gapColor }}>
        {fmtK(week.gapToTarget)}
      </td>
    </tr>
  );
}
