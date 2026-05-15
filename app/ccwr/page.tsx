import { GoogleSheetsDataSource } from "@/lib/data-loader";
import { processCcwr } from "@/lib/process-ccwr";
import CcwrDashboard from "@/components/ccwr-dashboard";
import { SPREADSHEET_ID, SHEET_GIDS } from "@/lib/config";
import type { RawOpportunity } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CcwrPage() {
  let dataSourceLabel = "Google Sheets";

  let rawOpps: RawOpportunity[];
  try {
    const sheetsSource = new GoogleSheetsDataSource(SPREADSHEET_ID, SHEET_GIDS.pipeline);
    rawOpps = await sheetsSource.loadOpportunities();
    console.log(`[CCWR] Loaded ${rawOpps.length} opps from Google Sheets`);
  } catch (err) {
    console.error("[CCWR] Failed to load pipeline data:", err);
    rawOpps = [];
    dataSourceLabel = "Error — no data loaded";
  }

  const data = processCcwr(rawOpps);
  data.dataSourceLabel = dataSourceLabel;

  return <CcwrDashboard data={data} />;
}
