import { readFile } from "fs/promises";
import { prisma } from "@/lib/prisma";
import { storagePathForKey } from "@/lib/storage";
import { parseDocumentBuffer } from "@/lib/parse-document";
import { chunkByTokens, estimatePageHint } from "@/lib/chunking";
import { embedTexts } from "@/lib/embeddings";

function vectorLiteral(vec: number[]): string {
  return `[${vec.map((n) => (Number.isFinite(n) ? n : 0)).join(",")}]`;
}

export async function processDocumentById(documentId: string): Promise<void> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
  });
  if (!doc) return;

  const claim = await prisma.document.updateMany({
    where: {
      id: documentId,
      status: { in: ["UPLOADED", "QUEUED", "FAILED"] },
    },
    data: { status: "PROCESSING", errorMessage: null },
  });

  if (claim.count === 0) return;

  try {
    const absPath = storagePathForKey(doc.storageKey);
    const buffer = await readFile(absPath);
    const parsed = await parseDocumentBuffer({
      buffer,
      filename: doc.filename,
      mimeType: doc.mimeType,
    });

    if (!parsed.text || parsed.text.length < 10) {
      throw new Error("Extracted text is empty or too short.");
    }

    const chunks = chunkByTokens(parsed.text);
    if (chunks.length === 0) {
      throw new Error("No chunks produced from document.");
    }

    await prisma.documentChunk.deleteMany({ where: { documentId } });

    const created = await prisma.$transaction(
      chunks.map((c) =>
        prisma.documentChunk.create({
          data: {
            documentId,
            index: c.index,
            text: c.text,
            tokenStart: c.tokenStart,
            tokenEnd: c.tokenEnd,
            pageHint: estimatePageHint({
              chunkIndex: c.index,
              totalChunks: chunks.length,
              pageCount: parsed.pageCount,
            }),
          },
        }),
      ),
    );

    const embeddings = await embedTexts(chunks.map((c) => c.text));

    for (let i = 0; i < created.length; i++) {
      const id = created[i].id;
      const vec = vectorLiteral(embeddings[i] ?? []);
      await prisma.$executeRawUnsafe(
        `UPDATE "DocumentChunk" SET embedding = $1::vector WHERE id = $2`,
        vec,
        id,
      );
    }

    await prisma.document.update({
      where: { id: documentId },
      data: {
        status: "READY",
        docType: parsed.docType,
        pageCount: parsed.pageCount,
      },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown processing error";
    await prisma.document.update({
      where: { id: documentId },
      data: { status: "FAILED", errorMessage: message },
    });
    throw e;
  }
}
