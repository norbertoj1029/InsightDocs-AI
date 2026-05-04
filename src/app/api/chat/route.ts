import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { answerWithRag } from "@/lib/rag";
import { chatModel } from "@/lib/groq-client";
import { checkChatRate } from "@/lib/rate-limit";
import { recordUsage } from "@/lib/usage";
import { writeAuditLog } from "@/lib/audit";

const bodySchema = z.object({
  question: z.string().min(1).max(8000),
  documentIds: z.array(z.string()).max(20).optional(),
  sessionId: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = checkChatRate(session.user.id);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Chat rate limit exceeded", retryAfterSec: rl.retryAfterSec },
      { status: 429 },
    );
  }

  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const { question, documentIds } = parsed.data;

  if (documentIds?.length) {
    const owned = await prisma.document.count({
      where: { userId: session.user.id, id: { in: documentIds } },
    });
    if (owned !== documentIds.length) {
      return NextResponse.json(
        { error: "One or more documents were not found." },
        { status: 403 },
      );
    }
  }

  const readyCount = await prisma.document.count({
    where: {
      userId: session.user.id,
      status: "READY",
      ...(documentIds?.length ? { id: { in: documentIds } } : {}),
    },
  });

  if (readyCount === 0) {
    return NextResponse.json(
      { error: "No processed documents available yet. Wait for processing to finish." },
      { status: 400 },
    );
  }

  try {
    const result = await answerWithRag({
      userId: session.user.id,
      question,
      documentIds,
    });

    let chatSessionId = parsed.data.sessionId;
    if (chatSessionId) {
      const cs = await prisma.chatSession.findFirst({
        where: { id: chatSessionId, userId: session.user.id },
      });
      if (!cs) chatSessionId = undefined;
    }

    if (!chatSessionId) {
      const cs = await prisma.chatSession.create({
        data: {
          userId: session.user.id,
          title: question.slice(0, 80),
        },
      });
      chatSessionId = cs.id;
    }

    await prisma.chatMessage.create({
      data: {
        sessionId: chatSessionId,
        role: "user",
        content: question,
      },
    });

    await prisma.chatMessage.create({
      data: {
        sessionId: chatSessionId,
        role: "assistant",
        content: result.answer,
        sources: result.sources as object,
        tokensIn: result.usage.promptTokens,
        tokensOut: result.usage.completionTokens,
        model: chatModel(),
      },
    });

    await prisma.chatSession.update({
      where: { id: chatSessionId },
      data: { updatedAt: new Date() },
    });

    await recordUsage({
      userId: session.user.id,
      kind: "chat.rag",
      model: chatModel(),
      tokensIn: result.usage.promptTokens,
      tokensOut: result.usage.completionTokens,
      embeddingCalls: result.usage.embeddingCalls,
      estimatedUsdCents: result.usage.estimatedUsdCents,
    });

    const hdr = req.headers;
    await writeAuditLog({
      userId: session.user.id,
      action: "chat.message",
      resource: "ChatSession",
      resourceId: chatSessionId,
      ip: hdr.get("x-forwarded-for")?.split(",")[0]?.trim() ?? hdr.get("x-real-ip"),
      userAgent: hdr.get("user-agent"),
    });

    return NextResponse.json({
      answer: result.answer,
      sources: result.sources,
      sessionId: chatSessionId,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Chat failed";
    if (message.includes("GROQ_API_KEY") || message.includes("not configured")) {
      return NextResponse.json(
        { error: "AI provider is not configured on the server." },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
