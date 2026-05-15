import path from "path";
import { CsvDataSource, GoogleSheetsDataSource } from "@/lib/data-loader";
import { processScenarios } from "@/lib/process-scenarios";
import { fetchQuotaRecords } from "@/lib/quota-loader";
import ScenariosDashboard from "@/components/scenarios-dashboard";
import { SPREADSHEET_ID, SHEET_GIDS } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function ScenariosPage() {
  let rawOpps;

  try {
    const sheetsSource = new GoogleSheetsDataSource(SPREADSHEET_ID, SHEET_GIDS.pipeline);
    rawOpps = await sheetsSource.loadOpportunities();
    console.log(`[Scenarios] Loaded ${rawOpps.length} opps from Google Sheets`);
  } catch (err) {
    console.warn("[Scenarios] Google Sheets failed, falling back to CSV:", err);
    const csvPath = path.join(process.cwd(), "data", "report1773939885150.csv");
    const csvSource = new CsvDataSource(csvPath);
    rawOpps = await csvSource.loadOpportunities();
    console.log(`[Scenarios] Loaded ${rawOpps.length} opps from CSV fallback`);
  }

  const quotaRecords = await fetchQuotaRecords().catch((err) => {
    console.warn("[Scenarios] Quota fetch failed:", err);
    return [];
  });

  const data = processScenarios(rawOpps, quotaRecords);

  // Serialize — allOpps have Date objects that need ISO string conversion
  const serialized = JSON.parse(
    JSON.stringify(data, (_key, value) => {
      if (value instanceof Date) return value.toISOString();
      return value;
    })
  );

  return <ScenariosDashboard data={serialized} />;
}
