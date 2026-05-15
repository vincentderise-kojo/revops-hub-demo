// ── Pricing Calculator Config ──

export type ProductName =
  | "Procurement"
  | "AP"
  | "InventoryManagement"
  | "ToolTracking"
  | "PreFab"
  | "ProCore"
  | "SpecAgent"
  | "OnsiteImplementation"
  | "VirtualImplementation";

export interface RevenueTier {
  min: number;
  max: number;
  label: string;
}

export const REVENUE_TIERS: RevenueTier[] = [
  { min: 0, max: 10_000_000, label: "Less than $10M" },
  { min: 10_000_000, max: 20_000_000, label: "$10M–$20M" },
  { min: 20_000_000, max: 50_000_000, label: "$20M–$50M" },
  { min: 50_000_000, max: 75_000_000, label: "$50M–$75M" },
  { min: 75_000_000, max: 100_000_000, label: "$75M–$100M" },
  { min: 100_000_000, max: 250_000_000, label: "$100M–$250M" },
  { min: 250_000_000, max: 500_000_000, label: "$250M–$500M" },
  { min: 500_000_000, max: 1_000_000_000, label: "$500M–$1B" },
  { min: 1_000_000_000, max: Infinity, label: "Greater than $1B" },
];

export interface ProductConfig {
  name: ProductName;
  displayName: string;
  type: "Core" | "Add-on" | "One-Time";
  annualFloor: number;
  defaultChecked: boolean;
  bpsByTier: number[]; // one BPS value per REVENUE_TIERS entry, in order
  oneTime?: boolean; // true = flat fee, not recurring (excluded from ARR/ACV, discount, free months)
  defaultPrice?: number; // default flat fee for one-time products (AE-editable)
}

// BPS values from Salesforce Product Fee Matrices object
// Source: https://docs.google.com/spreadsheets/d/1VAH-oQKQZT_UbQlkv7bR6YYV8A5NfNSv3-RC7Fxf7lE/edit?gid=1203721323
export const PRODUCTS: ProductConfig[] = [
  {
    name: "Procurement",
    displayName: "Procurement",
    type: "Core",
    annualFloor: 8000,
    defaultChecked: true,
    bpsByTier: [0.15, 0.12, 0.09, 0.08, 0.07, 0.06, 0.045, 0.035, 0.03],
  },
  {
    name: "AP",
    displayName: "AP",
    type: "Add-on",
    annualFloor: 3000,
    defaultChecked: true,
    bpsByTier: [0.03, 0.024, 0.018, 0.016, 0.014, 0.012, 0.009, 0.007, 0.006],
  },
  {
    name: "InventoryManagement",
    displayName: "Inventory Management",
    type: "Add-on",
    annualFloor: 3000,
    defaultChecked: true,
    bpsByTier: [0.045, 0.036, 0.027, 0.024, 0.021, 0.018, 0.014, 0.011, 0.009],
  },
  {
    name: "ToolTracking",
    displayName: "Tool Tracking",
    type: "Add-on",
    annualFloor: 3000,
    defaultChecked: true,
    bpsByTier: [0.03, 0.024, 0.018, 0.016, 0.014, 0.012, 0.009, 0.007, 0.006],
  },
  {
    name: "PreFab",
    displayName: "PreFab",
    type: "Add-on",
    annualFloor: 1500,
    defaultChecked: true,
    bpsByTier: [0.015, 0.012, 0.009, 0.008, 0.007, 0.006, 0.005, 0.004, 0.003],
  },
  {
    name: "SpecAgent",
    displayName: "Material Project Management",
    type: "Add-on",
    annualFloor: 2000,
    defaultChecked: true,
    bpsByTier: [0.023, 0.018, 0.014, 0.012, 0.011, 0.009, 0.007, 0.005, 0.005],
  },
  {
    name: "ProCore",
    displayName: "ProCore",
    type: "Add-on",
    annualFloor: 3000,
    defaultChecked: false,
    bpsByTier: [0.0075, 0.006, 0.0045, 0.004, 0.0035, 0.003, 0.0023, 0.0018, 0.0015],
  },
  {
    name: "OnsiteImplementation",
    displayName: "Onsite Implementation Services",
    type: "One-Time",
    annualFloor: 0,
    defaultChecked: false,
    bpsByTier: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    oneTime: true,
    defaultPrice: 7000,
  },
  {
    name: "VirtualImplementation",
    displayName: "Virtual Implementation Services",
    type: "One-Time",
    annualFloor: 0,
    defaultChecked: false,
    bpsByTier: [0, 0, 0, 0, 0, 0, 0, 0, 0],
    oneTime: true,
    defaultPrice: 5000,
  },
];

// ── Discount Approval Thresholds ──
export const DISCOUNT_VP_THRESHOLD = 25;
export const DISCOUNT_CEO_THRESHOLD = 35;

// ── Contract Term Options ──
export const CONTRACT_TERMS = [
  { label: "1 Year", months: 12 },
  { label: "2 Year", months: 24 },
  { label: "3 Year", months: 36 },
] as const;

// ── Free Months: 1 per 12 months of contract ──
export function maxFreeMonths(termMonths: number): number {
  return Math.floor(termMonths / 12);
}

// ── Active Asset → Product Mapping ──
// Maps SFDC Active Asset identifiers to ProductConfig names.
// Non-billable assets (fees, sandbox, etc.) are omitted and ignored in BPS computation.
const ASSET_TO_PRODUCT: Record<string, ProductName> = {
  PROCUREMENT: "Procurement",
  AP: "AP",
  INVENTORY_MANAGEMENT: "InventoryManagement",
  TOOL_TRACKING: "ToolTracking",
  PRE_FAB: "PreFab",
  PROCORE: "ProCore",
};

export function assetToProductName(asset: string): ProductName | null {
  return ASSET_TO_PRODUCT[asset.trim().toUpperCase()] ?? null;
}

// Maps a list of Active Assets to the unique billable ProductConfig names.
export function assetsToProducts(assets: string[]): ProductName[] {
  const mapped = new Set<ProductName>();
  for (const a of assets) {
    const name = assetToProductName(a);
    if (name) mapped.add(name);
  }
  return [...mapped];
}

// Sums BPS for a set of products at a given revenue tier.
// Returns BPS as a percentage (e.g., 8.4 means 8.4 basis points = 0.084%).
export function computeListBps(products: ProductName[], annualRevenue: number): number {
  const tierIndex = REVENUE_TIERS.findIndex(
    (t) => annualRevenue >= t.min && annualRevenue <= t.max
  );
  const idx = tierIndex === -1 ? REVENUE_TIERS.length - 1 : tierIndex;
  let total = 0;
  for (const product of PRODUCTS) {
    if (!products.includes(product.name)) continue;
    if (product.oneTime) continue;
    total += product.bpsByTier[idx] * 100; // config is in %, convert to bps
  }
  return total;
}
