import Papa from "papaparse";
import {
  EnrFirm,
  RawCustomerAccount,
  RawHierarchyAccount,
  SfdcAccount,
  AccountFamily,
  RevenueSource,
  EnrMatch,
  MatchConfidence,
  KojoStatus,
  AccountIntelligenceData,
  EnrHeroStats,
  TopCustomersHeroStats,
  UpsellSignal,
  UpsellHeroStats,
  DiscountHistory,
  SignalStrength,
  OppCategory,
  GmvRecord,
  GmvSnapshot,
  GmvMotion,
  ContractAcrRecord,
  ContractAcrSnapshot,
  ContractAcrMethod,
  ContractAcrError,
} from "./types-account-intelligence";
import { AI_CONFIG, OPEN_STAGES, UPSELL_CONFIG, GMV_CONFIG } from "./config";
import { assetsToProducts, computeListBps } from "./pricing-config";
import type { RawOpportunity } from "./types";

// ── Parsing ──

function parseNumber(val: string | undefined | null): number {
  if (!val) return 0;
  const cleaned = val.replace(/[$,]/g, "").trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseSemicolonList(val: string | undefined | null): string[] {
  if (!val) return [];
  return [...new Set(
    val.split(";").map((s) => s.trim()).filter(Boolean)
  )];
}

export function parseCustomerAccount(raw: RawCustomerAccount): SfdcAccount {
  return {
    accountId: raw["Account ID"] || "",
    accountName: raw["Account Name"] || "",
    parentAccountId: raw["Parent Account ID"] || null,
    parentAccountName: raw["Parent Account"] || null,
    billingState: raw["Billing State/Province"] || null,
    type: raw.Type || "",
    annualRevenue: parseNumber(raw["Annual Revenue"]),
    recurringArr: parseNumber(raw["Recurring ARR"]),
    tradeDesignation: raw["Trade Designation"] || null,
    activeAssets: parseInt(raw["Number of Active Assets"] || "0", 10) || 0,
    tradeOrgList: parseSemicolonList(raw["Trade Organization List"]),
    tradeOrgChapterList: parseSemicolonList(raw["Trade Organization Chapter List"]),
    industry: raw.Industry || null,
    subIndustry: raw["Sub-Industry"] || null,
    accountOwner: raw["Account Owner"] || null,
    accountUrl: raw["Account URL"] || null,
    originalArr: parseNumber(raw["Original ARR"]),
    startDate: raw["Start Date"] || null,
    activeAssetList: parseSemicolonList(raw["Active Assets"]),
    ultimateParentCo: null,
    source: "customer",
  };
}

export function parseHierarchyAccount(raw: RawHierarchyAccount): SfdcAccount {
  return {
    accountId: raw["Account ID"] || "",
    accountName: raw["Account Name"] || "",
    parentAccountId: raw["Parent Account ID"] || null,
    parentAccountName: raw["Parent Account"] || null,
    billingState: raw["Billing State/Province"] || null,
    type: raw.Type || "",
    annualRevenue: parseNumber(raw["Annual Revenue"]),
    recurringArr: parseNumber(raw["Recurring ARR"]),
    tradeDesignation: null,
    activeAssets: 0,
    tradeOrgList: [],
    tradeOrgChapterList: [],
    industry: null,
    subIndustry: null,
    accountOwner: raw["Account Owner"] || null,
    accountUrl: null,
    originalArr: 0,
    startDate: null,
    activeAssetList: [],
    ultimateParentCo: raw["Ultimate Parent Co"] || null,
    source: "hierarchy",
  };
}

// ── Parent Resolution ──

export function buildAccountMap(
  customerAccounts: SfdcAccount[],
  hierarchyAccounts: SfdcAccount[]
): Map<string, SfdcAccount> {
  const map = new Map<string, SfdcAccount>();
  // Customer accounts take priority over hierarchy for the same ID
  for (const acct of hierarchyAccounts) {
    if (acct.accountId) map.set(acct.accountId, acct);
  }
  for (const acct of customerAccounts) {
    if (acct.accountId) map.set(acct.accountId, acct);
  }
  return map;
}

export function resolveUltimateParentId(
  accountId: string,
  accountMap: Map<string, SfdcAccount>
): string {
  const visited = new Set<string>();
  let current = accountId;
  while (true) {
    const acct = accountMap.get(current);
    if (!acct || !acct.parentAccountId || visited.has(current)) break;
    visited.add(current);
    if (!accountMap.has(acct.parentAccountId)) break;
    current = acct.parentAccountId;
  }
  return current;
}

export function buildFamilies(
  accountMap: Map<string, SfdcAccount>
): AccountFamily[] {
  // Step 1: Group by Ultimate Parent Co name (from hierarchy tab) or by ID chain
  const nameToFamily = new Map<string, string[]>();
  const idToUltimateId = new Map<string, string>();

  for (const [id, acct] of accountMap) {
    if (acct.ultimateParentCo) {
      const key = acct.ultimateParentCo.trim().toLowerCase();
      if (!nameToFamily.has(key)) nameToFamily.set(key, []);
      nameToFamily.get(key)!.push(id);
    } else {
      const ultimateId = resolveUltimateParentId(id, accountMap);
      idToUltimateId.set(id, ultimateId);
    }
  }

  // Step 2: Group accounts into families
  const familyMap = new Map<string, SfdcAccount[]>();

  for (const [, accountIds] of nameToFamily) {
    const familyKey = `name:${accountIds[0]}`;
    familyMap.set(familyKey, accountIds.map((id) => accountMap.get(id)!));
  }

  for (const [id, ultimateId] of idToUltimateId) {
    const acct = accountMap.get(id)!;
    if (acct.ultimateParentCo) continue;

    // Check if the resolved ultimate parent belongs to a name-based family
    const ultimateAcct = accountMap.get(ultimateId);
    if (ultimateAcct?.ultimateParentCo) {
      const key = ultimateAcct.ultimateParentCo.trim().toLowerCase();
      if (!nameToFamily.has(key)) nameToFamily.set(key, []);
      nameToFamily.get(key)!.push(id);
      // Re-add to familyMap under the name-based key
      const nameKey = `name:${nameToFamily.get(key)![0]}`;
      if (!familyMap.has(nameKey)) familyMap.set(nameKey, []);
      familyMap.get(nameKey)!.push(acct);
      continue;
    }

    const familyKey = `id:${ultimateId}`;
    if (!familyMap.has(familyKey)) familyMap.set(familyKey, []);
    familyMap.get(familyKey)!.push(acct);
  }

  // Step 3: Build family objects
  const families: AccountFamily[] = [];

  for (const [familyKey, members] of familyMap) {
    let ultimateParentName: string;
    let ultimateParentId: string;
    let rankingRevenue: number;
    let revenueSource: RevenueSource;

    if (familyKey.startsWith("name:")) {
      const firstMember = members[0];
      ultimateParentName = firstMember.ultimateParentCo!;
      ultimateParentId = familyKey;
      const parentMatch = members.find(
        (m) => m.accountName.toLowerCase() === ultimateParentName.toLowerCase()
      );
      if (parentMatch && parentMatch.annualRevenue > 0) {
        rankingRevenue = parentMatch.annualRevenue;
        revenueSource = "Ultimate Parent";
      } else {
        rankingRevenue = Math.max(...members.map((m) => m.annualRevenue), 0);
        revenueSource = "Proxy";
      }
    } else {
      const ultimateId = familyKey.replace("id:", "");
      const ultimateParent = accountMap.get(ultimateId);
      ultimateParentId = ultimateId;

      if (members.length === 1) {
        ultimateParentName = members[0].accountName;
        rankingRevenue = members[0].annualRevenue;
        revenueSource = "Own Acct";
      } else if (ultimateParent) {
        ultimateParentName = ultimateParent.accountName;
        if (ultimateParent.annualRevenue > 0) {
          rankingRevenue = ultimateParent.annualRevenue;
          revenueSource = "Parent Acct";
        } else {
          rankingRevenue = Math.max(...members.map((m) => m.annualRevenue), 0);
          revenueSource = "Proxy";
        }
      } else {
        ultimateParentName = members[0].parentAccountName || members[0].accountName;
        rankingRevenue = Math.max(...members.map((m) => m.annualRevenue), 0);
        revenueSource = "Proxy";
      }
    }

    const allStates = [...new Set(members.map((m) => m.billingState).filter(Boolean))] as string[];
    const allDesignations = [...new Set(members.map((m) => m.tradeDesignation).filter(Boolean))] as string[];
    const allOrgs = [...new Set(members.flatMap((m) => m.tradeOrgList))];
    const allOwners = [...new Set(members.map((m) => m.accountOwner).filter(Boolean))] as string[];

    families.push({
      ultimateParentId,
      ultimateParentName,
      rankingRevenue,
      revenueSource,
      totalFamilyArr: members.reduce((sum, m) => sum + m.recurringArr, 0),
      totalActiveAssets: members.reduce((sum, m) => sum + m.activeAssets, 0),
      accountCount: members.length,
      customerCount: members.filter((m) => m.type === "Customer - Active").length,
      prospectCount: members.filter((m) => m.type.toLowerCase().includes("prospect")).length,
      states: allStates,
      tradeDesignations: allDesignations,
      tradeOrgs: allOrgs,
      accountOwners: allOwners,
      members,
      enrRank: null,
    });
  }

  families.sort((a, b) => b.rankingRevenue - a.rankingRevenue);
  return families;
}

// ── Name Normalization ──

export function normalizeName(name: string): string {
  let n = name.toLowerCase().trim();
  n = n.replace(/[.,'"()&]/g, "").replace(/\s+/g, " ");
  for (const suffix of AI_CONFIG.nameStripSuffixes) {
    const re = new RegExp(`\\b${suffix}\\b`, "gi");
    n = n.replace(re, "");
  }
  return n.trim().replace(/\s+/g, " ");
}

export function normalizeState(state: string): string {
  const lower = state.toLowerCase().trim();
  return AI_CONFIG.stateAbbreviations[lower] || lower.toUpperCase().replace(/\./g, "");
}

// ── ENR Matching ──

export function matchEnrFirms(
  enrFirms: EnrFirm[],
  accountMap: Map<string, SfdcAccount>,
  families: AccountFamily[],
  pipelineOpps: RawOpportunity[],
  overrides: Record<string, string>
): EnrMatch[] {
  const accountsByNormalizedName = new Map<string, SfdcAccount[]>();
  const taggedAccounts = new Map<string, SfdcAccount>();

  for (const [, acct] of accountMap) {
    const normName = normalizeName(acct.accountName);
    if (!accountsByNormalizedName.has(normName)) {
      accountsByNormalizedName.set(normName, []);
    }
    accountsByNormalizedName.get(normName)!.push(acct);

    if (acct.tradeOrgChapterList.some((t) => t.includes(AI_CONFIG.enrTagIdentifier))) {
      taggedAccounts.set(acct.accountId, acct);
    }
  }

  const openOppAccountNames = new Set<string>();
  for (const opp of pipelineOpps) {
    if ((OPEN_STAGES as readonly string[]).includes(opp.Stage)) {
      if (opp["Account Name"]) {
        openOppAccountNames.add(normalizeName(opp["Account Name"]));
      }
    }
  }

  const accountToFamily = new Map<string, AccountFamily>();
  for (const family of families) {
    for (const member of family.members) {
      accountToFamily.set(member.accountId, family);
    }
  }

  return enrFirms.map((firm) => {
    let matchedAccount: SfdcAccount | null = null;
    let matchConfidence: MatchConfidence | null = null;

    const normFirmName = normalizeName(firm.firmName);
    const normFirmState = normalizeState(firm.state);

    // Priority 1: Trade Org tag match
    for (const [, acct] of taggedAccounts) {
      const normAcctName = normalizeName(acct.accountName);
      if (
        normAcctName.includes(normFirmName) ||
        normFirmName.includes(normAcctName) ||
        normAcctName === normFirmName
      ) {
        matchedAccount = acct;
        matchConfidence = "Tag";
        break;
      }
    }

    // Priority 2: Manual override
    if (!matchedAccount && overrides[firm.firmName]) {
      const overrideName = overrides[firm.firmName];
      for (const [, acct] of accountMap) {
        if (acct.accountName === overrideName) {
          matchedAccount = acct;
          matchConfidence = "Manual";
          break;
        }
      }
    }

    // Priority 3: Name + State match
    if (!matchedAccount) {
      const candidates = accountsByNormalizedName.get(normFirmName);
      if (candidates) {
        const stateMatch = candidates.find(
          (c) => c.billingState && normalizeState(c.billingState) === normFirmState
        );
        if (stateMatch) {
          matchedAccount = stateMatch;
          matchConfidence = "Name+State";
        } else {
          matchedAccount = candidates[0];
          matchConfidence = "Name";
        }
      }
    }

    // Fallback: substring matching — requires state match to avoid cross-state false
    // positives (e.g., "Broadway Electric Service Company" TN vs ENR's "Broadway
    // Electric Inc" IL, which share the same prefix but are different companies).
    if (!matchedAccount) {
      for (const [normName, accts] of accountsByNormalizedName) {
        if (normName.length > 3 && normFirmName.length > 3) {
          if (normName.includes(normFirmName) || normFirmName.includes(normName)) {
            const stateMatch = accts.find(
              (c) => c.billingState && normalizeState(c.billingState) === normFirmState
            );
            if (stateMatch) {
              matchedAccount = stateMatch;
              matchConfidence = "Name+State";
              break;
            }
            // No state match — don't accept a substring-only match; keep searching.
          }
        }
      }
    }

    // Determine CRM Status
    let kojoStatus: KojoStatus = "Not in SFDC";
    if (matchedAccount) {
      if (matchedAccount.type === "Customer - Active") {
        kojoStatus = "Customer";
      } else if (
        matchedAccount.type.toLowerCase().includes("churn") ||
        matchedAccount.type.toLowerCase().includes("cancel") ||
        matchedAccount.type.toLowerCase().includes("former")
      ) {
        kojoStatus = "Former";
      } else {
        kojoStatus = "Active Opp";
      }
    } else if (openOppAccountNames.has(normFirmName)) {
      kojoStatus = "Active Opp";
    }

    // ICP classification
    const firmTypes = firm.firmType.split("/").map((t) => t.trim());
    const isIcp = firmTypes.some(
      (t) => !(AI_CONFIG.nonIcpFirmTypes as readonly string[]).includes(t)
    );

    // Revenue delta
    let revenueDeltaPct: number | null = null;
    if (matchedAccount && matchedAccount.annualRevenue > 0 && firm.revenue2024Mil > 0) {
      const enrRevDollars = firm.revenue2024Mil * 1_000_000;
      revenueDeltaPct = (matchedAccount.annualRevenue - enrRevDollars) / enrRevDollars;
    }

    const hasEnrTag = matchedAccount
      ? matchedAccount.tradeOrgChapterList.some((t) => t.includes(AI_CONFIG.enrTagIdentifier))
      : false;

    const family = matchedAccount ? accountToFamily.get(matchedAccount.accountId) || null : null;

    if (family) {
      family.enrRank = firm.enrRank2025;
    }

    return {
      enrFirm: firm,
      kojoStatus,
      isIcp,
      matchConfidence,
      matchedAccount,
      sfdcRevenue: matchedAccount?.annualRevenue ?? null,
      revenueDeltaPct,
      sfdcArr: matchedAccount?.recurringArr ?? null,
      hasEnrTag,
      family,
    };
  });
}

// ── Hero Stats ──

export function computeEnrHeroStats(matches: EnrMatch[]): EnrHeroStats {
  const customers = matches.filter((m) => m.kojoStatus === "Customer");
  const activeOpps = matches.filter((m) => m.kojoStatus === "Active Opp");
  const notInSfdc = matches.filter((m) => m.kojoStatus === "Not in SFDC");
  const former = matches.filter((m) => m.kojoStatus === "Former");
  const matched = matches.filter((m) => m.matchedAccount !== null);

  const withRevDelta = matched.filter((m) => m.revenueDeltaPct !== null);
  const accurate = withRevDelta.filter(
    (m) => Math.abs(m.revenueDeltaPct!) <= AI_CONFIG.revenueDeltaThresholds.accurate
  );

  const tagged = matched.filter((m) => m.hasEnrTag);

  return {
    kojoCustomers: customers.length,
    activeOpps: activeOpps.length,
    notInSfdc: notInSfdc.length,
    enrCustomerArr: customers.reduce((sum, m) => sum + (m.sfdcArr || 0), 0),
    revenueAccuracyPct: withRevDelta.length > 0 ? accurate.length / withRevDelta.length : 0,
    enrTaggedCount: tagged.length,
    enrMatchedCount: matched.length,
    marketPenetrationPct: customers.length / matches.length,
    formerCustomers: former.length,
  };
}

export function computeTopCustomersHeroStats(families: AccountFamily[]): TopCustomersHeroStats {
  const totalArr = families.reduce((sum, f) => sum + f.totalFamilyArr, 0);
  const sorted = [...families].sort((a, b) => b.totalFamilyArr - a.totalFamilyArr);
  const top10Arr = sorted.slice(0, 10).reduce((sum, f) => sum + f.totalFamilyArr, 0);
  const allStates = new Set(families.flatMap((f) => f.states));

  return {
    totalCustomerArr: totalArr,
    customerFamilies: families.length,
    top10ConcentrationPct: totalArr > 0 ? top10Arr / totalArr : 0,
    enrListedCount: families.filter((f) => f.enrRank !== null).length,
    avgFamilyArr: families.length > 0 ? totalArr / families.length : 0,
    multiAccountFamilies: families.filter((f) => f.accountCount > 1).length,
    proxyRevenueCount: families.filter((f) => f.revenueSource === "Proxy").length,
    statesCovered: allStates.size,
  };
}

// ── Upsell Signal Computation ──

function categorizeOpp(opp: RawOpportunity): OppCategory {
  const t = (opp.Type || "").toLowerCase().trim();
  const rt = (opp["Opportunity Record Type"] || "").toLowerCase().trim();
  if (t.startsWith("upsell") || rt === "upsell") return "Upsell";
  if (t === "renewal" || rt === "renewal") return "Renewal";
  if (t === "new business" || rt === "new business") return "New Business";
  return "Other";
}

function toDiscountHistoryEntry(opp: RawOpportunity): DiscountHistory {
  const discountRaw = opp["Discount Percentage"]?.replace(/[%,]/g, "").trim();
  const recurringRaw = opp["Recurring Discount Percentage"]?.replace(/[%,]/g, "").trim();
  const contractRaw = opp["Contract Term (Month)"]?.trim();

  return {
    accountName: opp["Account Name"] || "",
    opportunityName: opp["Opportunity Name"] || "",
    category: categorizeOpp(opp),
    stage: opp.Stage || "",
    closeDate: opp["Close Date"] || "",
    amount: parseFloat((opp.Amount || "0").replace(/[$,]/g, "")) || 0,
    recurringArr: parseFloat((opp["Recurring ARR"] || "0").replace(/[$,]/g, "")) || 0,
    discountPct: discountRaw ? parseFloat(discountRaw) / 100 : null,
    recurringDiscountPct: recurringRaw ? parseFloat(recurringRaw) / 100 : null,
    invoiceFrequency: opp["Invoice Frequency"]?.trim() || null,
    contractTermMonths: contractRaw ? parseInt(contractRaw, 10) || null : null,
    isFirstYear: false,
  };
}

function distanceFromBand(ratio: number): number {
  if (ratio < GMV_CONFIG.lowerBand) return GMV_CONFIG.lowerBand - ratio;
  if (ratio > GMV_CONFIG.upperBand) return ratio - GMV_CONFIG.upperBand;
  return 0;
}

function gmvSignalStrength(ratio: number | null): SignalStrength {
  if (ratio === null) return "no-data";
  const d = distanceFromBand(ratio);
  if (d === 0) return "weak";
  if (d > GMV_CONFIG.distanceThresholds.strong) return "strong";
  if (d > GMV_CONFIG.distanceThresholds.moderate) return "moderate";
  return "weak";
}

export function maxStrength(...inputs: SignalStrength[]): SignalStrength {
  const rank: Record<SignalStrength, number> = { "no-data": 0, weak: 1, moderate: 2, strong: 3 };
  return inputs.reduce((acc, cur) => (rank[cur] > rank[acc] ? cur : acc), "no-data" as SignalStrength);
}

export function deriveContractAcrSignal(
  contractAcr: number | null,
  sfdcRevenue: number
): { contractAcrDeltaPct: number | null; contractAcrSignal: SignalStrength } {
  if (contractAcr === null || sfdcRevenue <= 0) {
    return { contractAcrDeltaPct: null, contractAcrSignal: "no-data" };
  }
  const delta = (contractAcr - sfdcRevenue) / sfdcRevenue;
  const abs = Math.abs(delta);
  let strength: SignalStrength;
  if (abs > AI_CONFIG.revenueDeltaThresholds.warning) strength = "strong";
  else if (abs > AI_CONFIG.revenueDeltaThresholds.accurate) strength = "moderate";
  else strength = "weak";
  return { contractAcrDeltaPct: delta, contractAcrSignal: strength };
}

function gmvMotionFor(ratio: number | null): GmvMotion {
  if (ratio === null) return "no-data";
  if (ratio > GMV_CONFIG.upperBand) return "reprice";
  if (ratio < GMV_CONFIG.lowerBand) return "wallet-share";
  return "right-sized";
}

export function computeUpsellSignals(
  families: AccountFamily[],
  enrMatches: EnrMatch[],
  pipelineOpps: RawOpportunity[],
  expansionOpps: RawOpportunity[],
  gmvRecords: GmvRecord[] = [],
  contractAcrRecords: Record<string, ContractAcrRecord> = {},
  sfdcInstanceUrl: string | null = null
): UpsellSignal[] {
  // Build a Contract ACR lookup keyed by both 15-char and 18-char SFDC Account IDs.
  // Snapshot keys are 18-char (from gmv.records.sfdcId18); Coefficient customerAccounts sync
  // returns 15-char IDs in the "Account ID" column. Indexing by both lets the family-member
  // lookup hit regardless of which format the customer-account row carries.
  const contractAcrLookup = new Map<string, ContractAcrRecord>();
  for (const [id, record] of Object.entries(contractAcrRecords)) {
    contractAcrLookup.set(id, record);
    if (id.length === 18) contractAcrLookup.set(id.slice(0, 15), record);
  }

  // Build ENR lookup by account ID
  const enrByAccountId = new Map<string, EnrMatch>();
  for (const match of enrMatches) {
    if (match.matchedAccount) {
      enrByAccountId.set(match.matchedAccount.accountId, match);
    }
  }

  // Build GMV lookup by both 18-char and 15-char Salesforce IDs.
  // Family members can carry either form depending on which SFDC report they came from,
  // so keying on both avoids silent match misses.
  const gmvById = new Map<string, GmvRecord>();
  for (const rec of gmvRecords) {
    if (rec.sfdcId18) gmvById.set(rec.sfdcId18, rec);
    if (rec.sfdcId15) gmvById.set(rec.sfdcId15, rec);
  }

  // Build opp lookup by normalized account name — includes BOTH sheets, all stages
  const oppsByAccount = new Map<string, DiscountHistory[]>();
  const pushOpp = (opp: RawOpportunity) => {
    const accountName = opp["Account Name"];
    if (!accountName) return;
    const normName = normalizeName(accountName);
    if (!oppsByAccount.has(normName)) oppsByAccount.set(normName, []);
    oppsByAccount.get(normName)!.push(toDiscountHistoryEntry(opp));
  };
  for (const opp of pipelineOpps) pushOpp(opp);
  for (const opp of expansionOpps) pushOpp(opp);

  // Sort each account's opps by close date
  for (const [, opps] of oppsByAccount) {
    opps.sort((a, b) => a.closeDate.localeCompare(b.closeDate));
  }

  // Compute signals per customer family
  return families
    .filter((f) => f.customerCount > 0)
    .map((family) => {
      // Find ENR match for any member
      let enrMatch: EnrMatch | null = null;
      for (const member of family.members) {
        const match = enrByAccountId.get(member.accountId);
        if (match) { enrMatch = match; break; }
      }

      // Collect opp history across all family members
      const allHistory: DiscountHistory[] = [];
      for (const member of family.members) {
        const normName = normalizeName(member.accountName);
        const opps = oppsByAccount.get(normName) || [];
        allHistory.push(...opps);
      }
      allHistory.sort((a, b) => a.closeDate.localeCompare(b.closeDate));

      // Categorized slices
      const closedWon = allHistory.filter((d) => d.stage === "Closed Won");
      const firstNbClosedWon = closedWon.find((d) => d.category === "New Business") ?? null;
      // Fallback for legacy customers without a captured NB opp: use the earliest closed-won of any type.
      // Renewals reflect the customer's contracted pricing, so they're a valid proxy.
      const firstClosedWonAny = closedWon.length > 0 ? closedWon[0] : null;
      const firstPricingOpp = firstNbClosedWon ?? firstClosedWonAny;
      const latestClosedWonAny = closedWon.length > 0 ? closedWon[closedWon.length - 1] : null;
      const upsellsClosedWon = closedWon.filter((d) => d.category === "Upsell");
      const openRenewals = allHistory.filter(
        (d) => d.category === "Renewal" &&
               d.stage !== "Closed Won" &&
               d.stage !== "Closed Lost" &&
               d.stage !== "Unable to Qualify/Engage"
      );

      // Mark the first year opp (used for discount signal vintage calc)
      if (firstNbClosedWon) firstNbClosedWon.isFirstYear = true;
      else if (allHistory.length > 0) allHistory[0].isFirstYear = true;

      // Original ARR: prefer the first closed-won NB opp's Recurring ARR
      // Fall back to the account field, then null
      let originalFamilyArr = 0;
      let originalArrSource: "opp" | "account" | "none" = "none";
      if (firstNbClosedWon && firstNbClosedWon.recurringArr > 0) {
        originalFamilyArr = firstNbClosedWon.recurringArr;
        originalArrSource = "opp";
      } else {
        const accountSum = family.members.reduce((sum, m) => sum + m.originalArr, 0);
        if (accountSum > 0) {
          originalFamilyArr = accountSum;
          originalArrSource = "account";
        }
      }

      const capturedUpsellArr = upsellsClosedWon.reduce((sum, d) => sum + d.recurringArr, 0);
      const hasOpenRenewal = openRenewals.length > 0;
      const renewalCloseDate = hasOpenRenewal ? openRenewals[0].closeDate : null;

      // Recent upsell dampener — if a closed-won upsell landed within the last 12 months,
      // the CSM just did the work. Billing/discount signals shouldn't push for more outreach.
      const mostRecentUpsell = upsellsClosedWon.length > 0
        ? upsellsClosedWon.reduce((latest, d) => (d.closeDate > latest.closeDate ? d : latest))
        : null;
      let isRecentlyUpsold = false;
      let recentUpsellDate: string | null = null;
      let recentUpsellArr = 0;
      if (mostRecentUpsell?.closeDate) {
        const upsellClose = new Date(mostRecentUpsell.closeDate);
        const now = new Date();
        const monthsSince = (now.getTime() - upsellClose.getTime()) / (1000 * 60 * 60 * 24 * 30.44);
        if (monthsSince >= 0 && monthsSince <= 12) {
          isRecentlyUpsold = true;
          recentUpsellDate = mostRecentUpsell.closeDate;
          recentUpsellArr = mostRecentUpsell.recurringArr;
        }
      }

      // ── BPS Pricing Compression ──
      // Union of active assets across all customer members → billable product list.
      // List BPS = sum of product BPS at the family's annual revenue tier.
      // Actual BPS = Opportunity BPS from the first closed-won NB opp (already sold rate).
      const assetUnion = new Set<string>();
      for (const m of family.members) {
        for (const a of m.activeAssetList) assetUnion.add(a);
      }
      const activeProducts = assetsToProducts([...assetUnion]);
      let listBps: number | null = null;
      let actualBps: number | null = null;
      let bpsDeltaPct: number | null = null;
      if (activeProducts.length > 0 && family.rankingRevenue > 0) {
        listBps = computeListBps(activeProducts, family.rankingRevenue);
      }
      // Prefer the NB opp's BPS. Fall back to any closed-won opp (e.g., a renewal) so
      // legacy customers without a captured NB opp still show their current rate.
      if (firstPricingOpp) {
        const sourceOpp = [...pipelineOpps, ...expansionOpps].find(
          (opp) =>
            opp.Stage === "Closed Won" &&
            opp["Opportunity Name"] === firstPricingOpp.opportunityName
        );
        if (sourceOpp) {
          const bpsRaw = sourceOpp["Opportunity BPS"]?.trim();
          if (bpsRaw) {
            const parsed = parseFloat(bpsRaw);
            // BPS = 0 is not a real pricing signal (often blank renewals), skip it
            if (!isNaN(parsed) && parsed > 0) actualBps = parsed;
          }
        }
      }
      if (listBps !== null && listBps > 0 && actualBps !== null) {
        bpsDeltaPct = (listBps - actualBps) / listBps;
      }

      // ── Vector 1: Size / ACV Correction ──
      const enrRevenue = enrMatch ? enrMatch.enrFirm.revenue2024Mil * 1_000_000 : null;
      const sfdcRevenue = family.rankingRevenue;
      const revenueDeltaPct = enrMatch?.revenueDeltaPct ?? null;

      let enrSizeSignal: SignalStrength = "no-data";
      if (revenueDeltaPct !== null) {
        const abs = Math.abs(revenueDeltaPct);
        if (abs > AI_CONFIG.revenueDeltaThresholds.warning) enrSizeSignal = "strong";
        else if (abs > AI_CONFIG.revenueDeltaThresholds.accurate) enrSizeSignal = "moderate";
        else enrSizeSignal = "weak";
      }

      // GMV augmentation — sum T12 across all matched family members.
      // Ratio uses family.rankingRevenue (same denominator as the Size signal).
      let t12Gmv: number | null = null;
      for (const m of family.members) {
        const rec = gmvById.get(m.accountId);
        if (rec) t12Gmv = (t12Gmv ?? 0) + rec.t12Gmv;
      }
      const gmvToArRatio = t12Gmv !== null && sfdcRevenue > 0 ? t12Gmv / sfdcRevenue : null;
      const gmvSizeSignal = gmvSignalStrength(gmvToArRatio);
      const gmvMotion = gmvMotionFor(gmvToArRatio);

      // Contract ACR — customer-self-stated Annual Construction Revenue from latest signed PDF.
      // The snapshot is keyed by the customer account id where the latest signed contract sits.
      // For name-based families ultimateParentId is a "name:..." string that won't match, and
      // for multi-member families the signed contract may be on a child account — so iterate all
      // members and pick the one with the most recent signedDate.
      let contractAcrRecord: ContractAcrRecord | undefined;
      for (const m of family.members) {
        const candidate = contractAcrLookup.get(m.accountId);
        if (!candidate) continue;
        if (!contractAcrRecord) {
          contractAcrRecord = candidate;
          continue;
        }
        if ((candidate.signedDate ?? "") > (contractAcrRecord.signedDate ?? "")) {
          contractAcrRecord = candidate;
        }
      }
      const contractAcr = contractAcrRecord?.statedAcr ?? null;
      const { contractAcrDeltaPct, contractAcrSignal } = deriveContractAcrSignal(contractAcr, sfdcRevenue);
      const contractAcrSourceUrl =
        contractAcrRecord?.sourceContentVersionId && sfdcInstanceUrl
          ? `${sfdcInstanceUrl}/lightning/r/ContentVersion/${contractAcrRecord.sourceContentVersionId}/view`
          : null;

      // Combined Size signal = strongest of ENR delta, GMV band, and Contract ACR delta.
      const sizeSignal: SignalStrength = maxStrength(enrSizeSignal, gmvSizeSignal, contractAcrSignal);

      // ── Vector 2: Discount Normalization ──
      // Anchor to the New Business opp — that's the base pricing relationship.
      // Upsell discounts can be negative (premium pricing) and shouldn't drive the signal.
      // For legacy customers without a captured NB opp, fall back to the earliest closed-won
      // with a discount value (typically a renewal, which reflects contracted pricing).
      const originalDiscountPct = firstNbClosedWon?.discountPct
        ?? closedWon.find((d) => d.discountPct !== null && d.category !== "Upsell")?.discountPct
        ?? null;
      // Current discount = most recent closed-won (non-Upsell) with a discount value.
      // This surfaces step-downs or step-ups that happened at renewal.
      const currentDiscountPct = [...closedWon]
        .reverse()
        .find((d) => d.discountPct !== null && d.category !== "Upsell")?.discountPct
        ?? null;

      let contractVintageYears: number | null = null;
      if (firstPricingOpp?.closeDate) {
        const firstClose = new Date(firstPricingOpp.closeDate);
        const now = new Date();
        contractVintageYears = Math.round(
          ((now.getTime() - firstClose.getTime()) / (365.25 * 24 * 60 * 60 * 1000)) * 10
        ) / 10;
      }

      let discountSignal: SignalStrength = "no-data";
      if (currentDiscountPct !== null) {
        if (
          currentDiscountPct > UPSELL_CONFIG.discountThresholds.strong &&
          (contractVintageYears ?? 0) > UPSELL_CONFIG.vintageYearsForStrongDiscount
        ) {
          discountSignal = "strong";
        } else if (currentDiscountPct > UPSELL_CONFIG.discountThresholds.moderate) {
          discountSignal = "moderate";
        } else {
          discountSignal = "weak";
        }
      }

      // ── Vector 3: Billing Cadence ──
      // Use the latest closed-won opp's invoice frequency (most recent signal of billing cadence)
      const latestCwOpp = closedWon.length > 0 ? closedWon[closedWon.length - 1] : null;
      const currentInvoiceFrequency = latestCwOpp?.invoiceFrequency ?? null;
      const isSubAnnual = currentInvoiceFrequency
        ? !(UPSELL_CONFIG.optimalInvoiceFrequencies as readonly string[]).includes(
            currentInvoiceFrequency.toLowerCase()
          )
        : false;

      let termsSignal: SignalStrength = "no-data";
      if (currentInvoiceFrequency !== null) {
        const freq = currentInvoiceFrequency.toLowerCase();
        if ((UPSELL_CONFIG.strongInvoiceFrequencies as readonly string[]).includes(freq)) {
          termsSignal = "strong";
        } else if ((UPSELL_CONFIG.moderateInvoiceFrequencies as readonly string[]).includes(freq)) {
          termsSignal = "moderate";
        } else {
          termsSignal = "weak";
        }
      }

      // ── Recent Upsell Dampener ──
      // When a closed-won upsell landed in the last 12 months, pricing/billing is effectively
      // locked until renewal. Dampen the discount and billing signals so these families don't
      // surface ahead of accounts where there's actually something to act on.
      let dampenedDiscountSignal = discountSignal;
      let dampenedTermsSignal = termsSignal;
      if (isRecentlyUpsold) {
        if (dampenedDiscountSignal === "strong") dampenedDiscountSignal = "moderate";
        if (dampenedTermsSignal === "strong") dampenedTermsSignal = "weak";
        else if (dampenedTermsSignal === "moderate") dampenedTermsSignal = "weak";
      }

      // ── Combined Signal ──
      const signals = [sizeSignal, dampenedDiscountSignal, dampenedTermsSignal];
      const signalCount = signals.filter(
        (s) => s === "strong" || s === "moderate"
      ).length;
      let overallSignal: SignalStrength = "no-data";
      if (signals.includes("strong")) overallSignal = "strong";
      else if (signals.includes("moderate")) overallSignal = "moderate";
      else if (signals.some((s) => s !== "no-data")) overallSignal = "weak";

      const arrGrowthPct = originalFamilyArr > 0
        ? (family.totalFamilyArr - originalFamilyArr) / originalFamilyArr
        : null;
      const hasBeenUpsold = originalFamilyArr > 0 && family.totalFamilyArr > originalFamilyArr * 1.1;

      return {
        family,
        enrRevenue,
        sfdcRevenue,
        revenueDeltaPct,
        sizeSignal,
        t12Gmv,
        gmvToArRatio,
        gmvMotion,
        // Contract ACR augmentation
        contractAcr,
        contractAcrDeltaPct,
        contractAcrSignal,
        contractAcrSignedDate: contractAcrRecord?.signedDate ?? null,
        contractAcrSourceUrl,
        contractAcrMethod: contractAcrRecord?.method ?? null,
        contractAcrError: contractAcrRecord?.error ?? null,
        contractAcrExcerpt: contractAcrRecord?.rawExcerpt ?? "",
        // Audit dimension
        quoteFieldAcr: contractAcrRecord?.quoteFieldAcr ?? null,
        pdfStatedAcr: contractAcrRecord?.pdfStatedAcr ?? null,
        acrMismatch: contractAcrRecord?.acrMismatch ?? false,
        acrMismatchPct: contractAcrRecord?.acrMismatchPct ?? null,
        currentDiscountPct,
        originalDiscountPct,
        discountHistory: allHistory,
        contractVintageYears,
        discountSignal: dampenedDiscountSignal,
        currentInvoiceFrequency,
        isSubAnnual,
        termsSignal: dampenedTermsSignal,
        overallSignal,
        signalCount,
        originalFamilyArr,
        currentFamilyArr: family.totalFamilyArr,
        arrGrowthPct,
        hasBeenUpsold,
        capturedUpsellArr,
        hasOpenRenewal,
        renewalCloseDate,
        originalArrSource,
        isRecentlyUpsold,
        recentUpsellDate,
        recentUpsellArr,
        activeProducts,
        listBps,
        actualBps,
        bpsDeltaPct,
        enrRank: family.enrRank,
        totalFamilyArr: family.totalFamilyArr,
        accountOwners: family.accountOwners,
        customerCount: family.customerCount,
        accountUrl: family.members.find((m) => m.accountUrl)?.accountUrl ?? null,
      };
    })
    .sort((a, b) => {
      if (b.signalCount !== a.signalCount) return b.signalCount - a.signalCount;
      return b.totalFamilyArr - a.totalFamilyArr;
    });
}

export function computeUpsellHeroStats(signals: UpsellSignal[]): UpsellHeroStats {
  const withDiscount = signals.filter((s) => s.currentDiscountPct !== null);
  const avgDiscount = withDiscount.length > 0
    ? withDiscount.reduce((sum, s) => sum + s.currentDiscountPct!, 0) / withDiscount.length
    : null;

  return {
    totalCustomersAnalyzed: signals.length,
    strongSignalCount: signals.filter((s) => s.overallSignal === "strong").length,
    moderateSignalCount: signals.filter((s) => s.overallSignal === "moderate").length,
    arrWithStrongSignal: signals
      .filter((s) => s.overallSignal === "strong")
      .reduce((sum, s) => sum + s.totalFamilyArr, 0),
    avgDiscountPct: avgDiscount,
    subAnnualCount: signals.filter((s) => s.isSubAnnual).length,
    sizeCorrections: signals.filter((s) => s.sizeSignal === "strong").length,
    dataGapCount: signals.filter((s) => s.overallSignal === "no-data").length,
  };
}

// ── Main Processor ──

export function processAccountIntelligence(
  enrFirms: EnrFirm[],
  customerAccounts: SfdcAccount[],
  hierarchyAccounts: SfdcAccount[],
  pipelineOpps: RawOpportunity[],
  expansionOpps: RawOpportunity[],
  overrides: Record<string, string>,
  gmvSnapshot: GmvSnapshot | null = null,
  contractAcrSnapshot: ContractAcrSnapshot | null = null,
  sfdcInstanceUrl: string | null = null
): AccountIntelligenceData {
  const accountMap = buildAccountMap(customerAccounts, hierarchyAccounts);
  const families = buildFamilies(accountMap);
  const enrMatches = matchEnrFirms(enrFirms, accountMap, families, pipelineOpps, overrides);
  const gmvRecords = gmvSnapshot?.records ?? [];
  const contractAcrRecords = contractAcrSnapshot?.records ?? {};
  const upsellSignals = computeUpsellSignals(
    families, enrMatches, pipelineOpps, expansionOpps,
    gmvRecords, contractAcrRecords, sfdcInstanceUrl
  );
  const matchedFamilies = upsellSignals.filter((s) => s.t12Gmv !== null).length;

  const allOwners = [...new Set(
    [...accountMap.values()]
      .map((a) => a.accountOwner)
      .filter(Boolean) as string[]
  )].sort();

  const allFirmTypes = [...new Set(enrFirms.map((f) => f.firmType))].sort();

  const allIndustries = [...new Set(
    [...accountMap.values()]
      .map((a) => a.industry)
      .filter(Boolean) as string[]
  )].sort();

  const allStates = [...new Set(
    [...accountMap.values()]
      .map((a) => a.billingState)
      .filter(Boolean) as string[]
  )].sort();

  const allTradeOrgs = [...new Set(
    [...accountMap.values()]
      .flatMap((a) => a.tradeOrgList)
      .filter((t) => !t.includes("Engineering News"))
  )].sort();

  return {
    enrMatches,
    families,
    allOwners,
    allFirmTypes,
    allIndustries,
    allStates,
    allTradeOrgs,
    upsellSignals,
    gmvSnapshot: gmvSnapshot
      ? { windowEnd: gmvSnapshot.windowEnd, source: gmvSnapshot.source, matchedFamilies }
      : null,
    contractAcrSnapshot: contractAcrSnapshot
      ? {
          generatedAt: contractAcrSnapshot.generatedAt,
          source: contractAcrSnapshot.source,
          matchedFamilies: upsellSignals.filter((s) => s.contractAcr !== null).length,
          mismatchCount: upsellSignals.filter((s) => s.acrMismatch).length,
        }
      : null,
    dataSourceLabel: "Google Sheets",
  };
}
