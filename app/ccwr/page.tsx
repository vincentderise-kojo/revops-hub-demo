import { CsvDataSource, DEMO_CSV_PATHS } from "@/lib/data-loader";
import { processCcwr } from "@/lib/process-ccwr";
import CcwrDashboard from "@/components/ccwr-dashboard";
import type { RawOpportunity } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CcwrPage() {
  const dataSourceLabel = "Demo CSV";

  // Demo build: read from data/demo/pipeline.csv
  let rawOpps: RawOpportunity[];
  try {
    rawOpps = await new CsvDataSource(DEMO_CSV_PATHS.pipeline).loadOpportunities();
    console.log(`[CCWR] Loaded ${rawOpps.length} opps from demo CSV`);
  } catch (err) {
    console.error("[CCWR] Failed to load pipeline data:", err);
    rawOpps = [];
  }

  const data = processCcwr(rawOpps);
  data.dataSourceLabel = dataSourceLabel;

  return <CcwrDashboard data={data} />;
}
