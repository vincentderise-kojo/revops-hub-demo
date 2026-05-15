import { loadDashboardData } from "@/lib/load-dashboard-state";
import { loadInspections } from "@/lib/load-inspections";
import Dashboard from "@/components/dashboard";

export const dynamic = "force-dynamic";

export default async function Page() {
  const [{ segmented, sdrData, aePerformance }, inspections] = await Promise.all([
    loadDashboardData(),
    loadInspections(),
  ]);

  const serializedData = JSON.parse(
    JSON.stringify(segmented, (_key, value) => {
      if (value instanceof Date) return value.toISOString();
      return value;
    })
  );

  const serializedSdrData = JSON.parse(
    JSON.stringify(sdrData, (_key, value) => {
      if (value instanceof Date) return value.toISOString();
      return value;
    })
  );

  // aePerformance already serializes Date fields to strings inside the processor
  return (
    <Dashboard
      data={serializedData}
      sdrData={serializedSdrData}
      aePerformance={aePerformance}
      inspections={inspections}
    />
  );
}
