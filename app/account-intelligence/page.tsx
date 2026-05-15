import { Metadata } from "next";
import path from "path";
import {
  parseCustomerAccount,
  parseHierarchyAccount,
  processAccountIntelligence,
} from "@/lib/process-account-intelligence";
import { loadCsvFile, DEMO_CSV_PATHS } from "@/lib/data-loader";
import type { RawOpportunity } from "@/lib/types";
import type {
  EnrFirm,
  RawCustomerAccount,
  RawHierarchyAccount,
  GmvSnapshot,
  ContractAcrSnapshot,
} from "@/lib/types-account-intelligence";
import AccountIntelligenceDashboard from "@/components/account-intelligence-dashboard";

// Demo build: synthetic ENR list lives in data/demo/ as a lightweight JSON.
// The full enr-top-600-2025.json is not included — use a minimal stub instead.
// enr-sfdc-overrides is also omitted; pass an empty map.
import contractAcrSnapshot from "@/data/demo/customer-contract-acr.json";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Account Intelligence | Crestline RevOps Hub",
};

export default async function AccountIntelligencePage() {
  let dataSourceLabel = "Demo CSV";

  // Demo build: no synthetic ENR top-600 or GMV snapshot files.
  // Account Intelligence renders with empty ENR matches and no GMV signals.
  const enrData: EnrFirm[] = [];
  const overrides: Record<string, string> = {};
  // Demo build: no live GMV snapshot — Account Intelligence reads GMV from customerAccounts.csv directly (field not yet populated).
  const gmvSnapshot: GmvSnapshot | null = null;

  let rawCustomers: RawCustomerAccount[] = [];
  let rawPipeline: RawOpportunity[] = [];

  try {
    [rawCustomers, rawPipeline] = await Promise.all([
      loadCsvFile<RawCustomerAccount>(DEMO_CSV_PATHS.customerAccounts),
      loadCsvFile<RawOpportunity>(DEMO_CSV_PATHS.pipeline),
    ]);
  } catch (err) {
    console.error("[Account Intelligence] Data load failed:", err);
    dataSourceLabel = "Error — no data loaded";
  }

  // Demo build: no hierarchy prospects CSV — pass empty array.
  const rawHierarchy: RawHierarchyAccount[] = [];
  // Demo build: no renewals/upsells pipeline tab — pass empty array.
  const rawExpansion: RawOpportunity[] = [];

  const customerAccounts = rawCustomers.map(parseCustomerAccount);
  const hierarchyAccounts = rawHierarchy.map(parseHierarchyAccount);

  // SFDC instance URL unavailable in portfolio demo — expand panel shows non-anchored cells.
  const sfdcInstanceUrl: string | null = null;

  const data = processAccountIntelligence(
    enrData as EnrFirm[],
    customerAccounts,
    hierarchyAccounts,
    rawPipeline,
    rawExpansion,
    overrides as Record<string, string>,
    gmvSnapshot,
    contractAcrSnapshot as ContractAcrSnapshot,
    sfdcInstanceUrl
  );
  data.dataSourceLabel = dataSourceLabel;

  return <AccountIntelligenceDashboard data={data} />;
}
