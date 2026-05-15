import { CsvDataSource, DEMO_CSV_PATHS } from "@/lib/data-loader";
import { parseOpp } from "@/lib/process-pipeline";
import { fetchQuotaRecords } from "@/lib/quota-loader";
import { fetchCalls, fetchSdrSetsForMmSdr } from "@/lib/mm-sdr-data-loader";
import { processMmSdr } from "@/lib/process-mm-sdr";
import MmSdrDashboard from "@/components/mm-sdr-dashboard";

export const dynamic = "force-dynamic";

export default async function MmSdrPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const params = await searchParams;
  // week=-1 = current in-progress week, 0 = last complete week, 1-11 = further back
  const rawOffset = parseInt(params.week || "0", 10);
  const weekOffset = isNaN(rawOffset) ? 0 : Math.min(Math.max(rawOffset, -1), 11);

  const [rawOpps, calls, sdrSets, quotaRecords] = await Promise.all([
    // Demo build: read from data/demo/pipeline.csv
    new CsvDataSource(DEMO_CSV_PATHS.pipeline)
      .loadOpportunities()
      .catch((err) => {
        console.warn("[MM SDR] Pipeline CSV load failed:", err);
        return [];
      }),
    fetchCalls().catch((err) => {
      console.warn("[MM SDR] Calls fetch failed:", err);
      return [];
    }),
    fetchSdrSetsForMmSdr().catch((err) => {
      console.warn("[MM SDR] SDR Sets fetch failed:", err);
      return [];
    }),
    fetchQuotaRecords().catch((err) => {
      console.warn("[MM SDR] Quota fetch failed:", err);
      return [];
    }),
  ]);

  const parsedOpps = rawOpps
    .map(parseOpp)
    .filter((o): o is NonNullable<typeof o> => o !== null);

  console.log(
    `[MM SDR] Data loaded: ${parsedOpps.length} opps, ${calls.length} calls, ${sdrSets.length} sdrSets, ${quotaRecords.length} quotas`
  );

  const data = processMmSdr(parsedOpps, calls, sdrSets, quotaRecords, weekOffset);

  return <MmSdrDashboard data={data} weekOffset={weekOffset} />;
}
