import { Metadata } from "next";
import {
  fetchSheetCsv,
  parseCustomerAccount,
  parseHierarchyAccount,
  processAccountIntelligence,
} from "@/lib/process-account-intelligence";
import { GoogleSheetsDataSource } from "@/lib/data-loader";
import { SPREADSHEET_ID, SHEET_GIDS, AI_CONFIG } from "@/lib/config";
import type { RawOpportunity } from "@/lib/types";
import type {
  EnrFirm,
  RawCustomerAccount,
  RawHierarchyAccount,
  GmvSnapshot,
  ContractAcrSnapshot,
} from "@/lib/types-account-intelligence";
import AccountIntelligenceDashboard from "@/components/account-intelligence-dashboard";
import { getInstanceUrl } from "@/lib/cw-spotcheck/sfdc";

import enrData from "@/data/enr-top-600-2025.json";
import overrides from "@/data/enr-sfdc-overrides.json";
import gmvSnapshot from "@/data/customer-gmv-snapshot.json";
import contractAcrSnapshot from "@/data/customer-contract-acr.json";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account Intelligence | Kojo RevOps Hub",
};

export default async function AccountIntelligencePage() {
  let dataSourceLabel = "Google Sheets";

  let rawCustomers: RawCustomerAccount[] = [];
  let rawHierarchy: RawHierarchyAccount[] = [];
  let rawPipeline: RawOpportunity[] = [];
  let rawExpansion: RawOpportunity[] = [];

  try {
    const [customers, hierarchy, pipeline, expansion] = await Promise.all([
      fetchSheetCsv<RawCustomerAccount>(AI_CONFIG.sheetGids.customerAccounts),
      fetchSheetCsv<RawHierarchyAccount>(AI_CONFIG.sheetGids.hierarchyProspects),
      new GoogleSheetsDataSource(SPREADSHEET_ID, SHEET_GIDS.pipeline)
        .loadOpportunities()
        .catch((err) => {
          console.error("[Account Intelligence] Pipeline fetch failed:", err);
          return [] as RawOpportunity[];
        }),
      new GoogleSheetsDataSource(SPREADSHEET_ID, SHEET_GIDS.renewalsUpsells)
        .loadOpportunities()
        .catch((err) => {
          console.error("[Account Intelligence] Expansion fetch failed:", err);
          return [] as RawOpportunity[];
        }),
    ]);
    rawCustomers = customers;
    rawHierarchy = hierarchy;
    rawPipeline = pipeline;
    rawExpansion = expansion;
  } catch (err) {
    console.error("[Account Intelligence] Data fetch failed:", err);
    dataSourceLabel = "Error — no data loaded";
  }

  const customerAccounts = rawCustomers.map(parseCustomerAccount);
  const hierarchyAccounts = rawHierarchy.map(parseHierarchyAccount);

  // Best-effort SFDC instance URL for building Contract Reference source PDF links.
  // Local dev without .env.local gets a null URL — expand panel shows non-anchored cells.
  let sfdcInstanceUrl: string | null = null;
  try {
    sfdcInstanceUrl = await getInstanceUrl();
  } catch (err) {
    console.warn("[Account Intelligence] SFDC instance URL unavailable:", err);
  }

  const data = processAccountIntelligence(
    enrData as EnrFirm[],
    customerAccounts,
    hierarchyAccounts,
    rawPipeline,
    rawExpansion,
    overrides as Record<string, string>,
    gmvSnapshot as GmvSnapshot,
    contractAcrSnapshot as ContractAcrSnapshot,
    sfdcInstanceUrl
  );
  data.dataSourceLabel = dataSourceLabel;

  return <AccountIntelligenceDashboard data={data} />;
}
