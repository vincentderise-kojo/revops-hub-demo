import type { Metadata } from "next";
import PricingCalculator from "@/components/pricing-calculator";

export const metadata: Metadata = {
  title: "Pricing Calculator — Kojo RevOps Hub",
  description: "Calculate deal pricing by product, revenue tier, and deal structure",
};

export default function PricingPage() {
  return <PricingCalculator />;
}
