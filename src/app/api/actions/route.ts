import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getActionPreset, type ActionPreset } from "@/lib/action-presets";
import { loadDocumentTextsForUser } from "@/lib/document-context";
import { chatCompletion, estimateCostCents } from "@/lib/openai-client";
import { checkChatRate } from "@/lib/rate-limit";
import { recordUsage } from "@/lib/usage";
import { writeAuditLog } from "@/lib/audit";

const schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.enum(["summarize", "action_items", "risks", "email_reply"]),
    documentId: z.string(),
  }),
  z.object({
    kind: z.literal("compare"),
    documentIdA: z.string(),
    documentIdB: z.string(),
  }),
]);

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkChatRate(session.user.id);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterSec: rl.retryAfterSec },
      { status: 429 },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const kind = parsed.data.kind as ActionPreset;
  const preset = getActionPreset(kind);

  const docIds =
    parsed.data.kind === "compare"
      ? [parsed.data.documentIdA, parsed.data.documentIdB]
      : [parsed.data.documentId];

  const ready = await prisma.document.findMany({
    where: {
      userId: session.user.id,
      id: { in: docIds },
      status: "READY",
    },
    select: { id: true },
  });

  if (ready.length !== docIds.length) {
    return NextResponse.json(
      { error: "Documents must exist, belong to you, and be fully processed." },
      { status: 400 },
    );
  }

  const parts = await loadDocumentTextsForUser({
    userId: session.user.id,
    documentIds: docIds,
  });

  const userContent =
    parsed.data.kind === "compare"
      ? `${preset.userSuffix}\n\n--- DOCUMENT A ---\n${parts[0]?.body ?? ""}\n\n--- DOCUMENT B ---\n${parts[1]?.body ?? ""}`
      : `${preset.userSuffix}\n\n--- DOCUMENT ---\n${parts[0]?.body ?? ""}`;

  try {
    const { text, usage } = await chatCompletion({
      system: preset.system,
      user: userContent,
      maxTokens: 2000,
    });

    await recordUsage({
      userId: session.user.id,
      kind: `action.${kind}`,
      model: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
      tokensIn: usage.prompt,
      tokensOut: usage.completion,
      estimatedUsdCents: estimateCostCents({
        promptTokens: usage.prompt,
        completionTokens: usage.completion,
        embeddingCalls: 0,
      }),
    });

    const hdr = req.headers;
    await writeAuditLog({
      userId: session.user.id,
      action: `action.${kind}`,
      resource: "Document",
      resourceId: docIds.join(","),
      ip: hdr.get("x-forwarded-for")?.split(",")[0]?.trim() ?? hdr.get("x-real-ip"),
      userAgent: hdr.get("user-agent"),
    });

    return NextResponse.json({
      result: text,
      documents: parts.map((p) => ({ id: p.documentId, filename: p.filename })),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Action failed";
    if (message.includes("OPENAI_API_KEY")) {
      return NextResponse.json(
        { error: "AI provider is not configured on the server." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
