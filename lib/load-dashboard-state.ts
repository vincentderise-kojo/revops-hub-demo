import path from "path";
import { CsvDataSource, GoogleSheetsDataSource } from "@/lib/data-loader";
import { processPipelineSegmented, parseOpp } from "@/lib/process-pipeline";
import { processSdrPerformance } from "@/lib/process-sdr";
import { fetchQuotaRecords } from "@/lib/quota-loader";
import { fetchSdrMeetings } from "@/lib/sdr-data-loader";
import { fetchQualificationOpps } from "@/lib/qualification-data-loader";
import { buildAePerformanceState, opportunityToAeOpp } from "@/lib/process-ae-performance";
import { SPREADSHEET_ID, SHEET_GIDS } from "@/lib/config";
import type { SegmentedDashboardState } from "@/lib/types";
import type { AePerformanceState } from "@/lib/types-ae-performance";

export interface LoadedDashboardData {
  segmented: SegmentedDashboardState;
  sdrData: ReturnType<typeof processSdrPerformance>;
  aePerformance: AePerformanceState;
  dataSourceLabel: string;
}

export async function loadDashboardData(): Promise<LoadedDashboardData> {
  let rawOpps;
  let dataSourceLabel: string;

  try {
    const sheetsSource = new GoogleSheetsDataSource(SPREADSHEET_ID, SHEET_GIDS.pipeline);
    rawOpps = await sheetsSource.loadOpportunities();
    dataSourceLabel = "Google Sheets";
    console.log(`[Pipeline Pulse] Loaded ${rawOpps.length} opps from Google Sheets`);
  } catch (err) {
    console.warn("[Pipeline Pulse] Google Sheets failed, falling back to CSV:", err);
    const csvPath = path.join(process.cwd(), "data", "report1773939885150.csv");
    const csvSource = new CsvDataSource(csvPath);
    rawOpps = await csvSource.loadOpportunities();
    dataSourceLabel = "CSV fallback";
    console.log(`[Pipeline Pulse] Loaded ${rawOpps.length} opps from CSV fallback`);
  }

  const parsedOpps = rawOpps.map(parseOpp).filter((o): o is NonNullable<typeof o> => o !== null);

  const [quotaRecords, sdrMeetings, qualResult] = await Promise.all([
    fetchQuotaRecords().catch((err) => {
      console.warn("[Pipeline Pulse] Quota fetch failed:", err);
      return [];
    }),
    fetchSdrMeetings().catch((err) => {
      console.warn("[Pipeline Pulse] SDR meetings fetch failed:", err);
      return [];
    }),
    fetchQualificationOpps().catch((err) => {
      console.warn("[AE Performance] Qualification load threw — falling back to empty:", err);
      return { opps: [], available: false };
    }),
  ]);

  const segmented = processPipelineSegmented(rawOpps, undefined, quotaRecords);
  const sdrData = processSdrPerformance(parsedOpps, sdrMeetings, quotaRecords);
  const aePerformance = buildAePerformanceState({
    qualificationOpps: qualResult.opps,
    pipelineOpps: parsedOpps.map(opportunityToAeOpp),
    qualificationDataAvailable: qualResult.available,
    quotaRecords,
  });

  return { segmented, sdrData, aePerformance, dataSourceLabel };
}
