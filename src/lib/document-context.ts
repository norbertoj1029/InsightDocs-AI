import { prisma } from "@/lib/prisma";

export async function loadDocumentTextsForUser(params: {
  userId: string;
  documentIds: string[];
  maxChars?: number;
}): Promise<{ filename: string; documentId: string; body: string }[]> {
  const maxChars = params.maxChars ?? 100_000;
  const out: { filename: string; documentId: string; body: string }[] = [];

  for (const documentId of params.documentIds) {
    const doc = await prisma.document.findFirst({
      where: { id: documentId, userId: params.userId },
      select: { filename: true, id: true },
    });
    if (!doc) continue;

    const chunks = await prisma.documentChunk.findMany({
      where: { documentId },
      orderBy: { index: "asc" },
      select: { text: true },
    });

    let body = chunks.map((c) => c.text).join("\n\n");
    if (body.length > maxChars) {
      body =
        body.slice(0, maxChars / 2) +
        "\n\n[… middle truncated …]\n\n" +
        body.slice(-maxChars / 2);
    }

    out.push({ filename: doc.filename, documentId: doc.id, body });
  }

  return out;
}
