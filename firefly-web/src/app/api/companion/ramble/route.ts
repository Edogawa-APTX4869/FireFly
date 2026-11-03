import { NextRequest, NextResponse } from "next/server";
import { getKv, setKv } from "@/lib/server/db";
import { getSession } from "@/lib/server/session";

export type AiProviderType = "disabled" | "local-heuristic" | "gemini" | "openai-compatible";

export interface LlmConfig {
  enabled: boolean;
  provider: AiProviderType;
  endpoint: string;
  model: string;
  apiKey: string;
  verified: boolean;
  verifiedAt?: string;
}

export interface AttachmentPayload {
  name: string;
  mimeType: string;
  dataUrl: string; // data:<mime>;base64,<data>
}

export interface ParsedTransactionDraft {
  type: "withdrawal" | "deposit" | "transfer";
  amount: string;
  currency_code: string;
  description: string;
  source_name: string;
  destination_name: string;
  category_name: string;
  budget_name: string;
  tags: string[];
  date: string;
}

const GEMINI_OPENAI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

function getLlmConfig(): LlmConfig {
  const saved = getKv<Partial<LlmConfig>>("llm_config", {});
  const envEndpoint = process.env.ASSISTANT_LLM_ENDPOINT || "";
  const envModel = process.env.ASSISTANT_LLM_MODEL || "";
  const envKey = process.env.ASSISTANT_LLM_API_KEY || "";

  const provider: AiProviderType =
    saved.provider ||
    (saved.endpoint?.includes("generativelanguage.googleapis.com")
      ? "gemini"
      : saved.endpoint || envEndpoint
        ? "openai-compatible"
        : "disabled");

  const endpoint =
    provider === "gemini"
      ? GEMINI_OPENAI_ENDPOINT
      : saved.endpoint ?? envEndpoint;

  const model =
    saved.model ||
    envModel ||
    (provider === "gemini" ? "gemini-2.5-flash" : "gpt-4o-mini");

  const apiKey = saved.apiKey ?? envKey;
  const verified = Boolean(saved.verified);
  const enabled = Boolean(saved.enabled && verified && provider !== "disabled");

  return {
    enabled,
    provider,
    endpoint,
    model,
    apiKey,
    verified,
    verifiedAt: saved.verifiedAt,
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  const cfg = getLlmConfig();
  return NextResponse.json({
    data: {
      enabled: cfg.enabled,
      provider: cfg.provider,
      endpoint: cfg.endpoint,
      model: cfg.model,
      hasApiKey: Boolean(cfg.apiKey),
      verified: cfg.verified,
      verifiedAt: cfg.verifiedAt ?? null,
    },
  });
}

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = (await req.json()) as Partial<LlmConfig> & { testConnection?: boolean };
  const prev = getLlmConfig();

  const provider: AiProviderType = body.provider ?? prev.provider;
  const endpoint =
    provider === "gemini"
      ? GEMINI_OPENAI_ENDPOINT
      : (body.endpoint ?? prev.endpoint).trim();
  const model =
    (body.model ?? prev.model).trim() ||
    (provider === "gemini" ? "gemini-2.5-flash" : "gpt-4o-mini");
  const apiKey = body.apiKey !== undefined ? body.apiKey.trim() : prev.apiKey;

  if (provider === "disabled") {
    const disabledCfg: LlmConfig = {
      enabled: false,
      provider: "disabled",
      endpoint,
      model,
      apiKey,
      verified: false,
    };
    setKv("llm_config", disabledCfg);
    return NextResponse.json({
      data: {
        enabled: false,
        provider: "disabled",
        endpoint,
        model,
        hasApiKey: Boolean(apiKey),
        verified: false,
        verifiedAt: null,
      },
    });
  }

  // Always verify that the selected engine actually works before enabling the chatbar
  let verified = false;
  let verifyError = "";

  if (provider === "local-heuristic") {
    const testDrafts = parseWithSmartHeuristics({
      text: "Spent 1.000 BHD test",
      today: new Date().toISOString().slice(0, 10),
      defaultCurrency: "BHD",
      defaultAccount: "DailyAccount",
      accounts: ["DailyAccount"],
      categories: [],
      budgets: [],
      tags: [],
    });
    verified = testDrafts.length > 0;
  } else {
    if (!endpoint) {
      return NextResponse.json(
        { error: "Endpoint URL is required for external AI providers." },
        { status: 400 },
      );
    }
    if (provider === "gemini" && !apiKey) {
      return NextResponse.json(
        { error: "A Google AI Studio (Gemini) key is required to verify Gemini." },
        { status: 400 },
      );
    }
    try {
      await verifyLlmConnection({
        enabled: true,
        provider,
        endpoint,
        model,
        apiKey,
        verified: false,
      });
      verified = true;
    } catch (e) {
      verifyError = (e as Error).message || "Connection test failed";
    }
  }

  if (!verified) {
    const failedCfg: LlmConfig = {
      enabled: false,
      provider,
      endpoint,
      model,
      apiKey,
      verified: false,
    };
    setKv("llm_config", failedCfg);
    return NextResponse.json(
      {
        error: `AI verification failed: ${verifyError}. Chatbar remains hidden until the connection succeeds.`,
      },
      { status: 400 },
    );
  }

  const verifiedAt = new Date().toISOString();
  const next: LlmConfig = {
    enabled: body.enabled ?? true,
    provider,
    endpoint,
    model,
    apiKey,
    verified: true,
    verifiedAt,
  };
  setKv("llm_config", next);

  return NextResponse.json({
    data: {
      enabled: next.enabled,
      provider: next.provider,
      endpoint: next.endpoint,
      model: next.model,
      hasApiKey: Boolean(next.apiKey),
      verified: next.verified,
      verifiedAt: next.verifiedAt,
    },
  });
}

async function verifyLlmConnection(cfg: LlmConfig): Promise<void> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;

  const res = await fetch(cfg.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: cfg.model,
      max_tokens: 25,
      temperature: 0,
      messages: [{ role: "user", content: 'Reply with {"ok":true}' }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${errText ? `: ${errText.slice(0, 140)}` : ""}`);
  }
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });

  const body = (await req.json()) as {
    text?: string;
    attachments?: AttachmentPayload[];
    today?: string;
    defaultCurrency?: string;
    defaultAccount?: string;
    accounts?: string[];
    categories?: string[];
    budgets?: string[];
    tags?: string[];
  };

  const text = (body.text ?? "").trim();
  const attachments = body.attachments ?? [];
  if (!text && attachments.length === 0) {
    return NextResponse.json({ error: "Enter text or attach a receipt/file to parse" }, { status: 400 });
  }

  const today = body.today || new Date().toISOString().slice(0, 10);
  const defaultCurrency = body.defaultCurrency || "BHD";
  const defaultAccount = body.defaultAccount || "";
  const cfg = getLlmConfig();

  // If an LLM provider is configured & verified, use it (including multimodal vision for receipt images)
  if ((cfg.provider === "gemini" || cfg.provider === "openai-compatible") && cfg.endpoint) {
    try {
      const drafts = await parseWithLlm(cfg, {
        text: text || "Extract the transaction details from the attached receipt/document.",
        attachments,
        today,
        defaultCurrency,
        defaultAccount,
        accounts: body.accounts ?? [],
        categories: body.categories ?? [],
        budgets: body.budgets ?? [],
        tags: body.tags ?? [],
      });
      if (drafts.length > 0) {
        return NextResponse.json({
          data: drafts,
          engine: cfg.provider === "gemini" ? "gemini" : "llm",
        });
      }
    } catch {
      // Fall back to deterministic smart parser if LLM fails
    }
  }

  const fallbackText =
    text ||
    attachments.map((a) => a.name.replace(/\.[^.]+$/, "")).join(" ");

  const drafts = parseWithSmartHeuristics({
    text: fallbackText,
    today,
    defaultCurrency,
    defaultAccount,
    accounts: body.accounts ?? [],
    categories: body.categories ?? [],
    budgets: body.budgets ?? [],
    tags: body.tags ?? [],
  });

  // If the user only attached a receipt image with no numbers in the filename and local heuristic is used,
  // create a ready-to-edit draft card with the attachment linked so they can fill the amount in 1 tap.
  if (drafts.length === 0 && attachments.length > 0) {
    drafts.push({
      type: "withdrawal",
      amount: "0.000",
      currency_code: defaultCurrency,
      description: attachments[0].name.replace(/\.[^.]+$/, "") || "Receipt Expense",
      source_name: defaultAccount,
      destination_name: attachments[0].name.replace(/\.[^.]+$/, "") || "Merchant",
      category_name: "",
      budget_name: "",
      tags: ["receipt"],
      date: today,
    });
  }

  return NextResponse.json({ data: drafts, engine: "smart-local" });
}

async function parseWithLlm(
  cfg: LlmConfig,
  ctx: {
    text: string;
    attachments: AttachmentPayload[];
    today: string;
    defaultCurrency: string;
    defaultAccount: string;
    accounts: string[];
    categories: string[];
    budgets: string[];
    tags: string[];
  },
): Promise<ParsedTransactionDraft[]> {
  const prompt = `You are a financial transaction and receipt parser for Firefly III.
Today's date is ${ctx.today}. Default currency: ${ctx.defaultCurrency}. Default asset account: "${ctx.defaultAccount}".
Known asset accounts: ${JSON.stringify(ctx.accounts)}
Known categories: ${JSON.stringify(ctx.categories)}
Known budgets: ${JSON.stringify(ctx.budgets)}
Known tags: ${JSON.stringify(ctx.tags)}

Extract one or more transactions from the user's message and/or attached receipt images and return ONLY a JSON object {"transactions": [...]} where each item has:
- "type": "withdrawal" | "deposit" | "transfer"
- "amount": string numeric (e.g. "4.500")
- "currency_code": 3-letter ISO code (default "${ctx.defaultCurrency}")
- "description": concise merchant or item description
- "source_name": asset account for withdrawal/transfer, or payer for deposit
- "destination_name": merchant for withdrawal, or asset account for deposit/transfer
- "category_name": best matching category from known categories or empty string
- "budget_name": best matching budget or empty string
- "tags": array of strings
- "date": YYYY-MM-DD`;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;

  // Build multimodal content array if image attachments are included
  const imageAttachments = ctx.attachments.filter((a) => a.mimeType.startsWith("image/"));
  const userContent: unknown =
    imageAttachments.length > 0
      ? [
          { type: "text", text: ctx.text },
          ...imageAttachments.map((img) => ({
            type: "image_url",
            image_url: { url: img.dataUrl },
          })),
        ]
      : ctx.text;

  const res = await fetch(cfg.endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: userContent },
      ],
    }),
  });

  if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const rawContent = data.choices?.[0]?.message?.content ?? "{}";
  const cleaned = rawContent.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
  const parsed = JSON.parse(cleaned) as { transactions?: ParsedTransactionDraft[] };
  return Array.isArray(parsed.transactions) ? parsed.transactions : [];
}

/**
 * Built-in offline multi-transaction natural-language parser ("Ramble") that works out-of-the-box
 * with zero external API keys. Splits sentences/clauses and extracts amounts, currencies, dates,
 * categories, accounts, and descriptions.
 */
function parseWithSmartHeuristics(ctx: {
  text: string;
  today: string;
  defaultCurrency: string;
  defaultAccount: string;
  accounts: string[];
  categories: string[];
  budgets: string[];
  tags: string[];
}): ParsedTransactionDraft[] {
  const segments = ctx.text
    .split(/\n+|;|\b(?:and\s+(?:spent|paid|bought|received|transferred|got)|then)\b/i)
    .map((s) => s.trim())
    .filter(Boolean);

  const results: ParsedTransactionDraft[] = [];
  const currencyMap: Record<string, string> = {
    bhd: "BHD",
    bd: "BHD",
    dinar: "BHD",
    dinars: "BHD",
    usd: "USD",
    $: "USD",
    dollar: "USD",
    dollars: "USD",
    eur: "EUR",
    "€": "EUR",
    euro: "EUR",
    euros: "EUR",
    gbp: "GBP",
    "£": "GBP",
    sar: "SAR",
    aed: "AED",
    kwd: "KWD",
    omr: "OMR",
  };

  for (const seg of segments) {
    const amtMatch = seg.match(
      /(?:(BHD|BD|USD|\$|EUR|€|GBP|£|SAR|AED|KWD|OMR)\s*)?(\d+(?:[.,]\d{1,4})?)\s*(BHD|BD|dinars?|USD|\$|dollars?|EUR|€|euros?|GBP|£|SAR|AED|KWD|OMR)?/i,
    );
    if (!amtMatch) continue;

    const rawCur = (amtMatch[1] || amtMatch[3] || "").toLowerCase();
    const currency_code = currencyMap[rawCur] || ctx.defaultCurrency;
    const amount = amtMatch[2].replace(",", ".");

    const lower = seg.toLowerCase();
    let type: "withdrawal" | "deposit" | "transfer" = "withdrawal";
    if (/\b(received|salary|income|earned|deposited|refund)\b/i.test(lower)) {
      type = "deposit";
    } else if (/\b(transfer|transferred|moved)\b/i.test(lower)) {
      type = "transfer";
    }

    let date = ctx.today;
    if (/\byesterday\b/i.test(lower)) {
      const d = new Date(`${ctx.today}T12:00:00`);
      d.setDate(d.getDate() - 1);
      date = d.toISOString().slice(0, 10);
    }

    let category_name = "";
    for (const c of ctx.categories) {
      const parts = c.toLowerCase().split(/[:/>›]/).map((p) => p.trim());
      if (parts.some((p) => p.length > 2 && lower.includes(p))) {
        category_name = c;
        break;
      }
    }

    let matchedAccount = ctx.defaultAccount;
    for (const a of ctx.accounts) {
      if (a && lower.includes(a.toLowerCase())) {
        matchedAccount = a;
        break;
      }
    }

    const foundTags: string[] = [];
    const hashMatches = seg.matchAll(/#([\w-]+)/g);
    for (const m of hashMatches) foundTags.push(m[1]);
    for (const t of ctx.tags) {
      if (t && lower.includes(t.toLowerCase()) && !foundTags.includes(t)) {
        foundTags.push(t);
      }
    }

    let desc = seg
      .replace(amtMatch[0], "")
      .replace(/\b(spent|paid|bought|for|on|at|from|to|yesterday|today|this morning|tonight)\b/gi, " ")
      .replace(/#[\w-]+/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!desc) desc = category_name || (type === "deposit" ? "Income" : "Expense");
    desc = desc.charAt(0).toUpperCase() + desc.slice(1);

    results.push({
      type,
      amount,
      currency_code,
      description: desc,
      source_name: type === "deposit" ? desc : matchedAccount,
      destination_name: type === "deposit" ? matchedAccount : desc,
      category_name,
      budget_name: "",
      tags: foundTags,
      date,
    });
  }

  return results;
}
