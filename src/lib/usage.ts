import { prisma } from "@/lib/prisma";

export async function recordUsage(params: {
  userId: string;
  kind: string;
  model?: string | null;
  tokensIn?: number;
  tokensOut?: number;
  embeddingCalls?: number;
  estimatedUsdCents?: number;
  meta?: Record<string, unknown>;
}) {
  await prisma.usageRecord.create({
    data: {
      userId: params.userId,
      kind: params.kind,
      model: params.model,
      tokensIn: params.tokensIn ?? 0,
      tokensOut: params.tokensOut ?? 0,
      embeddingCalls: params.embeddingCalls ?? 0,
      estimatedUsdCents: params.estimatedUsdCents ?? 0,
      meta: params.meta as object | undefined,
    },
  });
}
