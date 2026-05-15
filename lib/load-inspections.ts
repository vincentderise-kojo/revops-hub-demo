/**
 * Load the Pulse inspection cache.
 *
 * Demo build: reads directly from the committed data/inspections.json.
 * (Production build used Vercel Blob; not needed for portfolio demo.)
 */

import inspectionsFallback from "@/data/inspections.json";
import type { InspectionCache } from "./types";

export async function loadInspections(): Promise<InspectionCache> {
  // Demo build: no Blob storage — use committed fallback directly.
  return inspectionsFallback as InspectionCache;
}
