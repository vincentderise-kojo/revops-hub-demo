/**
 * Endgame MCP HTTP client — server-side.
 *
 * Talks to app.endgame.io/api/v1/mcp via the Streamable HTTP transport from
 * the official MCP TypeScript SDK. Auth via ENDGAME_API_TOKEN env var.
 *
 * Phase 2 cron uses this to refresh the Pulse inspection cache on Vercel.
 * Phase 1 (in-Claude-Code) uses the Endgame MCP directly — this file is
 * the server-side equivalent for production.
 *
 * If this file behaves unexpectedly, prefer to verify the protocol against
 * https://docs.endgame.io/endgame-mcp-server before changing logic — there
 * is no separate REST API.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const ENDGAME_MCP_URL = "https://app.endgame.io/api/v1/mcp";

let cachedClient: Client | null = null;

async function getClient(): Promise<Client> {
  if (cachedClient) return cachedClient;
  const token = process.env.ENDGAME_API_TOKEN;
  if (!token) {
    throw new Error("ENDGAME_API_TOKEN is not set in the environment");
  }

  const transport = new StreamableHTTPClientTransport(new URL(ENDGAME_MCP_URL), {
    requestInit: {
      headers: { Authorization: `Bearer ${token}` },
    },
  });

  const client = new Client(
    { name: "crestline-pipeline-pulse-cron", version: "1.0.0" },
    { capabilities: {} }
  );
  await client.connect(transport);
  cachedClient = client;
  return client;
}

// Endgame's tool calls require these three usage-tracking fields on every request.
export interface EndgameContext {
  goal: string;
  task: string;
  journey: string;
}

function extractText(result: { content: Array<{ type: string; text?: string }> }): string {
  const textParts = result.content.filter((c) => c.type === "text" && typeof c.text === "string");
  if (textParts.length === 0) {
    throw new Error("Endgame tool returned no text content");
  }
  return textParts.map((c) => c.text as string).join("\n");
}

// ── query_data ──

export interface OppForInspection {
  opportunityId: string;
  opportunityName: string;
  accountId: string;
  accountName: string;
  amount: number;
  stage: string;
  discoveryDate: string;
  owner: string;
}

interface QueryDataRow {
  opportunity_id?: string;
  Opportunity_id?: string;
  opportunity_name?: string;
  account_id?: string;
  account_name?: string;
  amount?: string | number;
  Amount?: string | number;
  stage?: string;
  stage_name?: string;
  discovery_date?: string;
  opportunity_owner?: string;
  [key: string]: unknown;
}

/**
 * Look up opportunity + account details for a known set of 18-char opp IDs.
 * Used by the cron after we've pulled the lastWeek opps from the Pulse Sheet.
 */
export async function endgameLookupOpps(
  userId: string,
  oppIds: string[],
  ctx: EndgameContext
): Promise<OppForInspection[]> {
  const client = await getClient();
  const oppList = oppIds.join(", ");
  const userMessage = `For these specific opportunity IDs, return Opportunity ID (18-char), Opportunity Name, Account ID (18-char), Account Name, Amount, Stage, Discovery Date, and Opportunity Owner full name: ${oppList}`;

  const result = await client.callTool({
    name: "query_data",
    arguments: {
      user_id: userId,
      messages: [{ message_id: "opps-for-inspection", user_message: userMessage }],
      goal: ctx.goal,
      task: ctx.task,
      journey: ctx.journey,
    },
  });

  const text = extractText(result as { content: Array<{ type: string; text?: string }> });
  const parsed = JSON.parse(text);
  const rows: QueryDataRow[] = parsed?.data?.message_results?.[0]?.query_results?.[0]?.results ?? [];

  return rows
    .map((r): OppForInspection | null => {
      const oppId = r.opportunity_id ?? r.Opportunity_id;
      const accountId = r.account_id;
      if (!oppId || !accountId) return null;
      const amount = typeof r.amount === "string" ? Number(r.amount) : typeof r.Amount === "string" ? Number(r.Amount) : (r.amount as number) ?? (r.Amount as number) ?? 0;
      return {
        opportunityId: oppId as string,
        opportunityName: (r.opportunity_name as string) ?? "",
        accountId: accountId as string,
        accountName: (r.account_name as string) ?? "",
        amount: Number.isFinite(amount) ? amount : 0,
        stage: (r.stage as string) ?? (r.stage_name as string) ?? "",
        discoveryDate: (r.discovery_date as string) ?? "",
        owner: (r.opportunity_owner as string) ?? "",
      };
    })
    .filter((x): x is OppForInspection => x !== null);
}

// ── get_interaction_history ──

export interface InteractionFact {
  fact: string;
  quote: string;
  speaker: string | null;
}

export interface InteractionDoc {
  date: string;
  type: string;
  title: string;
  participants: string[];
  facts: InteractionFact[];
}

export interface AccountEngagement {
  accountId: string;
  accountName: string;
  emailStats: string;
  meetingStats: string;
  documents: InteractionDoc[];
}

interface InteractionAccountRaw {
  entity_id?: string;
  account_name?: string;
  email_stats?: string;
  meeting_stats?: string;
  documents?: Array<{
    date?: string;
    type?: string;
    title?: string;
    participants?: string[];
    facts?: Array<{ fact?: string; quote?: string; speaker?: string | null }>;
  }>;
}

export async function endgameInteractionHistory(
  accountId: string,
  afterDate: string,
  ctx: EndgameContext
): Promise<AccountEngagement | null> {
  const client = await getClient();
  const result = await client.callTool({
    name: "get_interaction_history",
    arguments: {
      account_id: accountId,
      after_date: afterDate,
      output: "summary",
      goal: ctx.goal,
      task: ctx.task,
      journey: ctx.journey,
    },
  });

  const text = extractText(result as { content: Array<{ type: string; text?: string }> });
  const parsed = JSON.parse(text);
  const accounts: InteractionAccountRaw[] = parsed?.data?.accounts ?? [];
  const acct = accounts.find((a) => a.entity_id === accountId) ?? accounts[0];
  if (!acct) return null;

  return {
    accountId,
    accountName: acct.account_name ?? "",
    emailStats: acct.email_stats ?? "",
    meetingStats: acct.meeting_stats ?? "",
    documents: (acct.documents ?? []).map((d) => ({
      date: d.date ?? "",
      type: d.type ?? "",
      title: d.title ?? "",
      participants: d.participants ?? [],
      facts: (d.facts ?? []).map((f) => ({
        fact: f.fact ?? "",
        quote: f.quote ?? "",
        speaker: f.speaker ?? null,
      })),
    })),
  };
}

export async function closeEndgameClient(): Promise<void> {
  if (cachedClient) {
    await cachedClient.close();
    cachedClient = null;
  }
}
