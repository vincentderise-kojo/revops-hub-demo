// Contract ACR extraction.
//
// Primary path: regex against the structured `Annual Construction Revenue: $X,XXX,XXX.XX`
// line on the current Order Form template. Validated against All Weather Contractors
// signed contract ($28M).
//
// Fallback path (older templates that lack the structured label): Claude PDF parse,
// invoked from parseContractAcr() in this same module — kept here so the parser is one
// import for callers.

export type ParseMethod = "regex" | "regex_ambiguous" | "claude" | "not_found";

export interface AcrParseResult {
  statedAcr: number | null;
  rawExcerpt: string;
  method: ParseMethod;
}

const ACR_REGEX = /Annual Construction Revenue[:\s]+\$([\d,]+(?:\.\d{2})?)/gi;
const EXCERPT_RADIUS = 200;

function parseUsd(raw: string): number {
  return parseFloat(raw.replace(/,/g, ""));
}

function excerptAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - EXCERPT_RADIUS);
  const end = Math.min(text.length, index + length + EXCERPT_RADIUS);
  return text.slice(start, end).trim();
}

/** Pure text-based extraction. PDF buffer → text conversion happens in parseContractAcr(). */
export function extractAcrFromText(text: string): AcrParseResult {
  const matches = Array.from(text.matchAll(ACR_REGEX));
  if (matches.length === 0) {
    return { statedAcr: null, rawExcerpt: "", method: "not_found" };
  }

  if (matches.length === 1) {
    const m = matches[0];
    return {
      statedAcr: parseUsd(m[1]),
      rawExcerpt: excerptAround(text, m.index ?? 0, m[0].length),
      method: "regex",
    };
  }

  // Multiple matches — take the largest USD value, flag ambiguous.
  let best = matches[0];
  let bestValue = parseUsd(best[1]);
  for (const m of matches.slice(1)) {
    const v = parseUsd(m[1]);
    if (v > bestValue) {
      best = m;
      bestValue = v;
    }
  }
  return {
    statedAcr: bestValue,
    rawExcerpt: excerptAround(text, best.index ?? 0, best[0].length),
    method: "regex_ambiguous",
  };
}

import Anthropic from "@anthropic-ai/sdk";
// Import from internal lib path to avoid pdf-parse's debug-mode test file read on import
// (module.parent is null in ESM contexts which triggers the pdf-parse self-test)
// @ts-expect-error — internal path has no .d.ts; the function surface we use matches the public entry
import pdfParse from "pdf-parse/lib/pdf-parse.js";

const CLAUDE_MODEL = "claude-opus-4-7";

const CLAUDE_PROMPT = `You are extracting one specific value from a signed Order Form PDF.

Find the customer's stated "Annual Construction Revenue" — the company's annual construction revenue
disclosed at signing. On the current template this appears under the "Products" section header
as a labeled line. Older templates may use different formatting.

Return JSON with exactly these fields:
  - statedAcr: number (dollar value) or null if not found
  - excerpt: string — up to 400 chars around where you found it, or doc head if not found

Do not infer or estimate. If the value is not explicitly stated, return null.`;

const CLAUDE_SCHEMA = {
  type: "object",
  properties: {
    statedAcr: { type: ["number", "null"] },
    excerpt: { type: "string" },
  },
  required: ["statedAcr", "excerpt"],
  additionalProperties: false,
} as const;

async function pdfToText(buffer: Buffer): Promise<string> {
  try {
    const result = await pdfParse(buffer);
    return result.text;
  } catch {
    return "";
  }
}

async function claudeAcrExtract(buffer: Buffer): Promise<{ statedAcr: number | null; excerpt: string }> {
  const anthropic = new Anthropic();
  const response = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    system: CLAUDE_PROMPT,
    output_config: {
      format: { type: "json_schema", schema: CLAUDE_SCHEMA },
    },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: buffer.toString("base64") },
          },
          { type: "text", text: "Extract the Annual Construction Revenue per the system prompt." },
        ],
      },
    ],
  });
  const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === "text");
  if (!textBlock) return { statedAcr: null, excerpt: "" };
  return JSON.parse(textBlock.text);
}

/**
 * Extract Annual Construction Revenue from a signed Order Form PDF buffer.
 * Tries regex first (free, fast, deterministic); falls back to Claude PDF parse only when
 * the structured label is absent (older templates).
 */
export async function parseContractAcr(buffer: Buffer): Promise<AcrParseResult> {
  const text = await pdfToText(buffer);
  if (text) {
    const regexResult = extractAcrFromText(text);
    if (regexResult.statedAcr !== null) return regexResult;
  }

  // Fallback to Claude.
  try {
    const claudeResult = await claudeAcrExtract(buffer);
    if (claudeResult.statedAcr !== null) {
      return {
        statedAcr: claudeResult.statedAcr,
        rawExcerpt: claudeResult.excerpt,
        method: "claude",
      };
    }
  } catch {
    // fall through to not_found
  }

  return {
    statedAcr: null,
    rawExcerpt: text.slice(0, 400),
    method: "not_found",
  };
}
