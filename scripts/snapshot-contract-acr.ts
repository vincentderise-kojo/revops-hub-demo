// Contract ACR snapshot orchestrator.
//
// For each customer account in data/customer-gmv-snapshot.json:
//   1. SOQL latest closed-won opp with synced quote
//   2. If --incremental and CloseDate matches cache → carry forward, skip parse
//   3. Read Quote.Annual_Construction_Revenue__c (structured SFDC field)
//   4. Download PDF via getContractPdfForQuote → parseContractAcr (regex-first, Claude fallback)
//   5. Record both values + mismatch indicator (audit dimension — they should match;
//      a delta means the Quote field was edited post-signing or the PDF was generated
//      from a different revision)
//
// statedAcr (primary value for downstream signal) = PDF value when present, else Quote field.
//
// Writes data/customer-contract-acr.json with deterministic key order.
//
// Run: npx tsx scripts/snapshot-contract-acr.ts [--full] [--account <Id>]

process.loadEnvFile(".env.local");

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

// Inline concurrency limiter — avoids p-limit ESM/CJS interop issues on Node 25.
function pLimit(concurrency: number) {
  let active = 0;
  const queue: Array<() => void> = [];
  const next = () => { if (active < concurrency && queue.length > 0) { active++; queue.shift()!(); } };
  return function limit<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      queue.push(() => fn().then((v) => { active--; next(); resolve(v); }, (e) => { active--; next(); reject(e); }));
      next();
    });
  };
}

import {
  findLatestSignedContractForAccount,
  getContractPdfForQuote,
  getQuote,
  soqlQuery,
} from "../lib/cw-spotcheck/sfdc";
import { parseContractAcr } from "../lib/contract-acr/parse";
import type { GmvSnapshot } from "../lib/types-account-intelligence";

const MISMATCH_THRESHOLD = 0.05;  // 5% delta between field and PDF flags as mismatch

const GMV_PATH = resolve(process.cwd(), "data/customer-gmv-snapshot.json");
const ACR_PATH = resolve(process.cwd(), "data/customer-contract-acr.json");
const CONCURRENCY = 8;
const MAX_RETRIES = 3;

interface ContractAcrRecord {
  accountId: string;
  // Primary value for downstream signal: PDF stated ACR when present, else Quote field.
  statedAcr: number | null;
  // Audit dimension — capture both sources independently:
  quoteFieldAcr: number | null;   // From Quote.Annual_Construction_Revenue__c (SFDC structured field)
  pdfStatedAcr: number | null;    // From parseContractAcr on the signed PDF
  acrMismatch: boolean;           // True if both are populated and disagree by > MISMATCH_THRESHOLD
  acrMismatchPct: number | null;  // (pdf - field) / field — null if either side is null
  signedDate: string | null;
  sourceOppId: string | null;
  sourceQuoteId: string | null;
  sourceContentVersionId: string | null;
  snapshotRunAt: string;
  method: "regex" | "regex_ambiguous" | "claude" | "not_found";
  rawExcerpt: string;
  error?: "no_quote_no_pdf" | "no_pdf" | "acr_not_found" | "sfdc_fetch_failed" | "no_signed_contract";
}

interface ContractAcrSnapshot {
  generatedAt: string;
  source: string;
  recordCount: number;
  records: Record<string, ContractAcrRecord>;  // keyed by accountId
}

function parseArgs(argv: string[]): { mode: "full" | "incremental" | "single"; accountId?: string } {
  if (argv.includes("--full")) return { mode: "full" };
  const ix = argv.indexOf("--account");
  if (ix >= 0 && argv[ix + 1]) return { mode: "single", accountId: argv[ix + 1] };
  return { mode: "incremental" };
}

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const backoff = 500 * Math.pow(2, attempt);
      console.error(`  retry ${attempt + 1}/${MAX_RETRIES} for ${label} after ${backoff}ms: ${err}`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

async function getOppLevelPdf(oppId: string) {
  const links = await soqlQuery<{
    ContentDocumentId: string;
    ContentDocument: { FileType: string; LatestPublishedVersionId: string; CreatedDate: string };
  }>(
    `SELECT ContentDocumentId, ContentDocument.FileType,
            ContentDocument.LatestPublishedVersionId, ContentDocument.CreatedDate
     FROM ContentDocumentLink WHERE LinkedEntityId='${oppId}'
     ORDER BY ContentDocument.CreatedDate DESC`
  );
  const pdf = links.find((l) => l.ContentDocument.FileType === "PDF");
  if (!pdf) return null;
  // Use getContractPdfForQuote's underlying binary fetch path — but it takes a quoteId.
  // For Opp-level fallback we call the REST endpoint directly. Reuse fetch + auth via soqlQuery's helpers.
  // Simplest reuse: temporarily skip the binary fetch and let the parser report missing PDF.
  // → For v1, declare Opp-level fallback as "best effort: presence only, parse fails gracefully."
  return { contentVersionId: pdf.ContentDocument.LatestPublishedVersionId, bytes: null as Buffer | null };
}

async function processAccount(
  accountId: string,
  prior: ContractAcrRecord | undefined,
  mode: "full" | "incremental" | "single"
): Promise<ContractAcrRecord> {
  const now = new Date().toISOString();
  const baseError = (error: ContractAcrRecord["error"]): ContractAcrRecord => ({
    accountId,
    statedAcr: null,
    quoteFieldAcr: null,
    pdfStatedAcr: null,
    acrMismatch: false,
    acrMismatchPct: null,
    signedDate: null,
    sourceOppId: null,
    sourceQuoteId: null,
    sourceContentVersionId: null,
    snapshotRunAt: now,
    method: "not_found",
    rawExcerpt: "",
    error,
  });

  let latest;
  try {
    latest = await withRetry(() => findLatestSignedContractForAccount(accountId), accountId);
  } catch {
    return baseError("sfdc_fetch_failed");
  }
  if (!latest) return baseError("no_signed_contract");

  // Incremental skip: same close date as prior → carry forward record
  if (mode === "incremental" && prior && prior.signedDate === latest.closeDate && !prior.error) {
    return prior;
  }

  // Pull Quote field + PDF in parallel.
  const [quoteResult, pdfResult] = await Promise.allSettled([
    withRetry(() => getQuote(latest.quoteId), `quote:${latest.quoteId}`),
    withRetry(() => getContractPdfForQuote(latest.quoteId), `pdf:${latest.quoteId}`),
  ]);

  const quoteFieldAcr =
    quoteResult.status === "fulfilled" ? quoteResult.value.Annual_Construction_Revenue__c : null;
  const pdf = pdfResult.status === "fulfilled" ? pdfResult.value : null;

  const baseFields = {
    accountId,
    quoteFieldAcr,
    signedDate: latest.closeDate,
    sourceOppId: latest.oppId,
    sourceQuoteId: latest.quoteId,
    snapshotRunAt: now,
  };

  if (!pdf) {
    // No PDF — Quote field is the only source. Still useful if populated.
    const error: ContractAcrRecord["error"] = quoteResult.status === "rejected" ? "sfdc_fetch_failed" : "no_pdf";
    return {
      ...baseFields,
      statedAcr: quoteFieldAcr,
      pdfStatedAcr: null,
      acrMismatch: false,
      acrMismatchPct: null,
      sourceContentVersionId: null,
      method: "not_found",
      rawExcerpt: "",
      ...(quoteFieldAcr === null ? { error } : {}),
    };
  }

  const parsed = await parseContractAcr(pdf.bytes);
  const pdfStatedAcr = parsed.statedAcr;

  // Compute mismatch when both sides present.
  let acrMismatch = false;
  let acrMismatchPct: number | null = null;
  if (pdfStatedAcr !== null && quoteFieldAcr !== null && quoteFieldAcr > 0) {
    acrMismatchPct = (pdfStatedAcr - quoteFieldAcr) / quoteFieldAcr;
    acrMismatch = Math.abs(acrMismatchPct) > MISMATCH_THRESHOLD;
  }

  // Primary value: PDF when present, else Quote field.
  const statedAcr = pdfStatedAcr ?? quoteFieldAcr;

  return {
    ...baseFields,
    statedAcr,
    pdfStatedAcr,
    acrMismatch,
    acrMismatchPct,
    sourceContentVersionId: pdf.contentVersionId,
    method: parsed.method,
    rawExcerpt: parsed.rawExcerpt,
    ...(statedAcr === null ? { error: "acr_not_found" as const } : {}),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const gmv: GmvSnapshot = JSON.parse(readFileSync(GMV_PATH, "utf-8"));
  const universe = args.mode === "single" && args.accountId
    ? [args.accountId]
    : Array.from(new Set(gmv.records.map((r) => r.sfdcId18))).filter(Boolean);

  const priorSnapshot: ContractAcrSnapshot | null = existsSync(ACR_PATH)
    ? JSON.parse(readFileSync(ACR_PATH, "utf-8"))
    : null;
  const prior = priorSnapshot?.records ?? {};

  console.log(`[contract-acr] Mode: ${args.mode}  Universe: ${universe.length} accounts`);

  const limit = pLimit(CONCURRENCY);
  const results: Record<string, ContractAcrRecord> = {};
  let done = 0;
  await Promise.all(
    universe.map((accountId) =>
      limit(async () => {
        const r = await processAccount(accountId, prior[accountId], args.mode);
        results[accountId] = r;
        done++;
        const dollars = r.statedAcr ? `$${(r.statedAcr / 1_000_000).toFixed(1)}M` : "—";
        const tag = r.error ?? r.method;
        const mismatchFlag = r.acrMismatch ? ` ⚠ field=$${((r.quoteFieldAcr ?? 0) / 1_000_000).toFixed(1)}M` : "";
        console.log(`  [${done}/${universe.length}] ${accountId} — ${dollars} (${tag})${mismatchFlag}`);
      })
    )
  );

  // Diff summary
  const news: string[] = [];
  const changed: string[] = [];
  const unchanged: string[] = [];
  const errored: string[] = [];
  const mismatches: string[] = [];
  for (const id of Object.keys(results)) {
    const r = results[id];
    const p = prior[id];
    if (r.error) errored.push(`${id} (${r.error})`);
    else if (!p) news.push(`${id} ($${(r.statedAcr! / 1_000_000).toFixed(1)}M)`);
    else if (p.statedAcr !== r.statedAcr) changed.push(`${id} ($${(p.statedAcr ?? 0) / 1_000_000}M → $${(r.statedAcr ?? 0) / 1_000_000}M)`);
    else unchanged.push(id);
    if (r.acrMismatch) {
      mismatches.push(
        `${id} (PDF=$${((r.pdfStatedAcr ?? 0) / 1_000_000).toFixed(1)}M, field=$${((r.quoteFieldAcr ?? 0) / 1_000_000).toFixed(1)}M, Δ=${Math.round((r.acrMismatchPct ?? 0) * 100)}%)`
      );
    }
  }

  console.log(`\n[contract-acr] Diff summary:`);
  console.log(`  ${news.length} new`);
  console.log(`  ${changed.length} changed`);
  console.log(`  ${unchanged.length} unchanged`);
  console.log(`  ${errored.length} errored`);
  console.log(`  ${mismatches.length} PDF↔field mismatches (audit)`);
  if (errored.length > 0) console.log(`    ${errored.slice(0, 20).join("\n    ")}`);
  if (mismatches.length > 0) console.log(`    ${mismatches.slice(0, 20).join("\n    ")}`);

  if (args.mode === "single") {
    console.log("\n[contract-acr] Single-account mode — NOT writing JSON. Result:");
    console.log(JSON.stringify(results[args.accountId!], null, 2));
    return;
  }

  // Write JSON with deterministic key order for clean diffs
  const sortedRecords: Record<string, ContractAcrRecord> = {};
  for (const id of Object.keys(results).sort()) sortedRecords[id] = results[id];
  const snapshot: ContractAcrSnapshot = {
    generatedAt: new Date().toISOString(),
    source: "Quote.Annual_Construction_Revenue__c (SFDC field) + signed PDF parse (audit), via lib/cw-spotcheck/sfdc.ts JWT auth",
    recordCount: Object.keys(sortedRecords).length,
    records: sortedRecords,
  };
  writeFileSync(ACR_PATH, JSON.stringify(snapshot, null, 2) + "\n");
  console.log(`\n[contract-acr] Wrote ${ACR_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
