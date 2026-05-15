import { ProductName } from "./pricing-config";

// Per-product row in the pricing table
export interface PricingRow {
  product: ProductName;
  displayName: string;
  type: "Core" | "Add-on" | "One-Time";
  checked: boolean;
  oneTime: boolean;           // true = flat fee, not amortized, excluded from ARR/ACV
  bps: number;
  annualPrice: number;       // revenue × BPS ÷ 100 (or flat fee for one-time)
  discountedAnnual: number;  // annualPrice × (1 - discount%), floored (same as annualPrice for one-time)
  monthly: number;            // discountedAnnual ÷ (termMonths + freeMonths); 0 for one-time
  annualFloor: number;
  atFloor: boolean;           // true if discount would push below floor
  prospectSpend: number | null; // user-entered, optional
  savings: number | null;       // prospectSpend - monthly (null if no spend entered)
  savingsPct: number | null;    // savings / prospectSpend as pct
}

// ROM summary
export interface RomSummary {
  annualFloorTotal: number;   // sum of annual floors for checked recurring products
  monthlyDealPrice: number;   // sum of amortized monthly for checked recurring products
  listAcv: number;            // sum of annual prices (no discount) for checked recurring
  discountedAcv: number;      // sum of discounted annual for checked recurring
  tcv: number;                // discountedAcv × contract years + one-time fees
  effectiveDiscount: number;  // 1 - (discountedAcv / listAcv) as pct
  totalProspectSpend: number; // sum of prospect spend for checked
  totalSavings: number;       // sum of savings for checked
  oneTimeTotal: number;       // sum of one-time fees for checked one-time products
}

// Deal comparison: discount vs free months
export interface DealComparison {
  // Discount approach
  discountPct: number;
  discountMonthly: number;     // total monthly with discount
  discountArr: number;         // discounted ACV
  discountArrLost: number;     // listAcv - discountedAcv
  discountApproval: "none" | "vp" | "ceo";

  // Free months approach (equivalent effective monthly)
  freeMonthsNeeded: number;    // how many free months match the discount
  freeMonthsMonthly: number;   // effective monthly with free months
  freeMonthsArr: number;       // list ACV (preserved)
  freeMonthsArrPreserved: number; // freeMonthsArr - discountArr
}

// Full calculator state passed around
export interface PricingState {
  annualRevenue: number;
  termMonths: number;
  freeMonths: number;
  discountPct: number;
  rows: PricingRow[];
  rom: RomSummary;
  comparison: DealComparison;
}
