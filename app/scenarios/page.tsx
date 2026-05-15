import { CsvDataSource, DEMO_CSV_PATHS } from "@/lib/data-loader";
import { processScenarios } from "@/lib/process-scenarios";
import { fetchQuotaRecords } from "@/lib/quota-loader";
import ScenariosDashboard from "@/components/scenarios-dashboard";

export const dynamic = "force-dynamic";

export default async function ScenariosPage() {
  // Demo build: read from data/demo/pipeline.csv
  const rawOpps = await new CsvDataSource(DEMO_CSV_PATHS.pipeline).loadOpportunities();
  console.log(`[Scenarios] Loaded ${rawOpps.length} opps from demo CSV`);

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
