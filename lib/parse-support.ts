import { SlackMessage, fetchChannelHistory, fetchThreadReplies } from "@/lib/slack-client";

// ── Types ──

export interface SupportTicket {
  requester: string;
  department: string;
  category: string;
  categoryShort: string;
  priority: "P0" | "P1" | "P2" | "P3";
  subject: string;
  description: string;
  submittedAt: string; // ISO string (serialized for client)
  messageTs: string;
  status: "Open" | "Processing" | "Resolved" | "Unknown";
  resolvedAt: string | null; // ISO string
  resolutionMinutes: number | null;
}

export interface SupportData {
  tickets: SupportTicket[];
  fetchedAt: string; // ISO string
}

// ── Constants ──

const CHANNEL_ID = "DEMO_REVOPS_SUPPORT";
const BOT_ID = "B07SCUZU5ML";

const CATEGORY_MAP: Record<string, string> = {
  "salesforce": "Salesforce",
  "reporting": "Salesforce",
  "dashboards": "Salesforce",
  "routing": "Routing",
  "assigning": "Routing",
  "deal desk": "Deal Desk",
  "docusign": "Deal Desk",
  "custom contracts": "Deal Desk",
};

// ── Parsing ──

function shortenCategory(raw: string): string {
  const lower = raw.toLowerCase();
  for (const [keyword, label] of Object.entries(CATEGORY_MAP)) {
    if (lower.includes(keyword)) return label;
  }
  return "Other";
}

function parsePriority(raw: string): "P0" | "P1" | "P2" | "P3" {
  if (raw.includes("P0")) return "P0";
  if (raw.includes("P1")) return "P1";
  if (raw.includes("P2")) return "P2";
  return "P3";
}

function extractField(text: string, fieldName: string): string {
  // Fields are formatted as *FieldName*\nValue or *FieldName:*\nValue
  const pattern = new RegExp(`\\*${fieldName}:?\\*\\s*\\n([^\\n*]+)`, "i");
  const match = text.match(pattern);
  return match ? match[1].trim() : "";
}

function extractRequester(text: string): string {
  // Format: <@U12345|username> submitted a request!
  const match = text.match(/<@[A-Z0-9]+\|([^>]+)>/);
  return match ? match[1] : "Unknown";
}

function parseTicketFromMessage(msg: SlackMessage): SupportTicket | null {
  if (msg.bot_id !== BOT_ID) return null;
  if (!msg.text.includes("submitted a request")) return null;

  const text = msg.text;
  const submittedAt = new Date(parseFloat(msg.ts) * 1000);

  return {
    requester: extractRequester(text),
    department: extractField(text, "Department"),
    category: extractField(text, "Category"),
    categoryShort: shortenCategory(extractField(text, "Category")),
    priority: parsePriority(extractField(text, "Priority")),
    subject: extractField(text, "Subject"),
    description: extractField(text, "Description"),
    submittedAt: submittedAt.toISOString(),
    messageTs: msg.ts,
    status: "Unknown",
    resolvedAt: null,
    resolutionMinutes: null,
  };
}

function detectStatus(
  replies: SlackMessage[],
): { status: "Open" | "Processing" | "Resolved"; resolvedAt: Date | null } {
  let status: "Open" | "Processing" | "Resolved" = "Open";
  let resolvedAt: Date | null = null;

  for (const reply of replies) {
    if (reply.text.includes("has Completed")) {
      status = "Resolved";
      resolvedAt = new Date(parseFloat(reply.ts) * 1000);
    } else if (reply.text.includes("is Processing") && status !== "Resolved") {
      status = "Processing";
    }
  }

  return { status, resolvedAt };
}

// ── Main fetch + parse ──

export async function loadSupportTickets(): Promise<SupportData> {
  const now = new Date();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const oldestTimestamp = String(Math.floor(ninetyDaysAgo.getTime() / 1000));

  console.log("[Support] Fetching channel history (90 days)...");
  let messages: SlackMessage[];
  try {
    messages = await fetchChannelHistory(CHANNEL_ID, oldestTimestamp);
  } catch (err) {
    console.error("[Support] Channel history fetch failed; rendering empty:", err);
    messages = [];
  }
  console.log(`[Support] Got ${messages.length} messages`);

  // Parse all bot ticket messages
  const tickets: SupportTicket[] = [];
  for (const msg of messages) {
    const ticket = parseTicketFromMessage(msg);
    if (ticket) tickets.push(ticket);
  }
  console.log(`[Support] Parsed ${tickets.length} tickets`);

  // Read threads for tickets in the 14-day window to get status
  let threadReads = 0;
  for (const ticket of tickets) {
    const ticketDate = new Date(ticket.submittedAt);
    if (ticketDate < fourteenDaysAgo) continue;

    const replies = await fetchThreadReplies(CHANNEL_ID, ticket.messageTs);
    threadReads++;
    const { status, resolvedAt } = detectStatus(replies);
    ticket.status = status;
    if (resolvedAt) {
      ticket.resolvedAt = resolvedAt.toISOString();
      ticket.resolutionMinutes = Math.round(
        (resolvedAt.getTime() - ticketDate.getTime()) / 60_000,
      );
    }
  }
  console.log(`[Support] Read ${threadReads} threads for status`);

  // Sort: newest first (server sends all, client sorts per-view)
  tickets.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

  return {
    tickets,
    fetchedAt: now.toISOString(),
  };
}
