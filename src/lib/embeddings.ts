import OpenAI from "openai";
import { getGroqClient } from "@/lib/groq-client";

let openaiEmbedClient: OpenAI | null = null;

function getOpenAIEmbedClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  if (!openaiEmbedClient) {
    openaiEmbedClient = new OpenAI({ apiKey: key });
  }
  return openaiEmbedClient;
}

/** `openai` when OPENAI_API_KEY is set (recommended for RAG — Groq often has no public embed model). Else `groq`. */
export function embeddingBackend(): "openai" | "groq" {
  return getOpenAIEmbedClient() ? "openai" : "groq";
}

function groqEmbeddingModel(): string {
  return process.env.GROQ_EMBEDDING_MODEL || "nomic-embed-text-v1.5";
}

function openaiEmbeddingModel(): string {
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

function assert768(vec: number[], label: string) {
  if (vec.length !== 768) {
    throw new Error(
      `Expected 768-dim embeddings for this database; got ${vec.length} from ${label}.`,
    );
  }
}

async function embedWithOpenAI(texts: string[]): Promise<number[][]> {
  const client = getOpenAIEmbedClient();
  if (!client) {
    throw new Error(
      "EMBEDDING_PROVIDER=openai requires OPENAI_API_KEY, or set OPENAI_API_KEY for auto mode when Groq embeddings are unavailable.",
    );
  }
  const model = openaiEmbeddingModel();
  const out: number[][] = [];
  const batchSize = 16;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const res = await withRetry(() =>
      client.embeddings.create({
        model,
        input: batch,
        ...(model.includes("text-embedding-3")
          ? { dimensions: 768 as const }
          : {}),
      }),
    );
    for (const d of res.data.sort((a, b) => a.index - b.index)) {
      const vec = d.embedding as number[];
      assert768(vec, `OpenAI ${model}`);
      out.push(vec);
    }
  }
  return out;
}

async function embedWithGroq(texts: string[]): Promise<number[][]> {
  const groq = getGroqClient();
  const model = groqEmbeddingModel();
  const out: number[][] = [];
  const batchSize = 16;
  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const res = await withRetry(() =>
      groq.embeddings.create({ model, input: batch }),
    );
    for (const d of res.data.sort((a, b) => a.index - b.index)) {
      const vec = d.embedding as number[];
      assert768(vec, `Groq ${model}`);
      out.push(vec);
    }
  }
  return out;
}

/**
 * Vector DB expects 768 dimensions.
 * - If `OPENAI_API_KEY` is set → OpenAI embeddings (`text-embedding-3-small` + dimensions 768 by default).
 * - Otherwise → Groq (`GROQ_EMBEDDING_MODEL`, default `nomic-embed-text-v1.5`).
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const force = process.env.EMBEDDING_PROVIDER?.toLowerCase().trim();
  if (force === "groq") {
    return embedWithGroq(texts);
  }
  if (force === "openai") {
    return embedWithOpenAI(texts);
  }
  if (getOpenAIEmbedClient()) {
    return embedWithOpenAI(texts);
  }
  return embedWithGroq(texts);
}
