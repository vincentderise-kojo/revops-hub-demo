// ── Raw types from CSV/JSON ──

export interface EnrFirm {
  enrRank2025: number;
  enrRank2024: number | null;
  firmName: string;
  city: string;
  state: string;
  firmType: string;
  revenue2024Mil: number;
  newContractsMil: number | null;
}

export interface RawCustomerAccount {
  "Parent Account ID": string;
  "Parent Account": string;
  "Account Name": string;
  "Billing State/Province": string;
  Type: string;
  "Last Modified Date": string;
  "Annual Revenue": string;
  "Recurring ARR": string;
  "Trade Designation": string;
  "Account ID": string;
  "Number of Active Assets": string;
  "Trade Organization List": string;
  "Trade Organization Chapter List": string;
  Industry: string;
  "Sub-Industry": string;
  "Account Owner": string;
  "Account URL": string;
  "Original ARR": string;
  "Start Date": string;
  "Active Assets": string;
}

export interface RawHierarchyAccount {
  "Account Name": string;
  "Billing State/Province": string;
  Type: string;
  "Annual Revenue": string;
  Website: string;
  "Account Owner": string;
  "User Holdover Request": string;
  "Account ID (18 Char)": string;
  "Account ID": string;
  "Parent Account ID": string;
  "Parent Account": string;
  "Recurring ARR": string;
  "Ultimate Parent Co": string;
}

// ── Parsed types ──

export interface SfdcAccount {
  accountId: string;
  accountName: string;
  parentAccountId: string | null;
  parentAccountName: string | null;
  billingState: string | null;
  type: string;
  annualRevenue: number;
  recurringArr: number;
  tradeDesignation: string | null;
  activeAssets: number;
  tradeOrgList: string[];
  tradeOrgChapterList: string[];
  industry: string | null;
  subIndustry: string | null;
  accountOwner: string | null;
  accountUrl: string | null;
  originalArr: number;
  startDate: string | null;
  activeAssetList: string[];
  ultimateParentCo: string | null;
  source: "customer" | "hierarchy";
}

// ── Family types ──

export type RevenueSource = "Parent Acct" | "Own Acct" | "Proxy" | "Ultimate Parent";

export interface AccountFamily {
  ultimateParentId: string;
  ultimateParentName: string;
  rankingRevenue: number;
  revenueSource: RevenueSource;
  totalFamilyArr: number;
  totalActiveAssets: number;
  accountCount: number;
  customerCount: number;
  prospectCount: number;
  states: string[];
  tradeDesignations: string[];
  tradeOrgs: string[];
  accountOwners: string[];
  members: SfdcAccount[];
  enrRank: number | null;
}

// ── ENR Matching types ──

export type MatchConfidence = "Tag" | "Manual" | "Name+State" | "Name";
export type MatchStatus = "Customer" | "Former" | "Active Opp" | "Not in SFDC";

export interface EnrMatch {
  enrFirm: EnrFirm;
  matchStatus: MatchStatus;
  isIcp: boolean;
  matchConfidence: MatchConfidence | null;
  matchedAccount: SfdcAccount | null;
  sfdcRevenue: number | null;
  revenueDeltaPct: number | null;
  sfdcArr: number | null;
  hasEnrTag: boolean;
  family: AccountFamily | null;
}

// ── GMV snapshot (Phase 1 static feed) ──

export interface GmvRecord {
  sfdcId18: string;
  sfdcId15: string;
  customer: string;
  annualRevenue: number;
  trade: string | null;
  t12Gmv: number;
  monthsWithData: number;
}

export interface GmvSnapshot {
  windowEnd: string;          // e.g. "2026-03-31"
  generatedAt: string;        // ISO timestamp from the extract script
  source: string;             // e.g. "Finance 2025_09 GMV Backup · Customer Summary"
  recordCount: number;
  records: GmvRecord[];
}

export type GmvMotion = "reprice" | "wallet-share" | "right-sized" | "no-data";

// ── Contract ACR snapshot (Phase 1 static feed) ──

export type ContractAcrError =
  | "no_signed_contract"
  | "no_quote_no_pdf"
  | "no_pdf"
  | "acr_not_found"
  | "sfdc_fetch_failed";

export type ContractAcrMethod = "regex" | "regex_ambiguous" | "claude" | "not_found";

export interface ContractAcrRecord {
  accountId: string;
  // Primary value for downstream signal: PDF when present, else Quote field.
  statedAcr: number | null;
  // Audit dimension — both sources captured independently:
  quoteFieldAcr: number | null;   // Quote.Annual_Construction_Revenue__c (structured SFDC field)
  pdfStatedAcr: number | null;    // From parseContractAcr on the signed PDF
  acrMismatch: boolean;           // True if both populated and disagree by > 5%
  acrMismatchPct: number | null;  // (pdf - field) / field — null when either side is null
  signedDate: string | null;
  sourceOppId: string | null;
  sourceQuoteId: string | null;
  sourceContentVersionId: string | null;
  snapshotRunAt: string;
  method: ContractAcrMethod;
  rawExcerpt: string;
  error?: ContractAcrError;
}

export interface ContractAcrSnapshot {
  generatedAt: string;
  source: string;
  recordCount: number;
  records: Record<string, ContractAcrRecord>;
}

// ── Page state (passed from server to client) ──

export interface AccountIntelligenceData {
  enrMatches: EnrMatch[];
  families: AccountFamily[];
  allOwners: string[];
  allFirmTypes: string[];
  allIndustries: string[];
  allStates: string[];
  allTradeOrgs: string[];
  upsellSignals: UpsellSignal[];
  gmvSnapshot: { windowEnd: string; source: string; matchedFamilies: number } | null;
  contractAcrSnapshot: { generatedAt: string; source: string; matchedFamilies: number; mismatchCount: number } | null;
  dataSourceLabel: string;
}

// ── Hero stat types ──

export interface EnrHeroStats {
  matchedCustomers: number;
  activeOpps: number;
  notInSfdc: number;
  enrCustomerArr: number;
  revenueAccuracyPct: number;
  enrTaggedCount: number;
  enrMatchedCount: number;
  marketPenetrationPct: number;
  formerCustomers: number;
}

export interface TopCustomersHeroStats {
  totalCustomerArr: number;
  customerFamilies: number;
  top10ConcentrationPct: number;
  enrListedCount: number;
  avgFamilyArr: number;
  multiAccountFamilies: number;
  proxyRevenueCount: number;
  statesCovered: number;
}

// ── Upsell Signal types ──

export type SignalStrength = "strong" | "moderate" | "weak" | "no-data";

export type OppCategory = "New Business" | "Upsell" | "Renewal" | "Other";

export interface DiscountHistory {
  accountName: string;
  opportunityName: string;
  category: OppCategory;
  stage: string;
  closeDate: string;
  amount: number;
  recurringArr: number;
  discountPct: number | null;
  recurringDiscountPct: number | null;
  invoiceFrequency: string | null;
  contractTermMonths: number | null;
  isFirstYear: boolean;
}

export interface UpsellSignal {
  family: AccountFamily;
  // Vector 1: Size / ACV Correction
  enrRevenue: number | null;
  sfdcRevenue: number;
  revenueDeltaPct: number | null;
  sizeSignal: SignalStrength;
  // GMV augmentation to Vector 1 (Phase 1)
  t12Gmv: number | null;            // Sum of matched family members' T12 GMV; null = no match in snapshot
  gmvToArRatio: number | null;      // t12Gmv / sfdcRevenue (sfdcRevenue = family.rankingRevenue)
  gmvMotion: GmvMotion;             // "reprice" | "wallet-share" | "right-sized" | "no-data"
  // Contract ACR augmentation to Vector 1 (Phase 2) — customer-self-stated revenue from signed Order Form
  contractAcr: number | null;                       // Primary: PDF stated ACR, else Quote field
  contractAcrDeltaPct: number | null;               // (contractAcr - sfdcRevenue) / sfdcRevenue
  contractAcrSignal: SignalStrength;
  contractAcrSignedDate: string | null;             // ISO date from source opp's CloseDate
  contractAcrSourceUrl: string | null;              // SFDC ContentVersion URL for the source PDF
  contractAcrMethod: ContractAcrMethod | null;      // null when no record present
  contractAcrError: ContractAcrError | null;
  contractAcrExcerpt: string;                       // For expand-panel display
  // Audit dimension: PDF vs Quote field on the same Quote
  quoteFieldAcr: number | null;                     // Quote.Annual_Construction_Revenue__c
  pdfStatedAcr: number | null;                      // parseContractAcr on the signed PDF
  acrMismatch: boolean;                             // |pdf - field| / field > 5% when both present
  acrMismatchPct: number | null;
  // Vector 2: Discount Normalization
  currentDiscountPct: number | null;
  originalDiscountPct: number | null;
  discountHistory: DiscountHistory[];
  contractVintageYears: number | null;
  discountSignal: SignalStrength;
  // Vector 3: Billing Cadence
  currentInvoiceFrequency: string | null;
  isSubAnnual: boolean;
  termsSignal: SignalStrength;
  // Combined
  overallSignal: SignalStrength;
  signalCount: number;
  // ARR comparison
  originalFamilyArr: number;          // From first closed-won NB opp (pipeline sheet) or account fallback
  currentFamilyArr: number;
  arrGrowthPct: number | null;
  hasBeenUpsold: boolean;
  capturedUpsellArr: number;          // Sum of closed-won Upsell types from expansion sheet
  hasOpenRenewal: boolean;
  renewalCloseDate: string | null;
  originalArrSource: "opp" | "account" | "none"; // Where originalFamilyArr came from
  // Recent upsell dampener
  isRecentlyUpsold: boolean;          // true if a closed-won Upsell closed within last 12 months
  recentUpsellDate: string | null;    // close date of most recent closed-won Upsell
  recentUpsellArr: number;            // ARR of most recent closed-won Upsell
  // BPS pricing compression
  activeProducts: string[];           // billable product names derived from Active Assets
  listBps: number | null;             // sum of BPS for current products at family's revenue tier
  actualBps: number | null;           // from the NB closed-won opp's Opportunity BPS field
  bpsDeltaPct: number | null;         // (listBps - actualBps) / listBps — positive = pricing compression
  // Display helpers
  enrRank: number | null;
  totalFamilyArr: number;
  accountOwners: string[];
  customerCount: number;
  accountUrl: string | null;
}

export interface UpsellHeroStats {
  totalCustomersAnalyzed: number;
  strongSignalCount: number;
  moderateSignalCount: number;
  arrWithStrongSignal: number;
  avgDiscountPct: number | null;
  subAnnualCount: number;
  sizeCorrections: number;
  dataGapCount: number;
}
