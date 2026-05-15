import type { GroupKey } from "./config";
import { GROUP_KEYS } from "./config";
import type { MtdMonth } from "./types";

const NON_AE: GroupKey[] = GROUP_KEYS.filter((g) => g !== "ae");

export interface MtdHeadlineMath {
  /** Numerator. Excludes AE except in AE-only mode (where AE is the primary metric).
   *  AE is upside on top of the board plan; never folded into board-plan progress. */
  primaryCreated: number;
  /** Primary denominator. Prefers MtdMonth.monthlyTarget when the active filter
   *  spans the full board plan; otherwise sums byGroup targets. */
  primaryTarget: number;
  /** Display label for the primary denominator. */
  primaryLabel: "board plan" | "target" | "AE upside";
  /** AE created amount when AE is active alongside any non-AE group; null otherwise. */
  upsideAmount: number | null;
  /** "AE upside" when shown, null otherwise. */
  upsideLabel: "AE upside" | null;
  /** primaryTarget − primaryCreated. Drives the page-header `MTD: $X TO GO` badge. */
  filteredGapToTarget: number;
}

export function computeMtdHeadline(
  activeGroups: Set<GroupKey>,
  current: MtdMonth,
): MtdHeadlineMath {
  const aeActive = activeGroups.has("ae");
  const nonAeActive = NON_AE.filter((g) => activeGroups.has(g));
  const allBoardPlan = nonAeActive.length === NON_AE.length;

  // AE-only mode: AE is the primary metric, not upside.
  if (aeActive && nonAeActive.length === 0) {
    const ae = current.byGroup.ae;
    return {
      primaryCreated: ae.totalCreated,
      primaryTarget: ae.monthlyTarget,
      primaryLabel: "AE upside",
      upsideAmount: null,
      upsideLabel: null,
      filteredGapToTarget: ae.monthlyTarget - ae.totalCreated,
    };
  }

  // Otherwise: non-AE forms the primary; AE (if active) is shown only as the
  // upside callout. AE never folds into primaryCreated, primaryTarget, or
  // filteredGapToTarget — it is "upside on top of the board plan."
  const primaryCreated = nonAeActive.reduce((s, g) => s + current.byGroup[g].totalCreated, 0);
  // Prefer MtdMonth.monthlyTarget when the full board plan is active — it's the
  // authoritative board-committed value and avoids a $24-$76 visual drift from
  // the top-line MTD card. For partial subsets, sum byGroup targets.
  const primaryTarget = allBoardPlan
    ? current.monthlyTarget
    : nonAeActive.reduce((s, g) => s + current.byGroup[g].monthlyTarget, 0);
  const aeCreated = aeActive ? current.byGroup.ae.totalCreated : 0;

  return {
    primaryCreated,
    primaryTarget,
    primaryLabel: allBoardPlan ? "board plan" : "target",
    upsideAmount: aeActive ? aeCreated : null,
    upsideLabel: aeActive ? "AE upside" : null,
    filteredGapToTarget: primaryTarget - primaryCreated,
  };
}
