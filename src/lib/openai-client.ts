import OpenAI from "openai";

let client: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  if (!client) {
    client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return client;
}

export function chatModel(): string {
  return process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini";
}

export function embeddingModel(): string {
  return process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";
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

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const openai = getOpenAI();
  const model = embeddingModel();
  const out: number[][] = [];
  const batchSize = 16;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const res = await withRetry(() =>
      openai.embeddings.create({ model, input: batch }),
    );
    for (const d of res.data.sort((a, b) => a.index - b.index)) {
      out.push(d.embedding);
    }
  }
  return out;
}

export async function chatCompletion(params: {
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<{ text: string; usage: { prompt: number; completion: number } }> {
  const openai = getOpenAI();
  const res = await withRetry(() =>
    openai.chat.completions.create({
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

/** Rough blended cost in cents for dashboard signals (not billing-grade). */
export function estimateCostCents(params: {
  promptTokens: number;
  completionTokens: number;
  embeddingCalls: number;
}): number {
  const inPer1kUsd = 0.00015;
  const outPer1kUsd = 0.0006;
  const embedPer1kUsd = 0.00002;
  const chatUsd =
    (params.promptTokens / 1000) * inPer1kUsd +
    (params.completionTokens / 1000) * outPer1kUsd;
  const embedUsd = params.embeddingCalls * embedPer1kUsd;
  return Math.round((chatUsd + embedUsd) * 100);
}
