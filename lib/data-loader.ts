import { RawOpportunity } from "./types";

// Swappable data source interface
export interface DataSource {
  loadOpportunities(): Promise<RawOpportunity[]>;
}

// CSV file data source (server-side only)
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

// Google Sheets data source — fetches the sheet as CSV via public export URL
export class GoogleSheetsDataSource implements DataSource {
  private spreadsheetId: string;
  private gid: string;

  constructor(spreadsheetId: string, gid: string) {
    this.spreadsheetId = spreadsheetId;
    this.gid = gid;
  }

  async loadOpportunities(): Promise<RawOpportunity[]> {
    const url = `https://docs.google.com/spreadsheets/d/${this.spreadsheetId}/export?format=csv&gid=${this.gid}`;
    const response = await fetch(url, { next: { revalidate: 0 } });

    if (!response.ok) {
      throw new Error(
        `Google Sheets fetch failed: ${response.status} ${response.statusText}`
      );
    }

    const csvText = await response.text();

    // Sanity check — Google returns an HTML login page if the sheet isn't shared
    if (csvText.trimStart().startsWith("<!") || csvText.trimStart().startsWith("<html")) {
      throw new Error("Google Sheets returned HTML instead of CSV — is the sheet shared?");
    }

    const PapaMod = await import("papaparse");
    const Papa = PapaMod.default || PapaMod;
    const result = Papa.parse<RawOpportunity>(csvText, {
      header: true,
      skipEmptyLines: true,
    });

    // Exclude rows where Amount is 0 or blank
    return result.data.filter((row) => {
      const amt = parseFloat(row.Amount);
      return !isNaN(amt) && amt > 0;
    });
  }
}

// Future: Endgame MCP data source
// export class EndgameMcpDataSource implements DataSource { ... }
