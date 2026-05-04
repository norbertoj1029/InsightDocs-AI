import { after } from "next/server";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { saveUploadBuffer } from "@/lib/storage";
import { processDocumentById } from "@/lib/process-document";
import { checkUploadRate } from "@/lib/rate-limit";
import { writeAuditLog } from "@/lib/audit";

const ALLOWED = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

function maxBytes(): number {
  const mb = Number(process.env.MAX_UPLOAD_MB) || 25;
  return mb * 1024 * 1024;
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkUploadRate(session.user.id);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Upload rate limit exceeded", retryAfterSec: rl.retryAfterSec },
      { status: 429 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }

  if (file.size > maxBytes()) {
    return NextResponse.json({ error: "File too large" }, { status: 413 });
  }

  const mimeType = file.type || "application/octet-stream";
  if (!ALLOWED.has(mimeType)) {
    return NextResponse.json(
      { error: "Only PDF, DOCX, and TXT are allowed." },
      { status: 415 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const doc = await prisma.document.create({
    data: {
      userId: session.user.id,
      filename: file.name || "upload",
      mimeType,
      sizeBytes: buffer.length,
      storageKey: "pending",
      status: "UPLOADED",
    },
  });

  const storageKey = await saveUploadBuffer({
    userId: session.user.id,
    documentId: doc.id,
    originalFilename: file.name || "upload",
    buffer,
  });

  await prisma.document.update({
    where: { id: doc.id },
    data: { storageKey, status: "QUEUED" },
  });

  const hdr = req.headers;
  await writeAuditLog({
    userId: session.user.id,
    action: "document.upload",
    resource: "Document",
    resourceId: doc.id,
    ip: hdr.get("x-forwarded-for")?.split(",")[0]?.trim() ?? hdr.get("x-real-ip"),
    userAgent: hdr.get("user-agent"),
    meta: { filename: file.name, sizeBytes: buffer.length },
  });

  const useWorker = process.env.USE_DOCUMENT_WORKER === "true";
  if (!useWorker) {
    after(async () => {
      try {
        await processDocumentById(doc.id);
      } catch (e) {
        console.error("Document processing failed", doc.id, e);
      }
    });
  }

  return NextResponse.json({
    documentId: doc.id,
    status: "QUEUED",
    processing: useWorker ? "worker" : "inline",
  });
}
