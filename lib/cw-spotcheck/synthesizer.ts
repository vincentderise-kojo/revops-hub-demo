// Claude-driven CW spot-check synthesizer.
//
// Sends the full SpotCheckBundle (Opp + Quote + line items + opp history +
// contract PDF binary) to Claude with a structured-output schema. Claude reads
// the PDF natively (Anthropic document content blocks), applies each check in
// CHECK_CATALOG against the live SFDC data, and returns a typed CheckResult[].
//
// Kojo-specific SFDC conventions live in the system prompt and are
// prompt-cached so they don't re-bill on every CW opp the daily cron checks.

import Anthropic from "@anthropic-ai/sdk";
import type { CheckResult, SpotCheckBundle } from "./types";

const MODEL = "claude-opus-4-7";

/**
 * Canonical check IDs + labels. Keep these stable — they're the contract
 * between the synthesizer and any downstream consumer (Slack, Hub UI, etc.).
 *
 * When adding a new check: append here, then mention it explicitly in the
 * CHECK_CATALOG_INSTRUCTIONS prompt block below.
 */
export const CHECK_CATALOG = [
  { id: "sub-end-opp", label: "Subscription End: PDF ↔ Opportunity.End_Date__c" },
  { id: "sub-end-quote", label: "Subscription End: PDF ↔ Quote.Subscription_End_Date__c" },
  { id: "sub-start", label: "Subscription Start: PDF ↔ Opp.Start_Date__c & Quote.Subscription_Start_Date__c" },
  { id: "year1-total", label: "Year 1 Total: PDF ↔ sum of Opportunity line items" },
  { id: "line-items-match", label: "Opp line items match Quote line items (same products + prices)" },
  { id: "discovery-not-null", label: "Demo_Held_Date__c (Discovery) is populated" },
  { id: "discovery-vs-close", label: "Demo_Held_Date__c is more than 10 days before Close Date" },
  { id: "rushed-stages", label: "Stage transitions are not all stamped within 1 hour on close day" },
  { id: "impl-section-header", label: "Contract section uses current template: '90 Day Virtual & On Site Implementation'" },
  { id: "impl-fee-label", label: "Implementation fee line reads 'Onsite & Virtual Implementation Fee'" },
  { id: "quote-status", label: "Quote.Status is not 'Draft' on a Closed-Won deal" },
  { id: "docusign-envelope", label: "Quote.DocuSign_Envelope_ID__c populated when PDF was DocuSigned" },
  { id: "initial-renewal", label: "Quote.Initial_Renewal_Date__c populated when PDF lists one" },
  { id: "sent-for-signature", label: "Quote.Sent_for_Signature_Date__c populated when contract was sent" },
] as const;

export type CheckId = (typeof CHECK_CATALOG)[number]["id"];

const CHECK_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    checks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string", enum: CHECK_CATALOG.map((c) => c.id) },
          label: { type: "string" },
          severity: { type: "string", enum: ["pass", "warn", "fail"] },
          detail: { type: "string" },
        },
        required: ["id", "label", "severity", "detail"],
      },
    },
  },
  required: ["checks"],
} as const;

// System prompt — prompt-cached on every cron run (mirrors refresh-inspections).
const SYSTEM_PROMPT = `You are the Kojo Closed-Won Spot-Check. For a single Closed-Won New-Business opportunity, you compare what the customer signed (the PDF contract attached) against what's in Salesforce on the Opportunity and the synced Quote, and you flag mismatches.

The signed PDF is the source of truth. Salesforce fields are the operational reflection of that. Where they disagree, the SFDC side is what we want to flag.

KOJO SFDC CONVENTIONS (load-bearing — read carefully):

1. Subscription End Date.
   - Opportunity.End_Date__c (Label "Subscription End Date") is the actual contract end date on the Opp. Compare PDF.Subscription_End to this.
   - Opportunity.Initial_Term_End_Date__c is ALWAYS +12 months from Start_Date__c regardless of contract term. Never compare PDF end-date against this — for any term ≠ 12 months it will be wrong by design.
   - Quote.Subscription_End_Date__c is the real contract end on the Quote.

2. Discovery Date.
   - Discovery Date for hygiene checks = Opportunity.Demo_Held_Date__c (the day the discovery demo was held). This is Kojo's pipeline-entry anchor.
   - OpportunityHistory is a secondary cross-reference — useful for spotting "rep created the opp the day they closed it and stamped every stage in minutes" patterns.

3. Implementation fee labels.
   - Product2 object in SFDC is named "Onsite Implementation Fee" (ProductCode IMPLEMENTATION_FEE). That underlying SFDC product name is expected — DO NOT flag it.
   - Customer-facing labels (on the PDF) come from Quote.Implementation_Product_Name__c. The CURRENT contract template uses "Onsite & Virtual Implementation Fee" on the line and "90 Day Virtual & On Site Implementation" as the section header. Older deals may show "OnSite & Virtual Training Fee" — that's stale and should be flagged.

4. Quote Status.
   - Quotes often remain in Draft status even on Closed-Won deals — Vincent has flagged this as a known systemic hygiene gap that we should continue to surface even though it's organization-wide.

5. DocuSign envelope round-trip.
   - If the PDF shows a DocuSign Envelope ID and signed dates, but Quote.DocuSign_Envelope_ID__c / Quote.Sent_for_Signature_Date__c / Opportunity.Contract_Sent_Date__c are null, that's a workflow gap worth flagging.

6. Product2 name vs PDF label differences.
   - Don't flag the Product2.Name field on line items mismatching the PDF label — they're different layers. Only flag the customer-facing label (Quote.Implementation_Product_Name__c / what's shown on the PDF).

OUTPUT FORMAT:

Return JSON conforming to the provided schema. Emit exactly one CheckResult per ID in the catalog you're given. For each check:
- "id" is the stable catalog ID.
- "label" should match the catalog label exactly.
- "severity" is "pass" (the data is fine), "warn" (something looks off but not critical), or "fail" (clear mismatch — money, term, signer, etc.).
- "detail" is one or two sentences. Quote the actual values you compared (e.g., "Opp.End_Date__c = 2027-05-31, PDF Subscription End = 5/31/2029, gap = 24 months"). Be specific; vague details aren't useful for the rep reading this in Slack.

If a check isn't applicable (e.g., the PDF doesn't include an implementation fee section), mark severity "pass" with a detail like "Not applicable: contract has no implementation fee."

Be honest about uncertainty. If you can't read a field clearly from the PDF, say so in the detail and use "warn" severity rather than guessing.`;

function summarizeBundle(bundle: SpotCheckBundle): string {
  const { opp, quote, oppLineItems, quoteLineItems, oppHistory } = bundle;
  return `OPPORTUNITY (id ${opp.Id}):
${JSON.stringify(opp, null, 2)}

QUOTE (id ${quote?.Id ?? "(no synced quote)"}):
${quote ? JSON.stringify(quote, null, 2) : "(none)"}

OPPORTUNITY LINE ITEMS (${oppLineItems.length}):
${JSON.stringify(oppLineItems, null, 2)}

QUOTE LINE ITEMS (${quoteLineItems.length}):
${JSON.stringify(quoteLineItems, null, 2)}

OPPORTUNITY HISTORY (${oppHistory.length} entries):
${JSON.stringify(oppHistory, null, 2)}`;
}

export async function synthesizeSpotCheck(bundle: SpotCheckBundle): Promise<CheckResult[]> {
  const anthropic = new Anthropic();

  const catalogText = CHECK_CATALOG.map((c) => `- ${c.id}: ${c.label}`).join("\n");
  const dataText = summarizeBundle(bundle);
  const userBlocks: Anthropic.MessageParam["content"] = [
    {
      type: "text",
      text: `CHECK CATALOG (emit one result per id):
${catalogText}

SFDC DATA:
${dataText}

The signed contract PDF is attached separately. Apply each check using the conventions in the system prompt, and return JSON conforming to the schema.`,
    },
  ];

  if (bundle.contractPdf) {
    userBlocks.push({
      type: "document",
      source: {
        type: "base64",
        media_type: "application/pdf",
        data: bundle.contractPdf.bytes.toString("base64"),
      },
    });
  } else {
    userBlocks.push({
      type: "text",
      text: "NOTE: no contract PDF was found attached to the Quote. Mark PDF-dependent checks as 'fail' with a detail noting the missing contract.",
    });
  }

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    thinking: { type: "adaptive" },
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    output_config: {
      format: {
        type: "json_schema",
        schema: CHECK_SCHEMA,
      },
    },
    messages: [{ role: "user", content: userBlocks }],
  });

  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!textBlock) throw new Error("Claude returned no text content for spot-check synthesis");

  const parsed = JSON.parse(textBlock.text) as { checks: CheckResult[] };
  return parsed.checks;
}
