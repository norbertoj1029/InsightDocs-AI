import { prisma } from "@/lib/prisma";
import {
  chatCompletion,
  embedTexts,
  estimateCostCents,
} from "@/lib/openai-client";

export type SourceCitation = {
  filename: string;
  documentId: string;
  chunkIndex: number;
  pageHint: number | null;
  excerpt: string;
};

function vectorLiteral(vec: number[]): string {
  return `[${vec.map((n) => (Number.isFinite(n) ? n : 0)).join(",")}]`;
}

export async function searchSimilarChunks(params: {
  userId: string;
  queryEmbedding: number[];
  documentIds?: string[];
  limit?: number;
}): Promise<
  {
    id: string;
    text: string;
    pageHint: number | null;
    filename: string;
    documentId: string;
    index: number;
    distance: number;
  }[]
> {
  const limit = params.limit ?? 8;
  const vec = vectorLiteral(params.queryEmbedding);
  const docIds = params.documentIds?.filter(Boolean) ?? [];

  if (docIds.length > 0) {
    return prisma.$queryRawUnsafe(
      `
      SELECT dc.id, dc.text, dc."pageHint", d.filename, dc."documentId", dc."index",
        (dc.embedding <=> $1::vector)::float AS distance
      FROM "DocumentChunk" dc
      INNER JOIN "Document" d ON d.id = dc."documentId"
      WHERE d."userId" = $2
        AND dc.embedding IS NOT NULL
        AND d.id = ANY($3::text[])
      ORDER BY dc.embedding <=> $1::vector
      LIMIT $4
      `,
      vec,
      params.userId,
      docIds,
      limit,
    );
  }

  return prisma.$queryRawUnsafe(
    `
    SELECT dc.id, dc.text, dc."pageHint", d.filename, dc."documentId", dc."index",
      (dc.embedding <=> $1::vector)::float AS distance
    FROM "DocumentChunk" dc
    INNER JOIN "Document" d ON d.id = dc."documentId"
    WHERE d."userId" = $2
      AND dc.embedding IS NOT NULL
    ORDER BY dc.embedding <=> $1::vector
    LIMIT $3
    `,
    vec,
    params.userId,
    limit,
  );
}

export async function answerWithRag(params: {
  userId: string;
  question: string;
  documentIds?: string[];
}): Promise<{
  answer: string;
  sources: SourceCitation[];
  usage: {
    promptTokens: number;
    completionTokens: number;
    embeddingCalls: number;
    estimatedUsdCents: number;
  };
}> {
  const [qEmb] = await embedTexts([params.question]);
  const hits = await searchSimilarChunks({
    userId: params.userId,
    queryEmbedding: qEmb,
    documentIds: params.documentIds,
    limit: 10,
  });

  const contextBlocks = hits.map((h, i) => {
    const page =
      h.pageHint != null ? ` (estimated page ${h.pageHint})` : "";
    return `[#${i + 1} | ${h.filename}${page} | chunk ${h.index}]\n${h.text}`;
  });

  const system = `You are an assistant for business documents. Answer using ONLY the provided excerpts. If the answer is not in the excerpts, say you cannot find it in the uploaded documents.
When you use facts, append inline markers like [1], [2] matching the bracket numbers from the context blocks. Keep answers concise and professional.`;

  const user = `Question:\n${params.question}\n\nContext:\n${contextBlocks.join("\n\n---\n\n")}`;

  const { text, usage } = await chatCompletion({
    system,
    user,
    maxTokens: 1500,
  });

  const sources: SourceCitation[] = hits.slice(0, 8).map((h) => ({
    filename: h.filename,
    documentId: h.documentId,
    chunkIndex: h.index,
    pageHint: h.pageHint,
    excerpt: h.text.slice(0, 280) + (h.text.length > 280 ? "…" : ""),
  }));

  return {
    answer: text,
    sources,
    usage: {
      promptTokens: usage.prompt,
      completionTokens: usage.completion,
      embeddingCalls: 1,
      estimatedUsdCents: estimateCostCents({
        promptTokens: usage.prompt,
        completionTokens: usage.completion,
        embeddingCalls: 1,
      }),
    },
  };
}
