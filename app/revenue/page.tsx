import { GoogleSheetsDataSource } from "@/lib/data-loader";
import { parseCwOpp, parsePipelineOpp } from "@/lib/process-revenue";
import { RawCwOpportunity } from "@/lib/types-revenue";
import RevenueDashboard from "@/components/revenue-dashboard";
import { SPREADSHEET_ID, SHEET_GIDS } from "@/lib/config";

export const dynamic = "force-dynamic";

export default async function RevenuePage() {
  let rawCwData: RawCwOpportunity[];
  let dataSourceLabel = "Google Sheets";

  // Fetch CW tab and Pipeline tab in parallel
  const [cwResult, pipelineResult] = await Promise.all([
    (async () => {
      try {
        const sheetsSource = new GoogleSheetsDataSource(SPREADSHEET_ID, SHEET_GIDS.closedWon);
        const raw = await sheetsSource.loadOpportunities();
        return raw as unknown as RawCwOpportunity[];
      } catch (err) {
        console.error("[Revenue] Failed to load CW data:", err);
        return [];
      }
    })(),
    (async () => {
      try {
        const sheetsSource = new GoogleSheetsDataSource(SPREADSHEET_ID, SHEET_GIDS.pipeline);
        return await sheetsSource.loadOpportunities();
      } catch (err) {
        console.error("[Revenue] Failed to load pipeline data:", err);
        return [];
      }
    })(),
  ]);

  rawCwData = cwResult;
  if (rawCwData.length === 0) dataSourceLabel = "Error — no data loaded";

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
