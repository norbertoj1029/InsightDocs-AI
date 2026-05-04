/**
 * Polls for documents in QUEUED status and processes them.
 * Run on Railway/Render alongside or instead of Next.js `after()` processing:
 *   USE_DOCUMENT_WORKER=true npm run worker
 */
import { prisma } from "../src/lib/prisma";
import { processDocumentById } from "../src/lib/process-document";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function loop() {
  for (;;) {
    try {
      const next = await prisma.document.findFirst({
        where: { status: "QUEUED" },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });

      if (!next) {
        await sleep(2500);
        continue;
      }

      await processDocumentById(next.id);
    } catch (e) {
      console.error("[worker]", e);
      await sleep(3000);
    }
  }
}

void loop();
