/**
 * scripts/generate-demo-data.ts
 *
 * Deterministic synthetic data generator for the Crestline demo app.
 * Seed: "crestline-2026" — re-runs produce identical files.
 *
 * Outputs (written to data/demo/):
 *   pipeline.csv              ~400 opps Jan 2025 → Jun 2026
 *   closedWon.csv             Derived subset of pipeline.csv (Stage="Closed Won")
 *   quotas.csv                AE + SDR monthly quotas Jan–Jun 2026
 *   sdrSets.csv               ~400 SDR meeting records Oct 2025 → Jun 2026
 *   customerAccounts.csv      15 hand-tuned customer accounts
 *   customer-contract-acr.json  Contract ACR snapshot keyed to those 15 accounts
 *
 * Column names match EXACTLY what the parsers in lib/ expect (case-sensitive).
 * Critical references:
 *   pipeline.csv   → lib/types.ts RawOpportunity
 *   closedWon.csv  → lib/types-revenue.ts RawCwOpportunity
 *   quotas.csv     → lib/types-sdr.ts RawQuotaRecord
 *   sdrSets.csv    → lib/types-sdr.ts RawSdrMeeting
 *   customerAccounts.csv → lib/types-account-intelligence.ts RawCustomerAccount
 */

import seedrandom from "seedrandom";
import * as fs from "fs";
import * as path from "path";

// ── RNG setup ──────────────────────────────────────────────────────────────

const rng = seedrandom("crestline-2026");

function rand(): number {
  return rng();
}

function randInt(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number): number {
  return rand() * (max - min) + min;
}

function pickFrom<T>(arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)];
}

function weightedPick<T>(items: T[], weights: number[]): T {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

// ── Date helpers ───────────────────────────────────────────────────────────

const GEN_DATE = new Date("2026-05-15T12:00:00.000Z");

function addDays(d: Date, days: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + days);
  return r;
}

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function toIsoFull(d: Date): string {
  return d.toISOString();
}

// Range: Jan 2025 01 → Jun 2026 10 (for discovery dates)
const RANGE_START = new Date("2025-01-06T00:00:00Z");
const RANGE_END   = new Date("2026-06-10T00:00:00Z");
const RANGE_DAYS  = Math.floor((RANGE_END.getTime() - RANGE_START.getTime()) / 86400000);

function randDiscoveryDate(): Date {
  return addDays(RANGE_START, randInt(0, RANGE_DAYS));
}

// ── Team roster ────────────────────────────────────────────────────────────

const MM_AES  = ["Lauren Park", "Tomás Reyes", "Eddie Coleman", "Jamal Whitfield"];
const ENT_AES = ["Harper Lin", "Vikram Patel", "Caroline Mead"];
const SDRS    = ["Avery Greene", "Wes Kim", "Mira Schultz"];

// Manager config mirrors lib/config.ts MANAGER_SEGMENT_MAP
// Kevin Brand → MM, Patrick Yu → ENT
const AE_MANAGER: Record<string, string> = {
  "Lauren Park":    "Kevin Brand",
  "Tomás Reyes":    "Kevin Brand",
  "Eddie Coleman":  "Kevin Brand",
  "Jamal Whitfield": "Kevin Brand",
  "Harper Lin":     "Patrick Yu",
  "Vikram Patel":   "Patrick Yu",
  "Caroline Mead":  "Patrick Yu",
};

// ── Opp Set Type → Source label (matches OPP_SET_TYPE_MAP in config.ts) ──

type SourceLabel =
  | "SDR Outbound"
  | "Inbound"
  | "Events"
  | "6sense/Warmly"
  | "AE Self-Set"
  | "Partner"
  | "Webinar";

interface SourceSpec {
  label: SourceLabel;
  oppSetType: string;
  weight: number;
  winRate: number;
}

const SOURCES: SourceSpec[] = [
  { label: "SDR Outbound",  oppSetType: "SDR Set - Outbound", weight: 30, winRate: 0.08  },
  { label: "Inbound",       oppSetType: "AE Set - Inbound",   weight: 25, winRate: 0.26  },
  { label: "Events",        oppSetType: "Event",               weight: 12, winRate: 0.113 },
  { label: "6sense/Warmly", oppSetType: "6s",                  weight: 10, winRate: 0.139 },
  { label: "AE Self-Set",   oppSetType: "AE - Self Set",       weight: 10, winRate: 0.244 },
  { label: "Partner",       oppSetType: "Partner",             weight:  8, winRate: 0.250 },
  { label: "Webinar",       oppSetType: "Webinar",             weight:  5, winRate: 0.111 },
];

// ── Account name pool ──────────────────────────────────────────────────────

const ACCOUNT_NAMES = [
  "Whitestone Electric", "Cascade Mechanical", "Anchor Plumbing", "Northwall Builders",
  "Foothill Sheet Metal", "Briarcliff Trades", "Highline HVAC", "Beacon Industrial",
  "Cornerstone Mechanical", "Steeplechase Electric", "Riverbend Plumbing", "Summit Electric Inc",
  "Heritage Mechanical", "Atlas Sheet Metal", "Pinewood Construction Services",
  "Western Ridge Electrical", "Lakefront Mechanical", "Cobalt Plumbing Group",
  "Brookline Trades", "Sentinel HVAC", "Granite Industrial Services",
  "Ironclad Electric", "Driftwood Mechanical", "Tannery Plumbing Co",
  "Compass Sheet Metal", "Magnolia Builders", "Crescent HVAC Co",
];

// ── 15 hand-tuned customer account profiles ────────────────────────────────

interface AccountProfile {
  name: string;
  state: string;
  ar: number;
  gmv: number;
  arr: number;
  products: string;
  listBps: number;
  actualBps: number;
  discountPct: number;
  frequency: string;
  enrRank: number;
  originalArr: number;
  recentUpsell: boolean;
  recentUpsellDate?: string;
  recentUpsellArr?: number;
  openRenewal?: boolean;
  renewalCloseDate?: string;
  acrMismatch?: boolean;
}

const ACCOUNT_PROFILES: AccountProfile[] = [
  { name: "Whitestone Electric",            state: "TX", ar: 18_000_000, gmv: 8_500_000,  arr: 96000,  products: "Procurement,API", listBps: 6.5, actualBps: 5.3,  discountPct: 0.18, frequency: "Annual",    enrRank: 412, originalArr: 78000,  recentUpsell: false },
  { name: "Cascade Mechanical",             state: "WA", ar: 22_000_000, gmv: 11_000_000, arr: 142000, products: "Procurement",     listBps: 7.2, actualBps: 7.0,  discountPct: 0.03, frequency: "Annual",    enrRank: 287, originalArr: 142000, recentUpsell: false },
  { name: "Anchor Plumbing",                state: "NY", ar: 14_000_000, gmv: 4_200_000,  arr: 88000,  products: "Procurement",     listBps: 6.0, actualBps: 6.3,  discountPct: 0.0,  frequency: "Annual",    enrRank: 555, originalArr: 88000,  recentUpsell: false },
  { name: "Northwall Builders",             state: "IL", ar: 40_000_000, gmv: 4_500_000,  arr: 110000, products: "Procurement",     listBps: 5.0, actualBps: 2.8,  discountPct: 0.44, frequency: "Annual",    enrRank: 198, originalArr: 110000, recentUpsell: false },
  { name: "Foothill Sheet Metal",           state: "CA", ar: 28_000_000, gmv: 5_900_000,  arr: 95000,  products: "Procurement",     listBps: 5.5, actualBps: 3.4,  discountPct: 0.38, frequency: "Annual",    enrRank: 244, originalArr: 95000,  recentUpsell: false },
  { name: "Briarcliff Trades",              state: "PA", ar: 12_000_000, gmv: 4_000_000,  arr: 142000, products: "Procurement,API", listBps: 6.5, actualBps: 11.8, discountPct: 0.0,  frequency: "Annual",    enrRank: 489, originalArr: 78000,  recentUpsell: true,  recentUpsellDate: "2026-02-14", recentUpsellArr: 64000 },
  { name: "Highline HVAC",                  state: "FL", ar: 9_000_000,  gmv: 2_800_000,  arr: 64000,  products: "Procurement",     listBps: 7.0, actualBps: 7.1,  discountPct: 0.02, frequency: "Annual",    enrRank: 612, originalArr: 64000,  recentUpsell: false, openRenewal: true, renewalCloseDate: "2026-07-31" },
  { name: "Beacon Industrial",              state: "OH", ar: 16_000_000, gmv: 4_800_000,  arr: 88000,  products: "Procurement",     listBps: 5.5, actualBps: 5.5,  discountPct: 0.05, frequency: "Quarterly", enrRank: 358, originalArr: 88000,  recentUpsell: false },
  { name: "Cornerstone Mechanical",         state: "GA", ar: 25_000_000, gmv: 7_500_000,  arr: 124000, products: "Procurement,API", listBps: 5.0, actualBps: 4.9,  discountPct: 0.02, frequency: "Annual",    enrRank: 312, originalArr: 124000, recentUpsell: false, acrMismatch: true },
  { name: "Steeplechase Electric",          state: "MA", ar: 35_000_000, gmv: 12_000_000, arr: 96000,  products: "Procurement",     listBps: 4.5, actualBps: 2.7,  discountPct: 0.40, frequency: "Annual",    enrRank: 156, originalArr: 96000,  recentUpsell: false },
  { name: "Riverbend Plumbing",             state: "MN", ar: 8_000_000,  gmv: 2_500_000,  arr: 56000,  products: "Procurement",     listBps: 7.0, actualBps: 7.0,  discountPct: 0.0,  frequency: "Annual",    enrRank: 723, originalArr: 56000,  recentUpsell: false },
  { name: "Summit Electric Inc",            state: "CO", ar: 11_000_000, gmv: 3_300_000,  arr: 72000,  products: "Procurement",     listBps: 6.5, actualBps: 6.5,  discountPct: 0.0,  frequency: "Annual",    enrRank: 588, originalArr: 72000,  recentUpsell: false },
  { name: "Heritage Mechanical",            state: "NC", ar: 19_000_000, gmv: 6_300_000,  arr: 108000, products: "Procurement,API", listBps: 5.5, actualBps: 5.7,  discountPct: 0.0,  frequency: "Annual",    enrRank: 401, originalArr: 78000,  recentUpsell: true,  recentUpsellDate: "2026-01-08", recentUpsellArr: 30000 },
  { name: "Atlas Sheet Metal",              state: "TX", ar: 13_000_000, gmv: 3_900_000,  arr: 78000,  products: "Procurement",     listBps: 6.0, actualBps: 6.0,  discountPct: 0.0,  frequency: "Annual",    enrRank: 532, originalArr: 78000,  recentUpsell: false },
  { name: "Pinewood Construction Services", state: "OR", ar: 21_000_000, gmv: 6_500_000,  arr: 116000, products: "Procurement,API", listBps: 5.5, actualBps: 4.1,  discountPct: 0.26, frequency: "Annual",    enrRank: 367, originalArr: 116000, recentUpsell: false },
];

// ── ACR profiles ───────────────────────────────────────────────────────────

interface AcrProfile {
  accountIdx: number;
  method: "regex" | "claude" | "not_found";
  quoteAcr: number | null;
  pdfAcr: number | null;
  mismatch?: boolean;
  error?: string;
}

const ACR_PROFILES: AcrProfile[] = [
  { accountIdx: 0,  method: "regex",     quoteAcr: 18000000, pdfAcr: 18000000 },
  { accountIdx: 1,  method: "regex",     quoteAcr: 22000000, pdfAcr: 22000000 },
  { accountIdx: 2,  method: "regex",     quoteAcr: 14000000, pdfAcr: 14000000 },
  { accountIdx: 3,  method: "not_found", quoteAcr: 40000000, pdfAcr: null },
  { accountIdx: 4,  method: "not_found", quoteAcr: 28000000, pdfAcr: null },
  { accountIdx: 5,  method: "regex",     quoteAcr: 12000000, pdfAcr: 12000000 },
  { accountIdx: 6,  method: "not_found", quoteAcr: 9000000,  pdfAcr: null },
  { accountIdx: 7,  method: "not_found", quoteAcr: 16000000, pdfAcr: null },
  { accountIdx: 8,  method: "regex",     quoteAcr: 23000000, pdfAcr: 25000000, mismatch: true },
  { accountIdx: 9,  method: "claude",    quoteAcr: 35000000, pdfAcr: 35000000 },
  { accountIdx: 10, method: "not_found", quoteAcr: null,     pdfAcr: null, error: "no_signed_contract" },
  { accountIdx: 11, method: "not_found", quoteAcr: 11000000, pdfAcr: null },
  { accountIdx: 12, method: "regex",     quoteAcr: 19000000, pdfAcr: 19000000 },
  { accountIdx: 13, method: "not_found", quoteAcr: 13000000, pdfAcr: null },
  { accountIdx: 14, method: "not_found", quoteAcr: 21000000, pdfAcr: null },
];

// ── Industry pool ──────────────────────────────────────────────────────────

const INDUSTRIES = [
  "Electrical Contractor", "Mechanical Contractor", "Plumbing Contractor",
  "HVAC Contractor", "Sheet Metal Contractor", "General Contractor",
  "Specialty Trades", "Industrial Services",
];

// ── Stage distribution for open opps ──────────────────────────────────────

const OPEN_STAGE_WEIGHTS = {
  "Qualification":         20,
  "Discovery":             35,
  "Evaluation":            25,
  "Contracts/Negotiation": 12,
  "Final Approvals":        8,
};

// ── Revenue ranges ─────────────────────────────────────────────────────────

// ENT threshold = $75M (from config.ts ENT_REVENUE_THRESHOLD)
// MM: ar < $75M, ENT: ar >= $75M
// But segment is driven by manager. We'll generate AR consistent with the AE's segment.
const MM_AR_RANGE  = [5_000_000,  72_000_000];
const ENT_AR_RANGE = [75_000_000, 350_000_000];

const MM_AMOUNT_RANGE  = [15_000, 80_000];
const ENT_AMOUNT_RANGE = [15_000, 250_000];

// ── Helpers ────────────────────────────────────────────────────────────────

/** Pad a number to produce an 18-char-style fake SFDC Opportunity ID */
function oppId(idx: number): string {
  return `006DEMO${String(idx).padStart(11, "0")}`;
}

function formatDate(d: Date): string {
  return toIso(d);
}

/** Pick a close date: for CW/CL, it's discovery + 30-270 days. */
function closeDateFromDiscovery(discoveryDate: Date, stage: string): string {
  if (stage === "Closed Won" || stage === "Closed Lost") {
    const daysToClose = randInt(30, 270);
    const cd = addDays(discoveryDate, daysToClose);
    // Cap at today
    if (cd > GEN_DATE) return toIso(GEN_DATE);
    return toIso(cd);
  }
  // Future close date for open opps
  const daysAhead = randInt(15, 120);
  return toIso(addDays(GEN_DATE, daysAhead));
}

/** Assign SDR to an opp based on source (SDR Outbound / 6sense get an SDR assigned) */
function assignSdr(source: SourceLabel): string {
  if (source === "SDR Outbound" || source === "6sense/Warmly") {
    return pickFrom(SDRS);
  }
  return "";
}

// ── Pipeline CSV columns (match RawOpportunity exactly) ───────────────────

type PipelineRow = {
  "Opportunity Name": string;
  "Opportunity Owner": string;
  "Account Name": string;
  "SDR Owner": string;
  "Opportunity Source": string;
  Amount: string;
  "Created Date": string;
  "Discovery Date": string;
  "Evaluation Date": string;
  "Negotiation Date": string;
  "Close Date": string;
  "Stage Duration": string;
  "Last Stage Change Date": string;
  "Annual Revenue": string;
  "Opportunity Owner: Manager": string;
  "Opp Set Type": string;
  Stage: string;
  "Account Segment": string;
  "Recurring ARR": string;
  "Primary Contact: P Level": string;
  Industry: string;
  "First NB Opp?": string;
  "Account: Last Activity": string;
  "Last Activity": string;
  "Discount Amount": string;
  "Discount Percentage": string;
  "Recurring Discount Percentage": string;
  "Opportunity BPS": string;
  Type: string;
  "Opportunity Record Type": string;
  "Opportunity ID (18 Char)": string;
  "Probability (%)": string;
  "Contract Term (Month)": string;
  "Payment Terms": string;
  "Invoice Frequency": string;
};

// ── ClosedWon CSV columns (match RawCwOpportunity exactly) ────────────────

type ClosedWonRow = {
  "Opportunity Name": string;
  "SDR Owner": string;
  "Created Date": string;
  "Opportunity Source": string;
  "Recurring ARR": string;
  "Accelerated ARR": string;
  "Competitive Vendors": string;
  "Type": string;
  "Annual Revenue": string;
  "Account Segment": string;
  "Amount": string;
  "Opportunity Owner": string;
  "Close Date": string;
  "Opp Set Type": string;
  "Opportunity Owner: Manager": string;
  "Opportunity ID": string;
};

// ── Quotas CSV columns (match RawQuotaRecord exactly) ─────────────────────

type QuotaRow = {
  "ForecastingQuota ID": string;
  "Quota Amount": string;
  "Quota Quantity": string;
  "Forecasting Type: API Name": string;
  "Is Active": string;
  "Created Date": string;
  "Created By: Full Name": string;
  "Start Date": string;
  "End Date": string;
  "Owner: Full Name": string;
  "Owner: Manager: Full Name": string;
  "Is Ramping (Vlookup)": string;
};

// ── SDR Sets CSV columns (match RawSdrMeeting exactly) ────────────────────

type SdrSetRow = {
  "Opportunity Name": string;
  "Qualification Set Date": string;
  "Qualification Scheduled Date": string;
  Industry: string;
  Amount: string;
  Stage: string;
  "Fiscal Period": string;
  "Created Date": string;
  "SDR Owner": string;
  "Assigned Account Executive": string;
  "SAO Points Calculation": string;
  "Meeting Held Date": string;
};

// ── customerAccounts CSV columns (match RawCustomerAccount exactly) ────────

type CustomerAccountRow = {
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
};

// ── CSV serializer (no external dep needed) ────────────────────────────────

function escapeCell(val: string): string {
  if (val.includes('"') || val.includes(",") || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function toCsv<T extends Record<string, string>>(rows: T[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines: string[] = [headers.map(escapeCell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCell(row[h] ?? "")).join(","));
  }
  return lines.join("\n") + "\n";
}

// ── Stage assignment logic ─────────────────────────────────────────────────

function assignStage(
  discoveryDate: Date,
  source: SourceSpec,
  today: Date
): string {
  const ageInDays = Math.floor(
    (today.getTime() - discoveryDate.getTime()) / 86400000
  );

  if (ageInDays > 180) {
    // Old opp: resolve to CW or CL
    return rand() < source.winRate ? "Closed Won" : "Closed Lost";
  }

  // Open opp: weighted stage distribution
  const stages = Object.keys(OPEN_STAGE_WEIGHTS) as Array<keyof typeof OPEN_STAGE_WEIGHTS>;
  const weights = stages.map((s) => OPEN_STAGE_WEIGHTS[s]);
  return weightedPick(stages, weights);
}

/** Returns ISO date string for when opp reached a given stage (null if not yet reached) */
function stageReachDate(discoveryDate: Date, stage: string): string {
  const stageOrder = ["Qualification", "Discovery", "Evaluation", "Contracts/Negotiation", "Final Approvals", "Closed Won", "Closed Lost"];
  const stageIdx = stageOrder.indexOf(stage);
  if (stageIdx < 0) return "";
  // Evaluation reached ~2 weeks after discovery
  if (stage === "Evaluation") return toIso(addDays(discoveryDate, randInt(14, 30)));
  // Negotiation reached ~2 weeks after evaluation
  if (stage === "Contracts/Negotiation") return toIso(addDays(discoveryDate, randInt(45, 90)));
  return "";
}

// ── Generate pipeline rows ─────────────────────────────────────────────────

interface PipelineOpp extends PipelineRow {
  _stage: string;          // raw value for filtering
  _oppIdx: number;
  _closeDate: string;
  _createdDate: string;
  _discoveryDate: string;
  _amount: number;
  _recurringArr: number;
  _owner: string;
  _manager: string;
  _sdrOwner: string;
  _accountName: string;
  _annualRevenue: number;
  _oppSetType: string;
  _segment: string;
}

function generatePipeline(count = 400): PipelineOpp[] {
  const rows: PipelineOpp[] = [];

  // Track how many opps are MM vs ENT (target ~65% MM, ~35% ENT)
  let mmCount = 0;
  let entCount = 0;
  const mmTarget = Math.round(count * 0.65);

  const sourceItems = SOURCES;
  const sourceWeights = SOURCES.map((s) => s.weight);

  for (let i = 0; i < count; i++) {
    // Determine segment first
    let isEnt: boolean;
    const remaining = count - i;
    const mmRemaining = mmTarget - mmCount;
    if (mmRemaining <= 0) {
      isEnt = true;
    } else if (remaining - mmRemaining <= 0) {
      isEnt = false;
    } else {
      isEnt = entCount / (count - mmTarget) < mmCount / mmTarget
        ? rand() > 0.65
        : rand() > 0.35;
    }

    const aes = isEnt ? ENT_AES : MM_AES;
    const owner = pickFrom(aes);
    const manager = AE_MANAGER[owner];
    if (isEnt) entCount++; else mmCount++;

    const source = weightedPick(sourceItems, sourceWeights);
    const discoveryDate = randDiscoveryDate();
    const stage = assignStage(discoveryDate, source, GEN_DATE);

    // Created Date is 1–5 days before discovery date
    const createdDate = addDays(discoveryDate, -randInt(1, 5));

    const arRange = isEnt ? ENT_AR_RANGE : MM_AR_RANGE;
    const annualRevenue = randInt(arRange[0], arRange[1]);

    const amtRange = isEnt ? ENT_AMOUNT_RANGE : MM_AMOUNT_RANGE;
    const amount = Math.round(randInt(amtRange[0], amtRange[1]) / 1000) * 1000;
    const recurringArr = Math.round(amount * randFloat(0.75, 0.95) / 100) * 100;

    const sdrOwner = assignSdr(source.label);
    const accountName = pickFrom(ACCOUNT_NAMES);
    const industry = pickFrom(INDUSTRIES);

    const closeDate = closeDateFromDiscovery(discoveryDate, stage);
    const lastStageChangeDate = toIso(addDays(discoveryDate, randInt(1, 14)));
    const stageDuration = randInt(3, 60);

    const discountPct = rand() < 0.35 ? Math.round(randFloat(0.05, 0.40) * 100) / 100 : 0;
    const discountAmount = Math.round(amount * discountPct);
    const bps = Math.round((recurringArr / annualRevenue) * 10000 * 100) / 100;

    const probability = (() => {
      switch (stage) {
        case "Qualification": return "10";
        case "Discovery": return "25";
        case "Evaluation": return "50";
        case "Contracts/Negotiation": return "75";
        case "Final Approvals": return "90";
        case "Closed Won": return "100";
        case "Closed Lost": return "0";
        default: return "25";
      }
    })();

    const evaluationDate = stageReachDate(discoveryDate, "Evaluation");
    const negotiationDate = stageReachDate(discoveryDate, "Contracts/Negotiation");

    const segment = isEnt ? "ENT" : "MM";

    // Opportunity Source (raw) — map from Opp Set Type
    // Revenue page consumers use "Opportunity Source" raw column.
    // Mapping mirrors REVENUE_GROUP_META sources from config.ts.
    const opportunitySource = (() => {
      switch (source.label) {
        case "SDR Outbound":  return "Outbound";
        case "6sense/Warmly": return "6s Intent Signals";
        case "Inbound":       return "Inbound";
        case "Events":        return "Event";
        case "Partner":       return "Partner";
        case "Webinar":       return "Webinar";
        case "AE Self-Set":   return "Outbound";
        default: return "Outbound";
      }
    })();

    const row: PipelineOpp = {
      "Opportunity Name":             `${accountName} - ${stage === "Closed Won" ? "CW" : stage === "Closed Lost" ? "CL" : "NB"} ${i + 1}`,
      "Opportunity Owner":            owner,
      "Account Name":                 accountName,
      "SDR Owner":                    sdrOwner,
      "Opportunity Source":           opportunitySource,
      Amount:                         String(amount),
      "Created Date":                 formatDate(createdDate),
      "Discovery Date":               formatDate(discoveryDate),
      "Evaluation Date":              evaluationDate,
      "Negotiation Date":             negotiationDate,
      "Close Date":                   closeDate,
      "Stage Duration":               String(stageDuration),
      "Last Stage Change Date":       lastStageChangeDate,
      "Annual Revenue":               String(annualRevenue),
      "Opportunity Owner: Manager":   manager,
      "Opp Set Type":                 source.oppSetType,
      Stage:                          stage,
      "Account Segment":              segment,
      "Recurring ARR":                String(recurringArr),
      "Primary Contact: P Level":     pickFrom(["VP", "Director", "Manager", "C-Level", ""]),
      Industry:                       industry,
      "First NB Opp?":               i % 3 === 0 ? "true" : "false",
      "Account: Last Activity":       toIso(addDays(GEN_DATE, -randInt(1, 30))),
      "Last Activity":                toIso(addDays(GEN_DATE, -randInt(1, 14))),
      "Discount Amount":              String(discountAmount),
      "Discount Percentage":          discountPct > 0 ? String(Math.round(discountPct * 100)) + "%" : "0%",
      "Recurring Discount Percentage": discountPct > 0 ? String(Math.round(discountPct * 100)) + "%" : "0%",
      "Opportunity BPS":              String(bps),
      Type:                           "New Business",
      "Opportunity Record Type":      "New Business",
      "Opportunity ID (18 Char)":     oppId(i),
      "Probability (%)":              probability,
      "Contract Term (Month)":        "12",
      "Payment Terms":                "Net 30",
      "Invoice Frequency":            pickFrom(["Annual", "Annual", "Annual", "Quarterly", "Semi-Annually", "Monthly"]),
      // Internal tracking fields (not written to CSV, filtered below)
      _stage:         stage,
      _oppIdx:        i,
      _closeDate:     closeDate,
      _createdDate:   formatDate(createdDate),
      _discoveryDate: formatDate(discoveryDate),
      _amount:        amount,
      _recurringArr:  recurringArr,
      _owner:         owner,
      _manager:       manager,
      _sdrOwner:      sdrOwner,
      _accountName:   accountName,
      _annualRevenue: annualRevenue,
      _oppSetType:    source.oppSetType,
      _segment:       segment,
    };

    rows.push(row);
  }

  return rows;
}

/** Strip internal tracking fields before writing CSV */
function toPipelineRow(opp: PipelineOpp): PipelineRow {
  const row = { ...opp } as Record<string, unknown>;
  for (const key of Object.keys(row)) {
    if (key.startsWith("_")) delete row[key];
  }
  return row as PipelineRow;
}

// ── Generate closedWon rows (derived from pipeline) ───────────────────────

function toClosedWonRow(opp: PipelineOpp): ClosedWonRow {
  return {
    "Opportunity Name":           opp["Opportunity Name"],
    "SDR Owner":                  opp["SDR Owner"],
    "Created Date":               opp["Created Date"],
    "Opportunity Source":         opp["Opportunity Source"],
    "Recurring ARR":              opp["Recurring ARR"],
    "Accelerated ARR":            "0",
    "Competitive Vendors":        pickFrom(["", "", "Competitor A", "Competitor B", ""]),
    Type:                         opp["Type"],
    "Annual Revenue":             opp["Annual Revenue"],
    "Account Segment":            opp["Account Segment"],
    Amount:                       opp["Amount"],
    "Opportunity Owner":          opp["Opportunity Owner"],
    "Close Date":                 opp["Close Date"],
    "Opp Set Type":               opp["Opp Set Type"],
    "Opportunity Owner: Manager": opp["Opportunity Owner: Manager"],
    "Opportunity ID":             opp["Opportunity ID (18 Char)"],
  };
}

// ── Generate quotas rows ───────────────────────────────────────────────────

function generateQuotas(): QuotaRow[] {
  const rows: QuotaRow[] = [];
  const months = [
    { key: "2026-01", start: "2026-01-01", end: "2026-01-31" },
    { key: "2026-02", start: "2026-02-01", end: "2026-02-28" },
    { key: "2026-03", start: "2026-03-01", end: "2026-03-31" },
    { key: "2026-04", start: "2026-04-01", end: "2026-04-30" },
    { key: "2026-05", start: "2026-05-01", end: "2026-05-31" },
    { key: "2026-06", start: "2026-06-01", end: "2026-06-30" },
  ];

  // AE quotas — monthly amounts from lib/config.ts MONTHLY_QUOTAS
  // MM AEs: Kevin Brand team; ENT AEs: Patrick Yu team
  const aeQuotas: Record<string, { mm: number; ent: number }> = {
    "2026-01": { mm: 280000, ent: 300000 },
    "2026-02": { mm: 280000, ent: 310000 },
    "2026-03": { mm: 280000, ent: 320000 },
    "2026-04": { mm: 290000, ent: 325000 },
    "2026-05": { mm: 290000, ent: 335000 },
    "2026-06": { mm: 290000, ent: 345000 },
  };

  // Distribute MM quota among 4 MM AEs, ENT among 3 ENT AEs
  let qIdx = 0;

  for (const m of months) {
    const { mm, ent } = aeQuotas[m.key];
    const mmPerAe = Math.round(mm / MM_AES.length);
    const entPerAe = Math.round(ent / ENT_AES.length);

    for (const ae of MM_AES) {
      rows.push({
        "ForecastingQuota ID":         `FQ-${String(++qIdx).padStart(5, "0")}`,
        "Quota Amount":                String(mmPerAe),
        "Quota Quantity":              "0",
        "Forecasting Type: API Name":  "OpportunityLineItemRevenue",
        "Is Active":                   "true",
        "Created Date":                "2025-12-01",
        "Created By: Full Name":       "Admin User",
        "Start Date":                  m.start,
        "End Date":                    m.end,
        "Owner: Full Name":            ae,
        "Owner: Manager: Full Name":   "Kevin Brand",
        "Is Ramping (Vlookup)":        "0",
      });
    }

    for (const ae of ENT_AES) {
      rows.push({
        "ForecastingQuota ID":         `FQ-${String(++qIdx).padStart(5, "0")}`,
        "Quota Amount":                String(entPerAe),
        "Quota Quantity":              "0",
        "Forecasting Type: API Name":  "OpportunityLineItemRevenue",
        "Is Active":                   "true",
        "Created Date":                "2025-12-01",
        "Created By: Full Name":       "Admin User",
        "Start Date":                  m.start,
        "End Date":                    m.end,
        "Owner: Full Name":            ae,
        "Owner: Manager: Full Name":   "Patrick Yu",
        "Is Ramping (Vlookup)":        "0",
      });
    }

    // SDR quotas (quantity-based, 8–10 SAOs/month per SDR)
    for (const sdr of SDRS) {
      rows.push({
        "ForecastingQuota ID":         `FQ-${String(++qIdx).padStart(5, "0")}`,
        "Quota Amount":                "0",
        "Quota Quantity":              String(randInt(8, 10)),
        "Forecasting Type: API Name":  "SDR_SAO__c",
        "Is Active":                   "true",
        "Created Date":                "2025-12-01",
        "Created By: Full Name":       "Admin User",
        "Start Date":                  m.start,
        "End Date":                    m.end,
        "Owner: Full Name":            sdr,
        "Owner: Manager: Full Name":   "Riley Quinn",
        "Is Ramping (Vlookup)":        "0",
      });
    }
  }

  return rows;
}

// ── Generate SDR meeting rows ──────────────────────────────────────────────

function generateSdrSets(pipelineOpps: PipelineOpp[], count = 400): SdrSetRow[] {
  const rows: SdrSetRow[] = [];

  // SDR range: Oct 2025 → Jun 2026
  const SDR_START = new Date("2025-10-06T00:00:00Z");
  const SDR_DAYS  = Math.floor(
    (new Date("2026-06-15T00:00:00Z").getTime() - SDR_START.getTime()) / 86400000
  );

  // Pull SDR-sourced opps from pipeline to use as SAO-linked meetings
  const sdrOpps = pipelineOpps.filter(
    (o) => o["SDR Owner"] !== "" && o._stage !== "Closed Lost"
  );

  // Stages for meetings (realistic distribution)
  const meetingStages = ["Qualification", "Discovery", "Evaluation", "Closed Won", "Closed Lost"];
  const meetingStageWeights = [30, 35, 20, 10, 5];

  for (let i = 0; i < count; i++) {
    const sdrOwner = pickFrom(SDRS);
    const ae = pickFrom([...MM_AES, ...ENT_AES]);
    const qualSetDate = addDays(SDR_START, randInt(0, SDR_DAYS));
    const meetingHeldDate = addDays(qualSetDate, randInt(3, 14));
    const amount = Math.round(randInt(15000, 100000) / 1000) * 1000;
    const accountName = pickFrom(ACCOUNT_NAMES);
    const industry = pickFrom(INDUSTRIES);
    const stage = weightedPick(meetingStages, meetingStageWeights);
    const saoPoints = rand() < 0.6 ? 1 : 0; // 60% counted as SAOs

    // Fiscal period: Q4'25, Q1'26, Q2'26
    const qDate = qualSetDate;
    const yr = qDate.getUTCFullYear();
    const mo = qDate.getUTCMonth() + 1;
    const fp = mo <= 3 ? `Q1 ${yr}` : mo <= 6 ? `Q2 ${yr}` : mo <= 9 ? `Q3 ${yr}` : `Q4 ${yr}`;

    rows.push({
      "Opportunity Name":             `${accountName} - SDR Set ${i + 1}`,
      "Qualification Set Date":       toIso(qualSetDate),
      "Qualification Scheduled Date": toIso(meetingHeldDate),
      Industry:                       industry,
      Amount:                         String(amount),
      Stage:                          stage,
      "Fiscal Period":                fp,
      "Created Date":                 toIso(qualSetDate),
      "SDR Owner":                    sdrOwner,
      "Assigned Account Executive":   ae,
      "SAO Points Calculation":       String(saoPoints),
      "Meeting Held Date":            toIso(meetingHeldDate),
    });
  }

  return rows;
}

// ── Generate customerAccounts rows ────────────────────────────────────────

function generateCustomerAccounts(): CustomerAccountRow[] {
  return ACCOUNT_PROFILES.map((p, idx) => {
    const accountId = `ACC-${1000 + idx}`;
    const startDate = "2023-01-01"; // placeholder start date

    // Derive trade designation from products
    const tradeDesignation = p.name.toLowerCase().includes("electric")
      ? "EC"
      : p.name.toLowerCase().includes("mechanical")
      ? "MC"
      : p.name.toLowerCase().includes("plumbing")
      ? "PC"
      : p.name.toLowerCase().includes("hvac") || p.name.toLowerCase().includes("sheet metal")
      ? "SM"
      : "GC";

    // Active assets based on products
    const hasApi = p.products.includes("API");
    const assetCount = hasApi ? 2 : 1;
    const activeAssets = hasApi ? "Procurement;API Integration" : "Procurement";

    const industryMap: Record<string, string> = {
      EC: "Electrical Contractor",
      MC: "Mechanical Contractor",
      PC: "Plumbing Contractor",
      SM: "HVAC/Sheet Metal Contractor",
      GC: "General Contractor",
    };

    return {
      "Parent Account ID":          accountId,
      "Parent Account":             p.name,
      "Account Name":               p.name,
      "Billing State/Province":     p.state,
      Type:                         "Customer",
      "Last Modified Date":         "2026-05-01",
      "Annual Revenue":             String(p.ar),
      "Recurring ARR":              String(p.arr),
      "Trade Designation":          tradeDesignation,
      "Account ID":                 accountId,
      "Number of Active Assets":    String(assetCount),
      "Trade Organization List":    "",
      "Trade Organization Chapter List": "",
      Industry:                     industryMap[tradeDesignation] || "Specialty Contractor",
      "Sub-Industry":               "",
      "Account Owner":              pickFrom([...MM_AES, ...ENT_AES]),
      "Account URL":                `https://crestline.lightning.force.com/lightning/r/Account/${accountId}/view`,
      "Original ARR":               String(p.originalArr),
      "Start Date":                 startDate,
      "Active Assets":              activeAssets,
    };
  });
}

// ── Generate contract ACR JSON ─────────────────────────────────────────────

function generateContractAcr(): object {
  const records: Record<string, object> = {};

  for (const acrP of ACR_PROFILES) {
    const profile = ACCOUNT_PROFILES[acrP.accountIdx];
    const accountId = `ACC-${1000 + acrP.accountIdx}`;

    const quoteAcr = acrP.quoteAcr;
    const pdfAcr   = acrP.pdfAcr;

    // statedAcr logic: PDF when present, else Quote field
    let statedAcr: number | null;
    if (pdfAcr !== null) {
      statedAcr = pdfAcr;
    } else if (quoteAcr !== null) {
      statedAcr = quoteAcr;
    } else {
      statedAcr = null;
    }

    // Mismatch detection
    let acrMismatch = false;
    let acrMismatchPct: number | null = null;
    if (acrP.mismatch && quoteAcr !== null && pdfAcr !== null) {
      acrMismatch = true;
      acrMismatchPct = Math.round(((pdfAcr - quoteAcr) / quoteAcr) * 10000) / 10000;
    }

    const record: Record<string, unknown> = {
      accountId,
      statedAcr,
      quoteFieldAcr: quoteAcr,
      pdfStatedAcr:  pdfAcr,
      acrMismatch,
      acrMismatchPct,
      signedDate:              "2025-09-12",
      sourceOppId:             `OPP-CW-${acrP.accountIdx}`,
      sourceQuoteId:           `QUO-${acrP.accountIdx}`,
      sourceContentVersionId:  `CV-${acrP.accountIdx}`,
      snapshotRunAt:           "2026-05-15T22:00:00.000Z",
      method:                  acrP.method,
      rawExcerpt:              acrP.method === "not_found"
        ? ""
        : `...Annual Construction Revenue: $${(quoteAcr ?? 0).toLocaleString("en-US", { minimumFractionDigits: 2 })}...`,
    };

    if (acrP.error) {
      record.error = acrP.error;
    }

    // For not_found with no PDF: statedAcr uses quoteAcr if available, pdfStatedAcr stays null
    if (acrP.method === "not_found") {
      record.pdfStatedAcr = null;
    }

    records[accountId] = record;
  }

  return {
    generatedAt: toIsoFull(GEN_DATE),
    source: "Synthetic demo data (scripts/generate-demo-data.ts)",
    recordCount: ACR_PROFILES.length,
    records,
  };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const outDir = path.join(process.cwd(), "data", "demo");
  fs.mkdirSync(outDir, { recursive: true });

  console.log("Generating pipeline.csv (~400 opps)...");
  const pipelineOpps = generatePipeline(400);
  const pipelineRows = pipelineOpps.map(toPipelineRow);
  fs.writeFileSync(path.join(outDir, "pipeline.csv"), toCsv(pipelineRows), "utf-8");
  console.log(`  ✓ pipeline.csv — ${pipelineRows.length} rows`);

  console.log("Generating closedWon.csv (derived from pipeline)...");
  const cwOpps = pipelineOpps.filter((o) => o._stage === "Closed Won");
  const cwRows = cwOpps.map(toClosedWonRow);
  fs.writeFileSync(path.join(outDir, "closedWon.csv"), toCsv(cwRows), "utf-8");
  console.log(`  ✓ closedWon.csv — ${cwRows.length} rows`);

  console.log("Generating quotas.csv...");
  const quotaRows = generateQuotas();
  fs.writeFileSync(path.join(outDir, "quotas.csv"), toCsv(quotaRows), "utf-8");
  console.log(`  ✓ quotas.csv — ${quotaRows.length} rows`);

  console.log("Generating sdrSets.csv (~400 rows)...");
  const sdrRows = generateSdrSets(pipelineOpps, 400);
  fs.writeFileSync(path.join(outDir, "sdrSets.csv"), toCsv(sdrRows), "utf-8");
  console.log(`  ✓ sdrSets.csv — ${sdrRows.length} rows`);

  console.log("Generating customerAccounts.csv (15 profiles)...");
  const acctRows = generateCustomerAccounts();
  fs.writeFileSync(path.join(outDir, "customerAccounts.csv"), toCsv(acctRows), "utf-8");
  console.log(`  ✓ customerAccounts.csv — ${acctRows.length} rows`);

  console.log("Generating customer-contract-acr.json...");
  const acrJson = generateContractAcr();
  fs.writeFileSync(
    path.join(outDir, "customer-contract-acr.json"),
    JSON.stringify(acrJson, null, 2),
    "utf-8"
  );
  console.log(`  ✓ customer-contract-acr.json — ${ACR_PROFILES.length} records`);

  // ── Summary ──
  console.log("\nSummary:");
  const cwCount = cwRows.length;
  const clCount = pipelineOpps.filter((o) => o._stage === "Closed Lost").length;
  const openCount = pipelineOpps.length - cwCount - clCount;
  const mmCount = pipelineOpps.filter((o) => o._segment === "MM").length;
  const entCount = pipelineOpps.filter((o) => o._segment === "ENT").length;
  console.log(`  Pipeline: ${pipelineOpps.length} opps (${mmCount} MM / ${entCount} ENT)`);
  console.log(`  Stage: ${cwCount} Closed Won, ${clCount} Closed Lost, ${openCount} Open`);
  console.log(`  CW win rate: ${(cwCount / pipelineOpps.length * 100).toFixed(1)}%`);
  console.log("\nAll files written to data/demo/");
}

main().catch((err) => {
  console.error("Generator failed:", err);
  process.exit(1);
});
