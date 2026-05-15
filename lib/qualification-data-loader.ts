import { SPREADSHEET_ID, SHEET_GIDS, OPP_SET_TYPE_MAP, aeSegmentFromManager } from "./config";
import type { AeOpp } from "./types-ae-performance";
import type { SourceLabel } from "./types";

interface RawQualificationOpp {
  "Opportunity ID (18 Char)"?: string;
  "Opportunity Name"?: string;
  "Opportunity Owner"?: string;        // AE name
  "Opportunity Owner: Manager"?: string;
  "Opp Set Type"?: string;
  Stage?: string;
  "Created Date"?: string;
  "Close Date"?: string;
  "Last Activity"?: string;
  Amount?: string;
  "Annual Revenue"?: string;
  "Stage Duration"?: string;
}

function parseQualificationOpp(raw: RawQualificationOpp): AeOpp | null {
  const oppId = raw["Opportunity ID (18 Char)"]?.trim();
  const createdDateStr = raw["Created Date"]?.trim();
  if (!oppId || !createdDateStr) return null;

  const createdDate = new Date(createdDateStr);
  if (isNaN(createdDate.getTime())) return null;

  let lastActivityDate: Date | null = null;
  const lastActivityStr = raw["Last Activity"]?.trim();
  if (lastActivityStr) {
    const parsed = new Date(lastActivityStr);
    if (!isNaN(parsed.getTime())) lastActivityDate = parsed;
  }

  let closeDate: Date | null = null;
  const closeDateStr = raw["Close Date"]?.trim();
  if (closeDateStr) {
    const parsed = new Date(closeDateStr);
    if (!isNaN(parsed.getTime())) closeDate = parsed;
  }

  const oppSetType = raw["Opp Set Type"]?.trim() || "";
  const source: SourceLabel | null = OPP_SET_TYPE_MAP[oppSetType] ?? null;

  const manager = raw["Opportunity Owner: Manager"]?.trim() || "";
  const segment = aeSegmentFromManager(manager);

  return {
    oppId,
    name: raw["Opportunity Name"]?.trim() || "",
    owner: raw["Opportunity Owner"]?.trim() || "",
    manager,
    source,
    oppSetType,
    stage: raw.Stage?.trim() || "",
    createdDate,
    closeDate,
    lastActivityDate,
    amount: parseFloat(raw.Amount || "") || 0,
    annualRevenue: parseFloat(raw["Annual Revenue"] || "") || 0,
    segment,
    stageDurationDays: parseFloat(raw["Stage Duration"] || "") || 0,
  };
}

export interface QualificationLoadResult {
  opps: AeOpp[];
  available: boolean;                  // false → tab not yet wired or fetch failed
}

/**
 * Fetch + parse the qualification tab. Returns `available: false` (with empty opps)
 * if the GID is the placeholder or the fetch fails — surface this to the UI as
 * "Section 1 not yet wired" rather than crashing the page.
 */
export async function fetchQualificationOpps(): Promise<QualificationLoadResult> {
  const gid = SHEET_GIDS.qualification;
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${gid}`;
  let response: Response;
  try {
    response = await fetch(url, { next: { revalidate: 0 } });
  } catch (err) {
    console.warn("[AE Performance] qualification fetch threw:", err);
    return { opps: [], available: false };
  }

  if (!response.ok) {
    console.warn(`[AE Performance] qualification fetch failed: ${response.status} ${response.statusText}`);
    return { opps: [], available: false };
  }

  const csvText = await response.text();
  if (csvText.trimStart().startsWith("<!") || csvText.trimStart().startsWith("<html")) {
    console.warn("[AE Performance] qualification sheet returned HTML — is the sheet shared publicly?");
    return { opps: [], available: false };
  }

  const PapaMod = await import("papaparse");
  const Papa = PapaMod.default || PapaMod;
  const result = Papa.parse<RawQualificationOpp>(csvText, {
    header: true,
    skipEmptyLines: true,
  });

  const opps: AeOpp[] = [];
  for (const raw of result.data) {
    const parsed = parseQualificationOpp(raw);
    if (parsed) opps.push(parsed);
  }

  console.log(`[AE Performance] Loaded ${opps.length} qualification opps from Google Sheets`);
  return { opps, available: true };
}
