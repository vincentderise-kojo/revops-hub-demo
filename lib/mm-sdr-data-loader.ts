import { RawCallRecord, ParsedCall, RawSdrSetRecord, ParsedSdrSet } from "./types-mm-sdr";
import { SPREADSHEET_ID, SHEET_GIDS, CALL_RESULT_CONNECT } from "./config";

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

// ── Fetch calls from Google Sheets ──

export async function fetchCalls(): Promise<ParsedCall[]> {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${SHEET_GIDS.calls}`;
  const response = await fetch(url, { next: { revalidate: 0 } });

  if (!response.ok) {
    throw new Error(`Calls sheet fetch failed: ${response.status} ${response.statusText}`);
  }

  const csvText = await response.text();

  if (csvText.trimStart().startsWith("<!") || csvText.trimStart().startsWith("<html")) {
    throw new Error("Calls sheet returned HTML instead of CSV — is the sheet shared?");
  }

  const PapaMod = await import("papaparse");
  const Papa = PapaMod.default || PapaMod;
  const result = Papa.parse<RawCallRecord>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  // Filter to last 120 days for performance
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 120);

  const calls: ParsedCall[] = [];
  for (const raw of result.data) {
    const parsed = parseCallRecord(raw);
    if (parsed && parsed.date >= cutoff) calls.push(parsed);
  }

  console.log(`[MM SDR] Loaded ${calls.length} calls from Google Sheets (120-day window)`);
  return calls;
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

// ── Fetch updated SDR Sets from Google Sheets ──

export async function fetchSdrSetsForMmSdr(): Promise<ParsedSdrSet[]> {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${SHEET_GIDS.sdrSets}`;
  const response = await fetch(url, { next: { revalidate: 0 } });

  if (!response.ok) {
    throw new Error(`SDR Sets sheet fetch failed: ${response.status} ${response.statusText}`);
  }

  const csvText = await response.text();

  if (csvText.trimStart().startsWith("<!") || csvText.trimStart().startsWith("<html")) {
    throw new Error("SDR Sets sheet returned HTML instead of CSV — is the sheet shared?");
  }

  const PapaMod = await import("papaparse");
  const Papa = PapaMod.default || PapaMod;
  const result = Papa.parse<RawSdrSetRecord>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const records: ParsedSdrSet[] = [];
  for (const raw of result.data) {
    const parsed = parseSdrSetRecord(raw);
    if (parsed) records.push(parsed);
  }

  console.log(`[MM SDR] Loaded ${records.length} SDR set records from Google Sheets`);
  return records;
}
