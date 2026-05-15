import { OPP_SET_TYPE_MAP, aeSegmentFromManager } from "./config";
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
 * Demo build: no qualification CSV — AE Performance section 1 renders as "not wired".
 */
export async function fetchQualificationOpps(): Promise<QualificationLoadResult> {
  // Demo build: no synthetic qualification tab — AE Performance section renders gracefully.
  return { opps: [], available: false };
}
