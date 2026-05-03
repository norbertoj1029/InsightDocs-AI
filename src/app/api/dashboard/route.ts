import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;
  const isAdmin = session.user.role === "ADMIN";

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [documents, usageAgg, chatSessions, auditLogs] = await Promise.all([
    prisma.document.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 50,
      select: {
        id: true,
        filename: true,
        status: true,
        docType: true,
        sizeBytes: true,
        createdAt: true,
        updatedAt: true,
        pageCount: true,
      },
    }),
    prisma.usageRecord.aggregate({
      where: { userId, createdAt: { gte: since } },
      _sum: {
        tokensIn: true,
        tokensOut: true,
        embeddingCalls: true,
        estimatedUsdCents: true,
      },
    }),
    prisma.chatSession.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 15,
      select: {
        id: true,
        title: true,
        updatedAt: true,
        _count: { select: { messages: true } },
      },
    }),
    isAdmin
      ? prisma.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 40,
          select: {
            id: true,
            action: true,
            resource: true,
            resourceId: true,
            userId: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    documents,
    usage30d: {
      tokensIn: usageAgg._sum.tokensIn ?? 0,
      tokensOut: usageAgg._sum.tokensOut ?? 0,
      embeddingCalls: usageAgg._sum.embeddingCalls ?? 0,
      estimatedUsdCents: usageAgg._sum.estimatedUsdCents ?? 0,
    },
    chatSessions,
    auditLogs: isAdmin ? auditLogs : null,
    isAdmin,
  });
}
