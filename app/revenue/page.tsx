import { loadCsvFile, DEMO_CSV_PATHS } from "@/lib/data-loader";
import { parseCwOpp, parsePipelineOpp } from "@/lib/process-revenue";
import { RawCwOpportunity } from "@/lib/types-revenue";
import RevenueDashboard from "@/components/revenue-dashboard";
import type { RawOpportunity } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function RevenuePage() {
  // Demo build: read both tabs from data/demo/ CSV files
  const dataSourceLabel = "Demo CSV";
  const [cwResult, pipelineResult] = await Promise.all([
    loadCsvFile<RawCwOpportunity>(DEMO_CSV_PATHS.closedWon),
    loadCsvFile<RawOpportunity>(DEMO_CSV_PATHS.pipeline),
  ]);

  let rawCwData: RawCwOpportunity[] = cwResult;

  if (rawCwData.length === 0) console.warn("[Revenue] Empty closedWon data");

  const opps = rawCwData
    .map(parseCwOpp)
    .filter((o): o is NonNullable<typeof o> => o !== null);

  const pipelineOpps = pipelineResult
    .map(parsePipelineOpp)
    .filter((o): o is NonNullable<typeof o> => o !== null);

  // Hydrate Industry onto CW opps. The closedWon sheet doesn't carry Industry,
  // but the pipeline tab does. CW deals exist in both sheets, so we can match
  // by oppId — pipeline IDs are 18-char, closedWon IDs are 15-char (the same
  // ID at lower casing precision), so we key on both.
  const industryByOppId = new Map<string, string>();
  for (const r of pipelineResult) {
    const id18 = r["Opportunity ID (18 Char)"];
    const ind = r.Industry;
    if (id18 && ind) {
      industryByOppId.set(id18, ind);
      industryByOppId.set(id18.substring(0, 15), ind);
    }
  }
  let industryHydrated = 0;
  for (const o of opps) {
    if (o.oppId && industryByOppId.has(o.oppId)) {
      o.industry = industryByOppId.get(o.oppId);
      industryHydrated += 1;
    }
  }

  const withOppId = opps.filter((o) => o.oppId).length;
  console.log(`[Revenue] Parsed ${opps.length} CW opps, ${pipelineOpps.length} pipeline opps, ${withOppId} carry SFDC Opportunity ID, ${industryHydrated} CW opps got an Industry from the pipeline tab`);

  return <RevenueDashboard opps={opps} pipelineOpps={pipelineOpps} dataSourceLabel={dataSourceLabel} />;
}
