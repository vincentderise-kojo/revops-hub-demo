import { loadSupportTickets } from "@/lib/parse-support";
import SupportDashboard from "@/components/support-dashboard";

export const dynamic = "force-dynamic";

export default async function SupportPage() {
  let data;

  try {
    data = await loadSupportTickets();
    console.log(`[Support] Loaded ${data.tickets.length} tickets`);
  } catch (err) {
    console.error("[Support] Failed to load tickets:", err);
    data = { tickets: [], fetchedAt: new Date().toISOString() };
  }

  return <SupportDashboard data={data} />;
}
