import { getEncoding } from "tiktoken";

const enc = getEncoding("cl100k_base");

export type TextChunk = {
  index: number;
  text: string;
  tokenStart: number;
  tokenEnd: number;
};

const TARGET = 800;
const OVERLAP = 150;

export function chunkByTokens(
  fullText: string,
  options?: { targetTokens?: number; overlapTokens?: number },
): TextChunk[] {
  const target = options?.targetTokens ?? TARGET;
  const overlap = options?.overlapTokens ?? OVERLAP;
  const normalized = fullText.replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];

  const tokens = enc.encode(normalized);
  if (tokens.length === 0) return [];

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < tokens.length) {
    const end = Math.min(start + target, tokens.length);
    const slice = tokens.slice(start, end);
    const decoded = enc.decode(slice);
    const text =
      typeof decoded === "string"
        ? decoded
        : new TextDecoder().decode(decoded as Uint8Array);
    chunks.push({
      index,
      text: text.trim(),
      tokenStart: start,
      tokenEnd: end,
    });
    index += 1;
    if (end >= tokens.length) break;
    start = Math.max(0, end - overlap);
  }

  return chunks;
}

export function estimatePageHint(params: {
  chunkIndex: number;
  totalChunks: number;
  pageCount: number | null;
}): number | null {
  if (!params.pageCount || params.pageCount < 1 || params.totalChunks < 1)
    return null;
  const frac = (params.chunkIndex + 1) / params.totalChunks;
  return Math.min(
    params.pageCount,
    Math.max(1, Math.round(frac * params.pageCount)),
  );
}
