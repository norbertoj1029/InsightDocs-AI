import OpenAI from "openai";

const GROQ_BASE = "https://api.groq.com/openai/v1";

let client: OpenAI | null = null;

/** Groq exposes an OpenAI-compatible HTTP API; we use the official `openai` SDK against that base URL. */
export function getGroqClient(): OpenAI {
  if (!process.env.GROQ_API_KEY?.trim()) {
    throw new Error("GROQ_API_KEY is not configured on the server.");
  }
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.GROQ_API_KEY,
      baseURL: GROQ_BASE,
    });
  }
  return client;
}

export function chatModel(): string {
  return process.env.GROQ_CHAT_MODEL || "llama-3.1-8b-instant";
}

async function withRetry<T>(
  fn: () => Promise<T>,
  attempts = 3,
  baseMs = 400,
): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      const wait = baseMs * 2 ** i;
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw last;
}

export async function chatCompletion(params: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<{ text: string; usage: { prompt: number; completion: number } }> {
  const groq = getGroqClient();
  const res = await withRetry(() =>
    groq.chat.completions.create({
      model: chatModel(),
      messages: [
        { role: "system", content: params.system },
        { role: "user", content: params.user },
      ],
      max_tokens: params.maxTokens ?? 1200,
    }),
  );
  const text = res.choices[0]?.message?.content ?? "";
  return {
    text,
    usage: {
      prompt: res.usage?.prompt_tokens ?? 0,
      completion: res.usage?.completion_tokens ?? 0,
    },
  };
}

/** Rough cost in cents for dashboard (not billing-grade; Groq list prices vary by model). */
export function estimateCostCents(params: {
  promptTokens: number;
  completionTokens: number;
  embeddingCalls: number;
}): number {
  const inPer1kUsd = 0.00005;
  const outPer1kUsd = 0.00008;
  const embedPer1kUsd = 0.00001;
  const chatUsd =
    (params.promptTokens / 1000) * inPer1kUsd +
    (params.completionTokens / 1000) * outPer1kUsd;
  const embedUsd = params.embeddingCalls * embedPer1kUsd;
  return Math.round((chatUsd + embedUsd) * 100);
}
