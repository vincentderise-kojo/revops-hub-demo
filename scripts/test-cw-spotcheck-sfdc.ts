// End-to-end CW spot-check smoke test against ZEN Corp.
// Pulls SFDC bundle, runs the Claude synthesizer, prints the check results.
// Run: npx tsx scripts/test-cw-spotcheck-sfdc.ts
// Requires .env.local with SFDC_*, ANTHROPIC_API_KEY.
// Delete this script once we wire up the real cron route + deploy.

process.loadEnvFile(".env.local");

import {
  getOpportunity,
  getQuote,
  getOpportunityLineItems,
  getQuoteLineItems,
  getOpportunityHistory,
  getContractPdfForQuote,
  getInstanceUrl,
  buildOppUrl,
  buildContentVersionUrl,
} from "../lib/cw-spotcheck/sfdc";
import { synthesizeSpotCheck } from "../lib/cw-spotcheck/synthesizer";
import type { SpotCheckBundle } from "../lib/cw-spotcheck/types";

const OPP_ID = process.argv[2] ?? "006Rk00000bJFNrIAO";

async function main() {
  console.log(`\n=== Pulling bundle for ${OPP_ID} ===`);
  const opp = await getOpportunity(OPP_ID);
  console.log(`  ${opp.Name} — ${opp.StageName} ${opp.Type} $${opp.Amount}`);

  const quote = opp.SyncedQuoteId ? await getQuote(opp.SyncedQuoteId) : null;
  const oppLineItems = await getOpportunityLineItems(OPP_ID);
  const quoteLineItems = opp.SyncedQuoteId ? await getQuoteLineItems(opp.SyncedQuoteId) : [];
  const oppHistory = await getOpportunityHistory(OPP_ID);
  const contractPdf = opp.SyncedQuoteId ? await getContractPdfForQuote(opp.SyncedQuoteId) : null;
  const instanceUrl = await getInstanceUrl();

  console.log(`  Quote: ${quote?.QuoteNumber ?? "(none)"}  OLI: ${oppLineItems.length}  QLI: ${quoteLineItems.length}  History: ${oppHistory.length}  PDF: ${contractPdf?.bytes.length ?? "(none)"} bytes`);

  const bundle: SpotCheckBundle = { opp, quote, oppLineItems, quoteLineItems, oppHistory, contractPdf };

  console.log("\n=== Calling Claude (may take 20-60s) ===");
  const t0 = Date.now();
  const checks = await synthesizeSpotCheck(bundle);
  console.log(`  Done in ${((Date.now() - t0) / 1000).toFixed(1)}s. ${checks.length} checks returned.`);

  console.log("\n=== Spot-Check Results ===");
  console.log(`Opp:  ${buildOppUrl(instanceUrl, opp.Id)}`);
  if (contractPdf) console.log(`PDF:  ${buildContentVersionUrl(instanceUrl, contractPdf.contentVersionId)}`);
  console.log("");

  const sevIcon = { pass: "✓", warn: "⚠", fail: "✗" } as const;
  for (const c of checks) {
    console.log(`${sevIcon[c.severity]} [${c.severity.toUpperCase().padEnd(4)}] ${c.label}`);
    console.log(`    ${c.detail}`);
  }

  const counts = checks.reduce(
    (acc, c) => ({ ...acc, [c.severity]: (acc[c.severity] ?? 0) + 1 }),
    {} as Record<string, number>
  );
  console.log(`\nSummary: ${counts.pass ?? 0} pass · ${counts.warn ?? 0} warn · ${counts.fail ?? 0} fail`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
