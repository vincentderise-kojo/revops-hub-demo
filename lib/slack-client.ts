const SLACK_API_BASE = "https://slack.com/api";

function getToken(): string {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN environment variable is not set");
  return token;
}

interface SlackMessage {
  type: string;
  subtype?: string;
  text: string;
  ts: string;
  bot_id?: string;
  reply_count?: number;
}

interface SlackHistoryResponse {
  ok: boolean;
  messages: SlackMessage[];
  has_more: boolean;
  response_metadata?: { next_cursor?: string };
  error?: string;
}

interface SlackRepliesResponse {
  ok: boolean;
  messages: SlackMessage[];
  has_more: boolean;
  error?: string;
}

export type { SlackMessage };

export async function fetchChannelHistory(
  channelId: string,
  oldestTimestamp: string,
): Promise<SlackMessage[]> {
  const token = getToken();
  const allMessages: SlackMessage[] = [];
  let cursor: string | undefined;

  do {
    const params = new URLSearchParams({
      channel: channelId,
      oldest: oldestTimestamp,
      limit: "200",
    });
    if (cursor) params.set("cursor", cursor);

    const res = await fetch(`${SLACK_API_BASE}/conversations.history?${params}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data: SlackHistoryResponse = await res.json();

    if (!data.ok) {
      console.error("[Slack] conversations.history error:", data.error);
      throw new Error(`Slack conversations.history failed: ${data.error ?? "unknown"}`);
    }

    allMessages.push(...data.messages);
    cursor = data.response_metadata?.next_cursor || undefined;
  } while (cursor);

  return allMessages;
}

export async function fetchThreadReplies(
  channelId: string,
  threadTs: string,
): Promise<SlackMessage[]> {
  const token = getToken();
  const params = new URLSearchParams({
    channel: channelId,
    ts: threadTs,
    limit: "100",
  });

  const res = await fetch(`${SLACK_API_BASE}/conversations.replies?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data: SlackRepliesResponse = await res.json();

  if (!data.ok) {
    console.error("[Slack] conversations.replies error:", data.error);
    return [];
  }

  // First message is the parent — return only replies
  return data.messages.slice(1);
}

export interface PostMessageResult {
  ok: boolean;
  ts?: string;
  error?: string;
}

export async function postBlockKitMessage(
  channelId: string,
  blocks: any[],
  text: string,
): Promise<PostMessageResult> {
  const token = getToken();
  const res = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ channel: channelId, blocks, text }),
  });
  const data: { ok: boolean; ts?: string; error?: string } = await res.json();
  if (!data.ok) {
    console.error("[Slack] chat.postMessage error:", data.error);
  }
  return data;
}

export async function dmUser(
  userId: string,
  text: string,
): Promise<PostMessageResult> {
  const token = getToken();
  // Open a DM channel first
  const openRes = await fetch(`${SLACK_API_BASE}/conversations.open`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ users: userId }),
  });
  const openData: { ok: boolean; channel?: { id: string }; error?: string } = await openRes.json();
  if (!openData.ok || !openData.channel) {
    console.error("[Slack] conversations.open error:", openData.error);
    return { ok: false, error: openData.error };
  }
  return postBlockKitMessage(openData.channel.id, [], text);
}

export async function dmUserBlocks(
  userId: string,
  blocks: unknown[],
  text: string,
): Promise<PostMessageResult> {
  const token = getToken();
  const openRes = await fetch(`${SLACK_API_BASE}/conversations.open`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ users: userId }),
  });
  const openData: { ok: boolean; channel?: { id: string }; error?: string } = await openRes.json();
  if (!openData.ok || !openData.channel) {
    console.error("[Slack] conversations.open error:", openData.error);
    return { ok: false, error: openData.error };
  }
  return postBlockKitMessage(openData.channel.id, blocks as never[], text);
}
