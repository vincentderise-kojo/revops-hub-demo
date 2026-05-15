import { SOURCE_CONFIGS, COVERAGE_MULTIPLE, WEEKS_PER_MONTH, getMonthlyQuota, getSourceWeeklyTarget, MONTHLY_PIPELINE_GOALS, AE_TARGET_INDEX } from "@/lib/config";
import { DashboardState } from "@/lib/types";
import { fmtK } from "@/lib/format";

interface MethodologyProps {
  data: DashboardState;
}

export default function Methodology({ data }: MethodologyProps) {
  // Derive month key from focus week start (serialized as ISO string)
  const fws = new Date(data.focusWeekStart);
  const monthKey = `${fws.getFullYear()}-${String(fws.getMonth() + 1).padStart(2, "0")}`;
  const quota = getMonthlyQuota(monthKey);

  const monthlyQuota = quota.totalQuota;
  const quarterlyQuota = monthlyQuota * 3;
  const weeklySourceAdj = SOURCE_CONFIGS.reduce((s, sc) => s + getSourceWeeklyTarget(sc, quarterlyQuota), 0);
  const expMonthlyCW = SOURCE_CONFIGS.reduce((s, sc) => {
    const qCw = quarterlyQuota * sc.cwShare;
    return s + (qCw / sc.winRate / 13) * sc.winRate;
  }, 0) * WEEKS_PER_MONTH;

  // Segment values from config
  const mmMonthlyQuota = quota.mmQuota;
  const entMonthlyQuota = quota.entQuota;
  const mmWeekly = (mmMonthlyQuota * COVERAGE_MULTIPLE) / WEEKS_PER_MONTH;
  const entWeekly = (entMonthlyQuota * COVERAGE_MULTIPLE) / WEEKS_PER_MONTH;
  const mmMonthlyCreation = mmMonthlyQuota * COVERAGE_MULTIPLE;
  const entMonthlyCreation = entMonthlyQuota * COVERAGE_MULTIPLE;

  return (
    <>
      {/* Coverage Math — Q2'26 Onwards */}
      <div className="card">
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>
          Coverage Math — Q2&apos;26 Onwards
        </div>
        <section style={{ marginTop: 0 }}>
          <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 8 }}>
            Pipeline Pulse&apos;s weekly target comes from the{" "}
            <strong>Q2&apos;26 board-committed pipeline plan</strong>
            {" "}(hardcoded in the app for the demo build), not from a coverage multiple. Each month Riley (BDR), Owen (Field), and Priya (Perf) commit bottoms-up
            creation goals; the board reviews and locks them quarterly. The blended weekly target is the
            current month&apos;s total goal divided by 4.33 weeks.
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 8 }}>
            <strong>AE Self-Set is excluded</strong> from the board plan total and tracked
            separately as upside, indexed at <strong>10% of the monthly board plan</strong>{" "}
            (BDR + Field + Perf). The <strong>AE 10%</strong> column above shows this stretch
            target month by month — it scales automatically as the board plan changes. The
            board plan total is what we report against; the AE 10% is the stretch we measure
            on top.
          </p>
          <table style={{ fontSize: 12, marginTop: 10, borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "4px 8px", borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>Month</th>
                <th style={{ textAlign: "right", padding: "4px 8px", borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>BDR</th>
                <th style={{ textAlign: "right", padding: "4px 8px", borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>Field</th>
                <th style={{ textAlign: "right", padding: "4px 8px", borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>Perf</th>
                <th style={{ textAlign: "right", padding: "4px 8px", borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>Total</th>
                <th style={{ textAlign: "right", padding: "4px 8px", borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>AE 10%</th>
                <th style={{ textAlign: "right", padding: "4px 8px", borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>Quota</th>
                <th style={{ textAlign: "right", padding: "4px 8px", borderBottom: "1px solid var(--border)", color: "var(--muted)" }}>Coverage</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(MONTHLY_PIPELINE_GOALS)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([monthKey, goal]) => {
                  const [y, m] = monthKey.split("-").map(Number);
                  const label = new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
                  const quotaForMonth = data.coverageDiagnostic?.quotaByMonth?.[monthKey];
                  const impliedForMonth = data.coverageDiagnostic?.impliedByMonth?.[monthKey];
                  return (
                    <tr key={monthKey}>
                      <td style={{ padding: "4px 8px" }}>{label}</td>
                      <td style={{ padding: "4px 8px", textAlign: "right" }}>{fmtK(goal.bdrOutbound)}</td>
                      <td style={{ padding: "4px 8px", textAlign: "right" }}>{fmtK(goal.fieldMarketing)}</td>
                      <td style={{ padding: "4px 8px", textAlign: "right" }}>{fmtK(goal.perfMarketing)}</td>
                      <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 700 }}>{fmtK(goal.totalGoal)}</td>
                      <td style={{ padding: "4px 8px", textAlign: "right", color: "var(--teal)" }}>
                        {fmtK(goal.totalGoal * AE_TARGET_INDEX)}
                      </td>
                      <td style={{ padding: "4px 8px", textAlign: "right", color: "var(--muted)" }}>
                        {quotaForMonth !== undefined ? fmtK(quotaForMonth) : "—"}
                      </td>
                      <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 600, color: "var(--teal)" }}>
                        {impliedForMonth !== undefined ? `${impliedForMonth.toFixed(2)}×` : "—"}
                      </td>
                    </tr>
                  );
                })}
              {/* July '26 preview row — Field + Perf committed, BDR TBD. Promote to MONTHLY_PIPELINE_GOALS once Sadie lands her commit. */}
              <tr style={{ opacity: 0.75 }}>
                <td style={{ padding: "4px 8px" }}>Jul 26</td>
                <td style={{ padding: "4px 8px", textAlign: "right", color: "var(--muted)" }}>TBD</td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>$290K</td>
                <td style={{ padding: "4px 8px", textAlign: "right" }}>$1.0M</td>
                <td style={{ padding: "4px 8px", textAlign: "right", fontWeight: 700, color: "var(--muted)" }}>TBD</td>
                <td style={{ padding: "4px 8px", textAlign: "right", color: "var(--muted)" }}>TBD</td>
                <td style={{ padding: "4px 8px", textAlign: "right", color: "var(--muted)" }}>—</td>
                <td style={{ padding: "4px 8px", textAlign: "right", color: "var(--muted)" }}>TBD</td>
              </tr>
            </tbody>
          </table>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8, fontStyle: "italic" }}>
            Quota = live AE monthly quota from the SFDC-synced quotas tab (excludes SDR and manager roll-ups).
            Coverage = Total Goal ÷ Quota.
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, fontStyle: "italic" }}>
            AE 10% stretch target was adopted in the 2026-04-27 pipeline review and applied
            going forward. Earlier months in the table show the math (10% × board plan) for
            consistency.
          </div>
          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4, fontStyle: "italic" }}>
            Monthly goals are hardcoded in the app for the demo build; the table is updated by hand as each month&apos;s commits land.
          </div>
          <p style={{ fontSize: 12, lineHeight: 1.6, marginTop: 10 }}>
            <strong>Segment split note.</strong> The board report commits monthly pipeline goals in
            total only — there&apos;s no MM / ENT breakdown in the deck. For the segment toggle on the
            Weekly Lookback tab, each segment&apos;s share of that month&apos;s AE quota is applied to the
            total goal (e.g. April: MM 43.8% = $831k, ENT 56.2% = $1,067k; sums back to $1,898k).
            Using the quota ratio keeps the segment split apples-to-apples with how the board already
            apportions segment capacity — we&apos;re not inventing a new allocation key, just reusing
            the one already signed off on.
          </p>
        </section>
      </div>

      {/* Implied Coverage vs. 5.8x Baseline */}
      <div className="card">
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>
          Implied Coverage vs. 5.8× Baseline
        </div>
        <section style={{ marginTop: 0 }}>
          <p style={{ fontSize: 13, lineHeight: 1.6, marginTop: 8 }}>
            The historical 5.8× coverage multiple assumes a <strong>17% Created-Cohort Win Rate</strong> —
            meaning for every $1 of quota, we need $5.80 of pipeline. The Q2&apos;26 board-committed plan
            implies a different multiple each month:
          </p>
          {data.coverageDiagnostic && (
            <div style={{ display: "flex", gap: 16, marginTop: 10, fontSize: 13, flexWrap: "wrap" }}>
              {Object.entries(data.coverageDiagnostic.impliedByMonth).map(([key, mult]) => (
                <div key={key}>
                  <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase" }}>{key}</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "var(--teal)" }}>{mult.toFixed(2)}×</div>
                </div>
              ))}
              <div>
                <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase" }}>Q2 Avg</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--teal)" }}>
                  {data.coverageDiagnostic.impliedQ2Avg.toFixed(2)}×
                </div>
              </div>
              <div>
                <div style={{ fontSize: 9, color: "var(--muted)", textTransform: "uppercase" }}>Baseline</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "var(--muted)" }}>
                  {data.coverageDiagnostic.historicalBaseline.toFixed(1)}×
                </div>
              </div>
            </div>
          )}
          <p style={{ fontSize: 12, lineHeight: 1.6, marginTop: 10, color: "var(--muted)" }}>
            When the implied multiple runs <em>below 5.8×</em>, the plan is banking on something to close the gap —
            higher-than-17% conversion, late-stage closes from existing open pipeline, or AE Self-Set upside.
            When it runs <em>at or above 5.8×</em>, the month&apos;s plan is consistent with historical conversion
            and doesn&apos;t require any tailwinds. April is the most aggressive month (implied well below baseline);
            June is the most conservative (roughly at baseline).
          </p>
          <p style={{ fontSize: 11, color: "var(--muted)", marginTop: 10 }}>
            Board goals loaded through: <strong>{data.meta?.lastLoadedGoalMonth ?? "—"}</strong>.
            Update <code>lib/config.ts</code> each quarter when the board finalizes the next plan.
          </p>
        </section>
      </div>

      {/* Source-level targets */}
      <div className="card">
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>
          How source-level weekly targets are derived
        </div>
        <p style={{ fontSize: 11, color: "var(--muted)", fontStyle: "italic", marginBottom: 10 }}>
          Retained for historical context — Q2&apos;26 targets now come from the board plan above.
        </p>
        <div
          style={{
            fontSize: 11,
            color: "var(--muted)",
            marginBottom: 14,
            lineHeight: 1.6,
          }}
        >
          Each source&apos;s target is back-calculated from its share of
          historical CW and its win rate. Targets are{" "}
          <strong style={{ color: "var(--text)" }}>not normalized</strong> —
          they sum to {fmtK(weeklySourceAdj)}/wk. If every source hits its target at its WR →
          ~{fmtK(expMonthlyCW)}/mo CW (≈{fmtK(monthlyQuota)} quota).
        </div>
        <div className="formula-box">
          <strong style={{ color: "var(--text)" }}>Formula:</strong>
          <br />
          Source quarterly CW need = Quarterly CW quota ({fmtK(quarterlyQuota)} at 100%) ×
          Source CW share
          <br />
          Source quarterly pipeline need = Source quarterly CW need ÷ Source win
          rate
          <br />
          Source weekly target = Source quarterly pipeline need ÷ 13 weeks
          <br />
          <strong style={{ color: "var(--text)" }}>
            No normalization applied.
          </strong>
        </div>
        <div
          style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10 }}
        >
          <strong style={{ color: "var(--text)" }}>Win rates</strong> calculated
          from 14.5 months (Jan &apos;25–Mar &apos;26). Closed Won ÷ (Closed
          Won + Closed Lost). Open opps excluded. Recent quarters
          underrepresented.
        </div>

        <table>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Source</th>
              <th style={{ textAlign: "left" }}>Group</th>
              <th>WR</th>
              <th>CW Share</th>
              <th>Q CW Need</th>
              <th>Q Pipe Need</th>
              <th>Wkly Target</th>
              <th>Exp CW/wk</th>
            </tr>
          </thead>
          <tbody>
            {SOURCE_CONFIGS.map((sc) => {
              const qCw = quarterlyQuota * sc.cwShare;
              const qPipe = qCw / sc.winRate;
              const weekly = qPipe / 13;
              const expCw = weekly * sc.winRate;
              const wrColor =
                sc.winRate >= 0.2
                  ? "var(--green)"
                  : sc.winRate >= 0.12
                    ? "var(--yellow)"
                    : "var(--red)";

              return (
                <tr key={sc.label}>
                  <td style={{ fontWeight: 500, textAlign: "left" }}>
                    {sc.label}
                  </td>
                  <td
                    className="muted"
                    style={{ fontSize: 10, textAlign: "left" }}
                  >
                    {sc.ownerGroup}
                  </td>
                  <td style={{ color: wrColor, fontWeight: 600 }}>
                    {(sc.winRate * 100).toFixed(1)}%
                  </td>
                  <td className="muted">
                    {(sc.cwShare * 100).toFixed(1)}%
                  </td>
                  <td className="muted">{fmtK(qCw)}</td>
                  <td className="muted">{fmtK(qPipe)}</td>
                  <td style={{ color: "var(--teal)", fontWeight: 600 }}>
                    {fmtK(weekly)}
                  </td>
                  <td
                    style={{ color: "var(--green)", fontSize: 10 }}
                  >
                    {fmtK(expCw)}
                  </td>
                </tr>
              );
            })}
            <tr style={{ borderTop: "2px solid var(--border)" }}>
              <td
                colSpan={6}
                style={{
                  fontWeight: 700,
                  fontSize: 12,
                  textAlign: "left",
                }}
              >
                Total
              </td>
              <td style={{ fontWeight: 700, color: "var(--teal)" }}>
                {fmtK(
                  SOURCE_CONFIGS.reduce((s, sc) => {
                    const qCw = quarterlyQuota * sc.cwShare;
                    return s + qCw / sc.winRate / 13;
                  }, 0)
                )}
              </td>
              <td
                style={{
                  fontWeight: 700,
                  color: "var(--green)",
                  fontSize: 10,
                }}
              >
                {fmtK(
                  SOURCE_CONFIGS.reduce((s, sc) => {
                    const qCw = quarterlyQuota * sc.cwShare;
                    return s + (qCw / sc.winRate / 13) * sc.winRate;
                  }, 0)
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Segment split */}
      <div className="card">
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>
          Segment split
        </div>
        <div className="side-by-side">
          <div
            style={{
              background: "var(--bg)",
              borderRadius: 8,
              padding: 14,
              borderLeft: "3px solid var(--blue)",
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--blue)",
                marginBottom: 6,
              }}
            >
              MidMarket — {fmtK(mmWeekly)}/week
            </div>
            <div
              style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}
            >
              Monthly quota: {fmtK(mmMonthlyQuota)} × {COVERAGE_MULTIPLE} = {fmtK(mmMonthlyCreation)} creation/mo
              → {fmtK(mmWeekly)}/wk. Manager
              gate: Kevin Brand. Close cycle ~30 days. Stale: &gt;40 days.
            </div>
          </div>
          <div
            style={{
              background: "var(--bg)",
              borderRadius: 8,
              padding: 14,
              borderLeft: "3px solid var(--teal)",
            }}
          >
            <div
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--teal)",
                marginBottom: 6,
              }}
            >
              Enterprise — {fmtK(entWeekly)}/week
            </div>
            <div
              style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}
            >
              Monthly quota: {fmtK(entMonthlyQuota)} ({fmtK(monthlyQuota)} total − {fmtK(mmMonthlyQuota)} MM) × {COVERAGE_MULTIPLE} = {fmtK(entMonthlyCreation)} creation/mo → {fmtK(entWeekly)}/wk. Manager gate: Patrick Yu. Close cycle ~90 days. Stale:
              &gt;90 days.
            </div>
          </div>
        </div>
      </div>

      {/* Source mapping */}
      <div className="card">
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>
          Source mapping (Opp Set Type)
        </div>
        <div
          style={{ fontSize: 11, color: "var(--muted)", marginBottom: 10 }}
        >
          Pipeline source is determined by the{" "}
          <strong style={{ color: "var(--text)" }}>Opp Set Type</strong> field
          in Salesforce (not Opportunity Source).
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Label</th>
              <th style={{ textAlign: "left" }}>SFDC Opp Set Type</th>
              <th style={{ textAlign: "left" }}>Context</th>
            </tr>
          </thead>
          <tbody>
            <SourceMapRow
              label="SDR Outbound"
              sfdc="SDR Set - Outbound"
              ctx="Volume play. 1.5 effective FTEs. Molly (3/1) and Misha (3/10) ramping."
            />
            <SourceMapRow
              label="Inbound"
              sfdc="AE Set - Inbound + SDR Set - Inbound"
              ctx="Highest WR. Priya Banerjee owns demand gen spend."
            />
            <SourceMapRow
              label="Events"
              sfdc="Event"
              ctx="Seasonal. 82–89% first-time accounts."
            />
            <SourceMapRow
              label="6sense/Warmly"
              sfdc="6s"
              ctx="Intent signal-driven outbound. Volatile week-to-week."
            />
            <SourceMapRow
              label="AE Self-Set"
              sfdc="AE - Self Set"
              ctx="Second-highest WR. Low-volume, high-quality."
            />
            <SourceMapRow
              label="Partner"
              sfdc="Partner"
              ctx="Owen Hartwell building channel. Small sample, strong conversion."
            />
            <SourceMapRow
              label="Webinar"
              sfdc="Webinar"
              ctx="Small volume. Tracked separately from Events."
            />
          </tbody>
        </table>
      </div>

      {/* Definitions */}
      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>
          Definitions
        </div>
        <DefItem
          term="Pipeline entry"
          def="Opportunity reaches Stage = Discovery. Discovery Date field used directly from SFDC (day-level)."
        />
        <DefItem
          term="Amount"
          def="SFDC Amount field. Auto-populated from Annual Construction Volume."
        />
        <DefItem term="Week" def="Monday through Sunday." />
        <DefItem
          term="MTD"
          def="Calendar month, clipped to month boundaries."
        />
        <DefItem
          term="Segment"
          def="Two-gate: Annual Revenue ≥$75M = ENT, else MM. Manager override: Patrick Yu → ENT, Kevin Brand → MM."
        />
        <div className="def-item" style={{ marginTop: 8 }}>
          <strong style={{ color: "var(--text)" }}>Data:</strong> Synthetic demo data (mirrors production structure from SFDC via Sheets sync) · New
          Business · Discovery Date as column · Excludes test accounts.
        </div>
      </div>
    </>
  );
}

function SourceMapRow({
  label,
  sfdc,
  ctx,
}: {
  label: string;
  sfdc: string;
  ctx: string;
}) {
  return (
    <tr>
      <td style={{ fontWeight: 500, textAlign: "left" }}>{label}</td>
      <td
        className="muted"
        style={{ fontSize: 10, textAlign: "left", fontFamily: "monospace" }}
      >
        {sfdc}
      </td>
      <td
        className="muted"
        style={{ fontSize: 10, textAlign: "left", lineHeight: 1.4 }}
      >
        {ctx}
      </td>
    </tr>
  );
}

function DefItem({ term, def }: { term: string; def: string }) {
  return (
    <div className="def-item">
      <strong style={{ color: "var(--text)" }}>{term}:</strong> {def}
    </div>
  );
}
