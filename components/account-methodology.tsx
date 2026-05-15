"use client";

import { AI_CONFIG } from "@/lib/config";

export default function AccountMethodology() {
  return (
    <div style={{ maxWidth: 800, color: "var(--text)", lineHeight: 1.7 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>
        Methodology & Data Sources
      </h2>

      <Section title="Data Sources">
        <Table
          headers={["Source", "Tab / File", "Rows", "Refresh"]}
          rows={[
            ["ENR Top 600", "Static JSON in repo", "600", "Annual (~October)"],
            [
              "Customer Accounts",
              "Google Sheet (GID 1925406595)",
              "~985",
              "Coefficient daily sync",
            ],
            [
              "Hierarchy / Prospects",
              "Google Sheet (GID 1703881391)",
              "~840",
              "Coefficient daily sync",
            ],
            [
              "Pipeline Opps (New Business)",
              "Google Sheet (GID 1815244803)",
              "Shared with Pipeline Pulse",
              "Coefficient hourly sync",
            ],
            [
              "Renewals & Upsells",
              "Google Sheet (GID 931327785)",
              "~1,615",
              "Coefficient daily sync",
            ],
          ]}
        />
      </Section>

      <Section title="ENR Matching Logic">
        <p>Each ENR firm is matched to SFDC accounts using a priority-based system:</p>
        <ol style={{ paddingLeft: 20, fontSize: 13 }}>
          <li style={{ marginBottom: 8 }}>
            <strong>Trade Org Tag (highest confidence):</strong> The account has{" "}
            <code style={codeStyle}>{AI_CONFIG.enrTagIdentifier}</code> in its Trade
            Organization Chapter List. This is a human-verified match.
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Manual Override:</strong> A manually maintained config file maps known
            name mismatches (e.g., &quot;POWER DESIGN&quot; → &quot;Power Design - St.
            Petersburg&quot;).
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Name + State Match:</strong> Normalized firm name matches a normalized
            SFDC account name, AND the state matches. Normalization strips punctuation and
            common suffixes (Inc., LLC, Corp., etc.).
          </li>
          <li style={{ marginBottom: 8 }}>
            <strong>Name-Only Match (lowest confidence):</strong> Name matches but state
            does not match or is missing. These should be reviewed manually.
          </li>
        </ol>
      </Section>

      <Section title="Kojo Status Assignment">
        <Table
          headers={["Status", "Condition"]}
          rows={[
            ["Customer", 'Matched account Type = "Customer - Active"'],
            ["Former", "Matched account Type contains Churned or Cancelled"],
            ["Active Opp", "Open pipeline opportunity found for firm (Discovery, Evaluation, Contracts/Negotiation, Final Approvals)"],
            ["Not in SFDC", "No match found in customer accounts or pipeline"],
          ]}
        />
      </Section>

      <Section title="ICP Classification">
        <p>
          Firms with status &quot;Not in SFDC&quot; are classified as ICP (Ideal Customer
          Profile) or non-ICP based on their ENR Firm Type:
        </p>
        <p>
          <strong>Non-ICP types:</strong>{" "}
          {AI_CONFIG.nonIcpFirmTypes.join(", ")} (Utility, Other, Abatement, Excavation)
        </p>
        <p>
          For combo types like E/U, the firm is ICP if <em>any</em> component type is ICP.
        </p>
      </Section>

      <Section title="Parent Hierarchy Resolution">
        <ol style={{ paddingLeft: 20, fontSize: 13 }}>
          <li style={{ marginBottom: 8 }}>
            Customer accounts and hierarchy/prospect accounts are merged into a unified map.
          </li>
          <li style={{ marginBottom: 8 }}>
            For accounts with a &quot;Ultimate Parent Co&quot; field (manually maintained),
            that value is used directly for family grouping.
          </li>
          <li style={{ marginBottom: 8 }}>
            For other accounts, Parent Account ID chains are traced to find the ultimate
            parent. The chain stops when no further parent exists in the dataset.
          </li>
          <li style={{ marginBottom: 8 }}>
            All accounts sharing an ultimate parent form a &quot;family.&quot;
          </li>
        </ol>
      </Section>

      <Section title="Revenue Ranking">
        <Table
          headers={["Revenue Source", "Condition"]}
          rows={[
            ["Parent Acct", "Ultimate parent exists in dataset and has Annual Revenue > 0"],
            ["Own Acct", "Standalone account (no parent, single-account family)"],
            ["Ultimate Parent", "Resolved via manual Ultimate Parent Co field, parent record found with revenue"],
            ["Proxy ⚠", "Parent not in dataset or has $0 revenue — uses max child Annual Revenue as proxy"],
          ]}
        />
      </Section>

      <Section title="Revenue Delta Thresholds">
        <Table
          headers={["Color", "Delta Range", "Meaning"]}
          rows={[
            ["Green", "< 15%", "SFDC revenue is accurate relative to ENR"],
            ["Yellow", "15% – 30%", "SFDC revenue is off — worth reviewing"],
            ["Red", "> 30%", "SFDC revenue is significantly wrong — action needed"],
          ]}
        />
      </Section>

      <Section title="CSV Export — Action Needed Column">
        <Table
          headers={["Action", "Trigger"]}
          rows={[
            ["Update SFDC Revenue", "Revenue delta > 30%"],
            ["Add ENR Tag", "Account matched but missing ENR Top 600 | 2025 tag"],
            ["Prospect — ICP Match", "ENR firm not in SFDC, firm type is ICP"],
            ["Review Match", "Fuzzy match (Name or Name+State) — needs human confirmation"],
          ]}
        />
      </Section>

      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, marginTop: 40 }}>
        Upsell Signals
      </h2>

      <Section title="Overview">
        <p>
          The Upsell Signals tab surfaces renewal pricing opportunities across the
          customer book using three data-driven vectors. Each customer family is scored
          on a simple scale: <strong>strong</strong> (action needed),{" "}
          <strong>moderate</strong> (worth reviewing), and <strong>weak</strong>{" "}
          (currently fine). Gray &quot;No Data&quot; rows mean we&apos;re missing
          information in Salesforce — flagging those for cleanup is part of the value.
        </p>
        <p>
          Maps to the core pricing formula:
        </p>
        <pre style={{ ...codeStyle, display: "block", padding: "10px 12px", whiteSpace: "pre", overflowX: "auto", fontSize: 11, lineHeight: 1.6 }}>
{`Procurement List Price = BPS × Annual Revenue
ACV (deal level)       = (BPS × Annual Revenue) + Add-On Products
Final Price            = ACV × (1 − Discount %)`}
        </pre>
        <p>
          Annual Revenue is the pricing basis — every BPS lookup, every add-on line, and
          every discount ultimately keys off this one input. Add-on products were
          rebuilt in CPQ V6 (Nov 2025) to also price off a BPS revenue-band scale (with
          floors and ceilings) rather than as a % of Procurement, so every line item
          keys off the same Annual Revenue. Product value / basis points is
          intentionally left to CS and excluded from this tab for now.
        </p>
      </Section>

      <Section title="Vector 1: Size Correction">
        <p>
          Three inputs, fired via <code style={codeStyle}>max()</code>: the existing ENR
          revenue delta, the GMV / AR ratio pulled from Luke&apos;s Customer Summary sheet,
          and the customer&apos;s self-stated <em>Annual Construction Revenue</em> tied to their
          latest signed Kojo Order Form (Stated ACR). Any one is enough to fire Size; when
          multiple point the same direction the evidence is stronger. Strong usually means
          the deal was priced off stale Annual Revenue — validate real size before renewal.
        </p>
        <Table
          headers={["Input", "Strong", "Moderate", "Weak / Right-sized"]}
          rows={[
            ["ENR rev delta (absolute)", "> 30%", "15–30%", "< 15%"],
            ["GMV / AR distance from 25–35% band", "> 15 pts outside", "5–15 pts outside", "Inside band"],
            ["Stated ACR delta vs SFDC (absolute)", "> 30%", "15–30%", "< 15%"],
          ]}
        />
        <p style={{ marginTop: 12 }}>
          <strong>GMV / AR motions.</strong> Anchored to Micah&apos;s heuristic that GMV
          ≈ 30% of Annual Construction Revenue when a customer is right-sized. Outside
          the 25–35% band we surface one of two motions on the row (pill next to the
          customer name, dot on the quadrant tile in the expand panel):
        </p>
        <Table
          headers={["Motion", "Condition", "Read"]}
          rows={[
            ["Reprice", "GMV / AR > 35%", "Customer spends like a bigger company than SFDC shows — investigate AR before repricing"],
            ["Right-sized", "GMV / AR 25–35%", "No GMV-driven motion; Size signal falls back to ENR delta alone"],
            ["Wallet Share", "GMV / AR < 25%", "Low Kojo penetration in a large customer — sell more / expand product footprint"],
          ]}
        />
        <p style={{ marginTop: 12, fontSize: 11, color: "var(--muted)" }}>
          The 25–35% band is Micah&apos;s 30% anchor with a ±5% tolerance, not an
          industry standard — tunable once we see distribution. GMV today is a static
          snapshot from <code style={codeStyle}>2025_09 GMV Backup.xlsx · Customer Summary</code>{" "}
          (T12 through 3/31/2026). The durable SFDC field{" "}
          <code style={codeStyle}>Kojo_Annual_GMV_T12__c</code> is now populated by Nick&apos;s
          pipeline (DS-878); dashboard swap pending Coefficient column add and cadence
          confirmation.
        </p>
        <p style={{ marginTop: 16 }}>
          <strong>Stated ACR.</strong> The customer-stated Annual Construction Revenue tied to their
          latest signed Kojo Order Form. Pulled from two sources per Quote: the structured SFDC
          field <code style={codeStyle}>Quote.Annual_Construction_Revenue__c</code> and the value
          parsed directly from the signed PDF (regex on the &ldquo;Annual Construction Revenue:&rdquo;
          line; Claude fallback for older templates). The PDF value takes precedence when present;
          otherwise the Quote field is used. Each row tags the source so CSMs can tell at a glance
          whether they&apos;re looking at a signed-PDF value (high confidence) or an AE-entered Quote
          field (medium confidence, no contract cross-check). Refreshed manually via{" "}
          <code style={codeStyle}>/snapshot-contract-acr</code> in Claude Code.
        </p>
        <div
          style={{
            background: "var(--bg)",
            border: "1px solid var(--border)",
            borderLeft: "3px solid var(--kojo-yellow)",
            borderRadius: 4,
            padding: 12,
            marginTop: 12,
            fontSize: 12,
            lineHeight: 1.6,
          }}
        >
          <strong>CSM phrasing note.</strong> Stated ACR is the value the customer self-reported
          at signing. Treat it as the customer&apos;s stated intent for sizing, not as ground truth
          on actual revenue. A mismatch with SFDC AR is a conversation starter, not a fact to
          confront the customer with — frame it as &ldquo;our records show different numbers from
          what we&apos;d expect; can you help us understand the current size of your business?&rdquo;
          rather than &ldquo;your contract says X but we have Y.&rdquo;
        </div>
        <p style={{ marginTop: 12, fontSize: 11, color: "var(--muted)" }}>
          <strong>Audit indicator.</strong> When the Quote field and the PDF parse disagree by
          more than 5%, a small <code style={codeStyle}>⚠ field Δ</code> tag appears under the
          delta line on the row. Usually means the Quote field was edited after signing or the
          PDF was generated from a different revision. The expand drawer shows both source values
          and a dedicated audit callout when this fires. The mismatch is an SFDC data hygiene
          signal — not a customer-facing observation.
        </p>
      </Section>

      <Section title="Vector 2: Discount Normalization">
        <p>
          Shows the discount percentage from the original new business deal. A customer
          sitting on a 40% discount three years into their contract is a conversation
          starter — that discount was likely a first-year incentive, not a forever rate.
          The discount signal anchors to the <strong>New Business</strong> closed-won
          opp because that&apos;s the base pricing relationship. Upsell and renewal
          discounts are shown in the history but don&apos;t drive the signal (upsell
          discounts can be negative — i.e. premium pricing on add-ons — and would
          distort the signal if included).
        </p>
        <Table
          headers={["Signal", "Condition"]}
          rows={[
            ["Strong", "NB discount > 30% AND contract vintage > 1 year"],
            ["Moderate", "NB discount > 20%"],
            ["Weak", "NB discount ≤ 20%"],
            ["No Data", "No closed-won New Business opp found"],
          ]}
        />
      </Section>

      <Section title="BPS Pricing Compression">
        <p>
          Shows the basis-points delta between what the customer should be paying at
          list price for the products they actually have and what they&apos;re actually
          paying (from the New Business deal&apos;s <code style={codeStyle}>Opportunity BPS</code>).
          This is a more precise version of the discount percentage — it accounts for
          the specific products on the account and their revenue tier.
        </p>
        <Table
          headers={["Column", "Source"]}
          rows={[
            ["Products", "Parsed from the Active Assets field on the customer account (e.g. PROCUREMENT;AP)"],
            ["List BPS", "Sum of product BPS at the family's annual revenue tier (from the pricing calculator config)"],
            ["Actual BPS", "Opportunity BPS field on the first closed-won New Business opp"],
            ["BPS Delta", "(List − Actual) / List. Positive = below list (compression). Negative = above list (premium)."],
          ]}
        />
        <p>
          A large positive delta (&gt; 30%) indicates significant pricing compression —
          confirms the discount signal and translates it into concrete basis points you
          can act on at renewal. Customers using only Procurement + AP at a high
          revenue tier might show a small delta even with a big discount because the
          list BPS is already low.
        </p>
      </Section>

      <Section title="Recent Upsell Dampener">
        <p>
          When a closed-won Upsell lands in the last 12 months, the family is flagged as{" "}
          <strong>Recently Upsold</strong>. The CSM just did the work — pricing and
          billing terms are locked in contracts until renewal, so pushing them to the
          top of the upsell list is noise.
        </p>
        <Table
          headers={["Signal", "Recently Upsold behavior"]}
          rows={[
            ["Size signal", "Unchanged — revenue data accuracy still matters"],
            ["Discount signal", "Strong → Moderate (NB discount was validated by the upsell)"],
            ["Billing signal", "Strong/Moderate → Weak (billing terms locked until renewal)"],
          ]}
        />
        <p>
          The overall signal and signal count are computed after dampening, so Recently
          Upsold families naturally sort below families where there&apos;s actually
          something actionable right now.
        </p>
      </Section>

      <Section title="ARR Comparison & Renewal Detection">
        <p>
          <strong>Original ARR</strong> is sourced from the first closed-won New
          Business opp on the pipeline sheet. If no such opp exists, we fall back to
          the Original ARR field on the Customer Account record. A blank value means
          neither source had the data — a cleanup action item.
        </p>
        <p>
          <strong>Current ARR</strong> comes from the Recurring ARR field on the
          Customer Account. <strong>Growth</strong> is the percentage change between
          original and current. Growth over 10% is flagged as <em>Upsold</em> — a
          signal that expansion has already happened on this account.
        </p>
        <p>
          <strong>Renewal Pending</strong> badges surface when the expansion sheet has
          an open renewal opp (any stage other than Closed Won, Closed Lost, or Unable
          to Qualify). The action item on these families is to bundle any upsell
          conversations into the renewal rather than open a separate thread.
        </p>
      </Section>

      <Section title="Vector 3: Invoice Frequency">
        <p>
          Flags customers not on optimal billing cadence. The key field is{" "}
          <strong>Invoice Frequency</strong>, not Payment Terms (which tracks collection
          timing — Due Upon Receipt, Net 30, etc.). Monthly or quarterly billing is the
          simplest conversation of the three and pairs well with a multi-year incentive
          offer.
        </p>
        <Table
          headers={["Signal", "Condition"]}
          rows={[
            ["Strong", "Monthly or Quarterly billing"],
            ["Moderate", "Semi-Annually or Custom"],
            ["Weak", "Annually or Upfront (already optimal)"],
            ["No Data", "Invoice Frequency field is empty"],
          ]}
        />
      </Section>

      <Section title="Combined Signal">
        <p>
          The overall signal for each customer family is the <strong>strongest</strong>{" "}
          of the three individual vectors. Signal count shows how many of the 3 vectors
          have a moderate or stronger signal (displayed as &quot;2/3&quot;). Default sort
          is signal count descending, then ARR descending.
        </p>
      </Section>

      <Section title="Upsell CSV Export — Action Needed Column">
        <Table
          headers={["Action", "Trigger"]}
          rows={[
            ["Update SFDC Revenue (delta >30%)", "Size signal is strong"],
            ["Review discount — X% in year N", "Discount signal is strong"],
            ["Convert to annual billing (currently X)", "Invoice Frequency is not Annually or Upfront"],
            ["Missing discount data", "Discount signal is no-data"],
            ["Missing revenue data — update SFDC", "Both size and discount signals are no-data"],
          ]}
        />
      </Section>
    </div>
  );
}

// ── Helper components ──

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h3
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: "var(--kojo-yellow)",
          marginBottom: 10,
          paddingBottom: 6,
          borderBottom: "1px solid var(--border)",
        }}
      >
        {title}
      </h3>
      <div style={{ fontSize: 13, color: "var(--muted)" }}>{children}</div>
    </div>
  );
}

function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <table
      style={{
        width: "100%",
        borderCollapse: "collapse",
        fontSize: 12,
        marginTop: 8,
      }}
    >
      <thead>
        <tr>
          {headers.map((h) => (
            <th
              key={h}
              style={{
                padding: "6px 10px",
                textAlign: "left",
                borderBottom: "1px solid var(--border)",
                color: "var(--text)",
                fontWeight: 600,
                fontSize: 11,
              }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            {row.map((cell, j) => (
              <td
                key={j}
                style={{
                  padding: "6px 10px",
                  borderBottom: "1px solid var(--border)",
                  color: "var(--muted)",
                }}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const codeStyle: React.CSSProperties = {
  background: "var(--bg)",
  padding: "2px 6px",
  borderRadius: 4,
  fontSize: 12,
  fontFamily: "monospace",
};
