import path from "path";
import { CsvDataSource, GoogleSheetsDataSource } from "@/lib/data-loader";
import { processCoverage } from "@/lib/process-coverage";
import { fetchQuotaRecords } from "@/lib/quota-loader";
import CoverageDashboard from "@/components/coverage-dashboard";
import { SPREADSHEET_ID, SHEET_GIDS } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function CoveragePage() {
  let rawOpps;

  try {
    const sheetsSource = new GoogleSheetsDataSource(SPREADSHEET_ID, SHEET_GIDS.pipeline);
    rawOpps = await sheetsSource.loadOpportunities();
    console.log(`[Coverage] Loaded ${rawOpps.length} opps from Google Sheets`);
  } catch (err) {
    console.warn("[Coverage] Google Sheets failed, falling back to CSV:", err);
    const csvPath = path.join(process.cwd(), "data", "report1773939885150.csv");
    const csvSource = new CsvDataSource(csvPath);
    rawOpps = await csvSource.loadOpportunities();
    console.log(`[Coverage] Loaded ${rawOpps.length} opps from CSV fallback`);
  }

  const quotaRecords = await fetchQuotaRecords().catch((err) => {
    console.warn("[Coverage] Quota fetch failed:", err);
    return [];
  });

  const data = processCoverage(rawOpps, quotaRecords);

  // Build a quota map for the client component (covers current + next 6 months)
  const { buildMonthlyQuotaFromRecords } = await import("@/lib/quota-loader");
  const quotaMap: Record<string, { totalQuota: number; mmQuota: number; entQuota: number }> = {};
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    quotaMap[mk] = buildMonthlyQuotaFromRecords(quotaRecords, mk);
  }

  const serializedData = JSON.parse(
    JSON.stringify(data, (key, value) => {
      if (value instanceof Date) return value.toISOString();
      return value;
    })
  );

  return <CoverageDashboard data={serializedData} quotaMap={quotaMap} />;
}
