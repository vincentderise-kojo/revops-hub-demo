import { RawQuotaRecord, QuotaRecord } from "./types-sdr";
import { MonthlyQuota, MONTHLY_QUOTAS, getMonthlyQuota } from "./config";
import { loadCsvFile, DEMO_CSV_PATHS } from "./data-loader";

// ── Parse raw quota record ──
function parseQuotaRecord(raw: RawQuotaRecord): QuotaRecord | null {
  const startDateStr = raw["Start Date"];
  const endDateStr = raw["End Date"];
  if (!startDateStr || !endDateStr) return null;

  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) return null;

  const rampingVal = raw["Is Ramping (Vlookup)"];
  const isRamping = rampingVal === "1";

  return {
    id: raw["ForecastingQuota ID"] || "",
    quotaAmount: parseFloat(raw["Quota Amount"]) || 0,
    quotaQuantity: parseFloat(raw["Quota Quantity"]) || 0,
    forecastingType: raw["Forecasting Type: API Name"] || "",
    isActive: raw["Is Active"]?.toLowerCase() === "true" || raw["Is Active"] === "1",
    isRamping,
    startDate,
    endDate,
    ownerName: raw["Owner: Full Name"] || "",
    ownerManager: raw["Owner: Manager: Full Name"] || "",
  };
}

// ── Fetch all quota records from demo CSV ──
export async function fetchQuotaRecords(): Promise<QuotaRecord[]> {
  // Demo build: read from data/demo/quotas.csv
  const rawRows = await loadCsvFile<RawQuotaRecord>(DEMO_CSV_PATHS.quotas);
  const records: QuotaRecord[] = [];
  for (const raw of rawRows) {
    const parsed = parseQuotaRecord(raw);
    if (parsed) records.push(parsed);
  }
  return records;
}

// ── Get active quota records for a given month ──
export function getQuotasForMonth(records: QuotaRecord[], monthKey: string): QuotaRecord[] {
  const [yearStr, monthStr] = monthKey.split("-");
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);

  return records.filter((r) => {
    if (!r.isActive) return false;
    return r.startDate <= monthEnd && r.endDate >= monthStart;
  });
}

// ── Manager-level rollups to exclude from quota aggregation ──
const QUOTA_EXCLUDED_OWNERS = [
  "Jeremy Taylor",
  "Will Olson",
  "Sean Coyle",
  "Jared Moor",
  "Garrett Ackard",
];

// ── Build MonthlyQuota from sheet data (for pipeline/coverage/scenarios) ──
export function buildMonthlyQuotaFromRecords(records: QuotaRecord[], monthKey: string): MonthlyQuota {
  const monthRecords = getQuotasForMonth(records, monthKey);

  const aeRecords = monthRecords.filter(
    (r) =>
      !r.forecastingType.toLowerCase().includes("sdr") &&
      !QUOTA_EXCLUDED_OWNERS.includes(r.ownerName)
  );

  if (aeRecords.length === 0) {
    const fallback = MONTHLY_QUOTAS[monthKey];
    if (fallback) return fallback;
    const keys = Object.keys(MONTHLY_QUOTAS).sort();
    return MONTHLY_QUOTAS[keys[keys.length - 1]];
  }

  let mmQuota = 0;
  let entQuota = 0;

  for (const rec of aeRecords) {
    const mgr = rec.ownerManager;
    if (mgr === "Sean Coyle") {
      entQuota += rec.quotaAmount;
    } else {
      mmQuota += rec.quotaAmount;
    }
  }

  return {
    totalQuota: mmQuota + entQuota,
    mmQuota,
    entQuota,
  };
}

// ── Resolve quota: use live sheet records if available, else hardcoded fallback ──
export function resolveMonthlyQuota(monthKey: string, records?: QuotaRecord[]): MonthlyQuota {
  if (records && records.length > 0) {
    return buildMonthlyQuotaFromRecords(records, monthKey);
  }
  return getMonthlyQuota(monthKey);
}

// ── Resolve quota for a specific segment (for scenarios view) ──
export function resolveQuotaForMonth(
  monthKey: string,
  segment: "All" | "MidMarket" | "Enterprise",
  records?: QuotaRecord[]
): number {
  const q = resolveMonthlyQuota(monthKey, records);
  if (segment === "MidMarket") return q.mmQuota;
  if (segment === "Enterprise") return q.entQuota;
  return q.totalQuota;
}

// ── Convenience: fetch and build MonthlyQuota with fallback ──
export async function fetchMonthlyQuota(monthKey: string): Promise<{ quota: MonthlyQuota; records: QuotaRecord[] }> {
  try {
    const records = await fetchQuotaRecords();
    const quota = buildMonthlyQuotaFromRecords(records, monthKey);
    console.log(`[Quotas] Built quota from sheet for ${monthKey}: total=${quota.totalQuota}`);
    return { quota, records };
  } catch (err) {
    console.warn("[Quotas] Sheet fetch failed, using hardcoded fallback:", err);
    const fallback = MONTHLY_QUOTAS[monthKey];
    const quota = fallback || MONTHLY_QUOTAS[Object.keys(MONTHLY_QUOTAS).sort().pop()!];
    return { quota, records: [] };
  }
}
