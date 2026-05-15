import {
  PRODUCTS,
  REVENUE_TIERS,
  DISCOUNT_VP_THRESHOLD,
  DISCOUNT_CEO_THRESHOLD,
  ProductConfig,
} from "./pricing-config";
import {
  PricingRow,
  RomSummary,
  DealComparison,
  PricingState,
} from "./types-pricing";

// ── BPS Lookup ──
export function getBps(product: ProductConfig, annualRevenue: number): number {
  const tierIndex = REVENUE_TIERS.findIndex(
    (t) => annualRevenue >= t.min && annualRevenue <= t.max
  );
  // Default to last tier if revenue exceeds all tiers
  const idx = tierIndex === -1 ? REVENUE_TIERS.length - 1 : tierIndex;
  return product.bpsByTier[idx];
}

// ── Single Product Row Calculation ──
export function computeRow(
  product: ProductConfig,
  checked: boolean,
  annualRevenue: number,
  discountPct: number,
  termMonths: number,
  freeMonths: number,
  prospectSpend: number | null,
  flatPrice: number | null
): PricingRow {
  // One-time products: flat fee, no BPS, no discount, no amortization
  if (product.oneTime) {
    const price = flatPrice ?? product.defaultPrice ?? 0;
    return {
      product: product.name,
      displayName: product.displayName,
      type: product.type,
      checked,
      oneTime: true,
      bps: 0,
      annualPrice: price,
      discountedAnnual: price, // no discount on implementation
      monthly: 0,
      annualFloor: 0,
      atFloor: false,
      prospectSpend: null,
      savings: null,
      savingsPct: null,
    };
  }

  const bps = getBps(product, annualRevenue);
  const annualPrice = (annualRevenue * bps) / 100;
  // Apply discount, but never go below annual floor
  const rawDiscounted = annualPrice * (1 - discountPct / 100);
  const atFloor = rawDiscounted < product.annualFloor;
  const discountedAnnual = Math.max(rawDiscounted, product.annualFloor);

  // Amortize: customer pays for termMonths, gets termMonths + freeMonths of service
  // Monthly cost to customer = discountedAnnual / 12 (annual price stays the same)
  // But with free months, total cost = discountedAnnual * (termMonths/12)
  // spread over (termMonths + freeMonths) months
  const totalCost = discountedAnnual * (termMonths / 12);
  const monthly = totalCost / (termMonths + freeMonths);

  const savings = prospectSpend !== null ? prospectSpend - monthly : null;
  const savingsPct =
    prospectSpend !== null && prospectSpend > 0
      ? ((prospectSpend - monthly) / prospectSpend) * 100
      : null;

  return {
    product: product.name,
    displayName: product.displayName,
    type: product.type,
    checked,
    oneTime: false,
    bps,
    annualPrice,
    discountedAnnual,
    monthly,
    annualFloor: product.annualFloor,
    atFloor,
    prospectSpend,
    savings,
    savingsPct,
  };
}

// ── ROM Summary ──
export function computeRom(
  rows: PricingRow[],
  termMonths: number
): RomSummary {
  const checked = rows.filter((r) => r.checked);
  const recurring = checked.filter((r) => !r.oneTime);
  const oneTime = checked.filter((r) => r.oneTime);

  const annualFloorTotal = recurring.reduce((s, r) => s + r.annualFloor, 0);
  const monthlyDealPrice = recurring.reduce((s, r) => s + r.monthly, 0);
  const listAcv = recurring.reduce((s, r) => s + r.annualPrice, 0);
  const discountedAcv = recurring.reduce((s, r) => s + r.discountedAnnual, 0);
  const oneTimeTotal = oneTime.reduce((s, r) => s + r.annualPrice, 0);
  // TCV = recurring revenue × years + one-time fees (added once)
  const tcv = discountedAcv * (termMonths / 12) + oneTimeTotal;
  const effectiveDiscount =
    listAcv > 0 ? ((listAcv - discountedAcv) / listAcv) * 100 : 0;
  const totalProspectSpend = checked.reduce(
    (s, r) => s + (r.prospectSpend ?? 0),
    0
  );
  const totalSavings = checked.reduce((s, r) => s + (r.savings ?? 0), 0);

  return {
    annualFloorTotal,
    monthlyDealPrice,
    listAcv,
    discountedAcv,
    tcv,
    effectiveDiscount,
    totalProspectSpend,
    totalSavings,
    oneTimeTotal,
  };
}

// ── Deal Comparison ──
export function computeComparison(
  rows: PricingRow[],
  discountPct: number,
  termMonths: number,
  freeMonths: number
): DealComparison {
  // Exclude one-time fees from discount/free-months comparison
  const checked = rows.filter((r) => r.checked && !r.oneTime);
  const listAcv = checked.reduce((s, r) => s + r.annualPrice, 0);
  const discountedAcv = checked.reduce((s, r) => s + r.discountedAnnual, 0);
  const discountMonthly = checked.reduce((s, r) => s + r.monthly, 0);

  // Free months equivalent: how many free months produce the same effective monthly
  // With discount only (0 free months): monthly = discountedAnnual / termMonths * 12...
  // We want: listAcv / 12 * termMonths / (termMonths + N) = discountMonthly
  // Solve for N: N = (listAcv * termMonths) / (12 * discountMonthly) - termMonths
  let freeMonthsNeeded = 0;
  if (discountMonthly > 0 && discountPct > 0) {
    const listMonthlyTotal = listAcv / 12;
    const listTotalCost = listMonthlyTotal * termMonths;
    freeMonthsNeeded = Math.round(
      listTotalCost / discountMonthly - termMonths
    );
    if (freeMonthsNeeded < 0) freeMonthsNeeded = 0;
  }

  // Free months monthly: list price spread over (term + freeMonthsNeeded)
  const listTotalCost = (listAcv / 12) * termMonths;
  const freeMonthsMonthly =
    freeMonthsNeeded > 0
      ? listTotalCost / (termMonths + freeMonthsNeeded)
      : listTotalCost / termMonths;

  const discountApproval: "none" | "vp" | "ceo" =
    discountPct >= DISCOUNT_CEO_THRESHOLD
      ? "ceo"
      : discountPct >= DISCOUNT_VP_THRESHOLD
        ? "vp"
        : "none";

  return {
    discountPct,
    discountMonthly,
    discountArr: discountedAcv,
    discountArrLost: listAcv - discountedAcv,
    discountApproval,
    freeMonthsNeeded,
    freeMonthsMonthly,
    freeMonthsArr: listAcv,
    freeMonthsArrPreserved: listAcv - discountedAcv,
  };
}

// ── Full State Computation ──
export function computePricingState(
  annualRevenue: number,
  termMonths: number,
  freeMonths: number,
  discountPct: number,
  checkedProducts: Record<string, boolean>,
  prospectSpends: Record<string, number | null>,
  flatPrices: Record<string, number | null>
): PricingState {
  const rows = PRODUCTS.map((p) =>
    computeRow(
      p,
      checkedProducts[p.name] ?? p.defaultChecked,
      annualRevenue,
      discountPct,
      termMonths,
      freeMonths,
      prospectSpends[p.name] ?? null,
      flatPrices[p.name] ?? null
    )
  );

  const rom = computeRom(rows, termMonths);
  const comparison = computeComparison(rows, discountPct, termMonths, freeMonths);

  return { annualRevenue, termMonths, freeMonths, discountPct, rows, rom, comparison };
}
