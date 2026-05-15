import { CsvDataSource, DEMO_CSV_PATHS } from "@/lib/data-loader";
import { processCoverage } from "@/lib/process-coverage";
import { fetchQuotaRecords } from "@/lib/quota-loader";
import CoverageDashboard from "@/components/coverage-dashboard";

export const dynamic = "force-dynamic";

export default async function CoveragePage() {
  // Demo build: read from data/demo/pipeline.csv
  const rawOpps = await new CsvDataSource(DEMO_CSV_PATHS.pipeline).loadOpportunities();
  console.log(`[Coverage] Loaded ${rawOpps.length} opps from demo CSV`);

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
