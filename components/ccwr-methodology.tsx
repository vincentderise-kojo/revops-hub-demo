import { CcwrSalesCycle } from "@/lib/types-ccwr";
import { COVERAGE_MULTIPLE } from "@/lib/config";

interface CcwrMethodologyProps {
  salesCycle: CcwrSalesCycle;
  ccwrTarget: number; // 0.17
}

export default function CcwrMethodology({ salesCycle, ccwrTarget }: CcwrMethodologyProps) {
  const targetPct = Math.round(ccwrTarget * 100);

  return (
    <>
      {/* 1. How CCWR is calculated */}
      <div className="card">
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>
          How CCWR is calculated
        </div>
        <div className="formula-box" style={{ marginBottom: 14 }}>
          <strong style={{ color: "var(--text)" }}>CCWR = Closed-Won ÷ Total Cohort</strong>
        </div>
        <DefItem
          term="Numerator"
          def="Count (or ARR) of opportunities that reached Closed Won, regardless of when they closed."
        />
        <DefItem
          term="Denominator"
          def="All opportunities in the cohort: Closed Won + Closed Lost + still Open. The cohort is fixed at entry — no opps are ever removed."
        />
        <DefItem
          term="Type"
          def={`Absolute rate, not resolved rate. Open opps stay in the denominator until they close. Example: 100 opps enter a cohort → 10 CW, 50 CL, 40 still open → CCWR = 10% (not 10÷60 = 17%). Target: ${targetPct}%.`}
        />
      </div>

      {/* 2. Cohort assignment */}
      <div className="card">
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>
          Cohort assignment
        </div>
        <DefItem
          term="Cohort date"
          def="An opportunity is assigned to a cohort based on its Discovery Date — the date it reaches Stage 2 (Discovery). This is the pipeline entry point."
        />
        <DefItem
          term="Permanence"
          def="Cohort assignment is permanent. Opportunities are never re-bucketed if their Discovery Date changes."
        />
        <DefItem
          term="Grouping"
          def="Cohorts are grouped by calendar month (e.g., Jan-25, Feb-25). All opps with a Discovery Date in the same month belong to the same cohort."
        />
      </div>

      {/* 3. Maturity threshold */}
      <div className="card">
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>
          Maturity threshold
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 14, lineHeight: 1.6 }}>
          Recent cohorts have artificially low CCWR because many deals are still open — they haven&apos;t had
          enough time to close. A cohort is considered &quot;maturing&quot; until it is at least as old as the
          average sales cycle. Maturing cohorts are excluded from trailing average calculations.
        </div>
        <div className="side-by-side" style={{ marginBottom: 14 }}>
          <div
            style={{
              background: "var(--bg)",
              borderRadius: 8,
              padding: 14,
              borderLeft: "3px solid var(--blue)",
            }}
          >
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--blue)", marginBottom: 6 }}>
              MidMarket — {salesCycle.mmDays} days
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>
              MM cohorts are flagged as maturing until they are at least {salesCycle.mmDays} days old.
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
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--teal)", marginBottom: 6 }}>
              Enterprise — {salesCycle.entDays} days
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.6 }}>
              ENT cohorts are flagged as maturing until they are at least {salesCycle.entDays} days old.
            </div>
          </div>
        </div>
        <DefItem
          term="Calculation"
          def="T12M mean from Closed Won opportunities — average days from Discovery Date to Close Date, computed separately for MM and ENT."
        />
        <DefItem
          term="Why T12M"
          def="A trailing 12-month window avoids skew from unusually fast or slow deals in a single quarter. Stable enough for a reliable threshold."
        />
        <DefItem
          term="All-segment view"
          def={`When viewing all segments together, the dashboard uses the higher (ENT) threshold — ${salesCycle.entDays} days — as a conservative floor to avoid surfacing immature cohorts.`}
        />
      </div>

      {/* 4. Dollar mode metrics */}
      <div className="card">
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>
          Dollar mode metrics
        </div>
        <DefItem
          term="Formula"
          def="CW Amount ÷ Total Amount. Both sides use the same SFDC Amount field — apples to apples."
        />
        <DefItem
          term="Amount field"
          def="The SFDC Amount field includes non-recurring revenue (one-time fees, accelerators, etc.) in addition to recurring contract value. This introduces some noise in the dollar figures compared to the count view."
        />
        <DefItem
          term="Count mode for clean signal"
          def="The # of opps view tells the conversion story without dollar noise — useful for capacity planning and understanding true conversion rates."
        />
      </div>

      {/* 5. 17% target */}
      <div className="card">
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>
          {targetPct}% target
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>
          The {targetPct}% CCWR target is the inverse of the{" "}
          <strong style={{ color: "var(--text)" }}>{COVERAGE_MULTIPLE}× coverage multiple</strong> used
          across the Pipeline Pulse dashboard. Luke Brown&apos;s pipeline model holds that for every{" "}
          {COVERAGE_MULTIPLE} dollars of pipeline created, Kojo closes 1 dollar. Inverting that ratio:{" "}
          1 ÷ {COVERAGE_MULTIPLE} = {(1 / COVERAGE_MULTIPLE * 100).toFixed(1)}%, rounded to {targetPct}%.
          When CCWR = {targetPct}%, the cohort model is calibrated with the pipeline coverage model. A CCWR
          above {targetPct}% means the team is closing at a better rate than the model assumes; below means
          more pipeline is needed per dollar of quota.
        </div>
      </div>

      {/* 6. Stage definitions */}
      <div className="card">
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>
          Stage definitions
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Outcome</th>
              <th style={{ textAlign: "left" }}>Stages</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ fontWeight: 600, color: "var(--green)", textAlign: "left" }}>Closed Won</td>
              <td style={{ textAlign: "left", fontSize: 11 }}>Closed Won</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600, color: "var(--red)", textAlign: "left" }}>Closed Lost</td>
              <td style={{ textAlign: "left", fontSize: 11 }}>Closed Lost</td>
            </tr>
            <tr>
              <td style={{ fontWeight: 600, color: "var(--muted)", textAlign: "left" }}>Open</td>
              <td style={{ textAlign: "left", fontSize: 11 }}>
                Discovery · Evaluation · Contracts/Negotiation · Final Approvals*
              </td>
            </tr>
          </tbody>
        </table>
        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 8 }}>
          * Final Approvals is a transient stage where deals spend very little time before closing.
        </div>
      </div>

      {/* 7. Segmentation */}
      <div className="card">
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>
          Segmentation
        </div>
        <DefItem
          term="Gate 1 — Revenue threshold"
          def="If the account's Annual Revenue is ≥ $75M, the opportunity is classified as ENT. Otherwise MM."
        />
        <DefItem
          term="Gate 2 — Manager override"
          def="Overrides Gate 1. Sean Coyle's opps → ENT. Jeremy Taylor's or Jared Moor's opps → MM. Manager gate takes precedence over the revenue threshold."
        />
      </div>

      {/* 8. Filter → SFDC field mapping */}
      <div className="card">
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>
          Filter → SFDC field mapping
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Filter</th>
              <th style={{ textAlign: "left" }}>SFDC Field</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ textAlign: "left", fontWeight: 500 }}>Segment</td>
              <td style={{ textAlign: "left", fontSize: 11, fontFamily: "monospace" }}>
                Annual Revenue + Manager (derived — not a native SFDC field)
              </td>
            </tr>
            <tr>
              <td style={{ textAlign: "left", fontWeight: 500 }}>Source</td>
              <td style={{ textAlign: "left", fontSize: 11, fontFamily: "monospace" }}>Opp Set Type</td>
            </tr>
            <tr>
              <td style={{ textAlign: "left", fontWeight: 500 }}>Owner</td>
              <td style={{ textAlign: "left", fontSize: 11, fontFamily: "monospace" }}>Opportunity Owner</td>
            </tr>
            <tr>
              <td style={{ textAlign: "left", fontWeight: 500 }}>SDR</td>
              <td style={{ textAlign: "left", fontSize: 11, fontFamily: "monospace" }}>SDR Owner</td>
            </tr>
            <tr>
              <td style={{ textAlign: "left", fontWeight: 500 }}>Team (manager)</td>
              <td style={{ textAlign: "left", fontSize: 11, fontFamily: "monospace" }}>Manager</td>
            </tr>
            <tr>
              <td style={{ textAlign: "left", fontWeight: 500 }}>Industry</td>
              <td style={{ textAlign: "left", fontSize: 11, fontFamily: "monospace" }}>
                Industry / Sub Industry*
              </td>
            </tr>
          </tbody>
        </table>
        <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 8 }}>
          * Industry vs Sub Industry mapping is under review (flagged for Luke). Some accounts may roll up
          differently depending on which field is populated.
        </div>
      </div>

      {/* 9. Data source */}
      <div className="card">
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 14 }}>
          Data source
        </div>
        <DefItem
          term="Source"
          def="Salesforce via Google Sheets. Coefficient runs a daily sync to keep the sheet current. New Business opportunities only; agora/test accounts excluded."
        />
        <DefItem
          term="Tab"
          def="pipeline tab (gid 1815244803) — same sheet used by Pipeline Pulse, Coverage, and Scenarios views."
        />
        <DefItem
          term="Trailing averages"
          def="Weighted by cohort size. Maturing cohorts (age < sales cycle threshold) are excluded. T3M, T6M, and T12M windows are all computed server-side."
        />
      </div>
    </>
  );
}

function DefItem({ term, def }: { term: string; def: string }) {
  return (
    <div className="def-item">
      <strong style={{ color: "var(--text)" }}>{term}:</strong> {def}
    </div>
  );
}
