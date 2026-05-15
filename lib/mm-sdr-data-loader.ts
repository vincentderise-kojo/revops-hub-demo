import { RawCallRecord, ParsedCall, RawSdrSetRecord, ParsedSdrSet } from "./types-mm-sdr";
import { CALL_RESULT_CONNECT } from "./config";
import { loadCsvFile, DEMO_CSV_PATHS } from "./data-loader";

// ── Parse raw call record ──

function parseCallRecord(raw: RawCallRecord): ParsedCall | null {
  const dateStr = raw.Date;
  if (!dateStr) return null;

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return null;

  const sdrName = raw.Assigned || "";
  if (!sdrName) return null;

  const callResult = raw["Call Result"] || "";

  return {
    sdrName,
    callResult,
    isConnect: CALL_RESULT_CONNECT.includes(callResult),
    date,
    accountName: raw["Company / Account"] || "",
    contactName: raw.Contact || "",
    accountId: raw["Account ID"] || "",
    contactTitle: raw["Primary Contact Title"] || "",
  };
}

// ── Fetch calls — Demo build: no calls CSV, return empty ──

export async function fetchCalls(): Promise<ParsedCall[]> {
  // Demo build: no synthetic calls CSV — MM SDR call activity section will be empty.
  console.log("[MM SDR] Demo build: no calls CSV, returning empty call list");
  return [];
}

// ── Parse updated SDR Set record ──

function parseSdrSetRecord(raw: RawSdrSetRecord): ParsedSdrSet | null {
  const dateStr = raw["Qualification Set Date"];
  if (!dateStr) return null;

  const qualSetDate = new Date(dateStr);
  if (isNaN(qualSetDate.getTime())) return null;

  return {
    sdrOwner: raw["SDR Owner"] || "",
    assignedAE: raw["Assigned Account Executive"] || "",
    oppName: raw["Opportunity Name"] || "",
    qualSetDate,
    amount: parseFloat(raw.Amount) || 0,
    stage: raw.Stage || "",
    industry: raw.Industry || "",
    salesRejectedReason: raw["Sales Rejected Reason"] || "",
    salesRejectedNotes: raw["Sales Rejected Notes"] || "",
    accountName: raw["Account Name"] || "",
    accountId: raw["Account ID"] || "",
    oppId: raw["Opportunity ID"] || "",
    annualRevenue: parseFloat(raw["Annual Revenue"]) || 0,
    accountSegment: raw["Account Segment"] || "",
    oppSetType: raw["Opp Set Type"] || "",
  };
}

// ── Fetch updated SDR Sets from demo CSV ──

export async function fetchSdrSetsForMmSdr(): Promise<ParsedSdrSet[]> {
  // Demo build: read from data/demo/sdrSets.csv
  const rawRows = await loadCsvFile<RawSdrSetRecord>(DEMO_CSV_PATHS.sdrSets);
  const records: ParsedSdrSet[] = [];
  for (const raw of rawRows) {
    const parsed = parseSdrSetRecord(raw);
    if (parsed) records.push(parsed);
  }
  console.log(`[MM SDR] Loaded ${records.length} SDR set records from demo CSV`);
  return records;
}
