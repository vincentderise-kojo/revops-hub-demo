import path from "path";
import { RawOpportunity } from "./types";

// Demo build: all data is read from data/demo/ — no Google Sheets or env vars needed.
const DEMO_DIR = path.join(process.cwd(), "data", "demo");

// ── Swappable data source interface ──

export interface DataSource {
  loadOpportunities(): Promise<RawOpportunity[]>;
}

// ── CSV file data source (server-side only) ──

export class CsvDataSource implements DataSource {
  private filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  async loadOpportunities(): Promise<RawOpportunity[]> {
    const fs = await import("fs");
    const PapaMod = await import("papaparse");
    const Papa = PapaMod.default || PapaMod;
    const csvText = fs.readFileSync(this.filePath, "utf-8");
    const result = Papa.parse<RawOpportunity>(csvText, {
      header: true,
      skipEmptyLines: true,
    });
    return result.data;
  }
}

// ── Generic CSV loader (returns typed rows) ──

export async function loadCsvFile<T>(filePath: string): Promise<T[]> {
  const fs = await import("fs");
  const PapaMod = await import("papaparse");
  const Papa = PapaMod.default || PapaMod;
  const csvText = fs.readFileSync(filePath, "utf-8");
  const result = Papa.parse<T>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  return result.data;
}

// ── Factory — always returns demo CSV source ──

export function getDataSource(): DataSource {
  return new CsvDataSource(path.join(DEMO_DIR, "pipeline.csv"));
}

// ── Named CSV paths for each tab ──

export const DEMO_CSV_PATHS = {
  pipeline: path.join(DEMO_DIR, "pipeline.csv"),
  closedWon: path.join(DEMO_DIR, "closedWon.csv"),
  quotas: path.join(DEMO_DIR, "quotas.csv"),
  sdrSets: path.join(DEMO_DIR, "sdrSets.csv"),
  customerAccounts: path.join(DEMO_DIR, "customerAccounts.csv"),
} as const;
