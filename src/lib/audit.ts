import { prisma } from "@/lib/prisma";

export async function writeAuditLog(params: {
  userId?: string | null;
  action: string;
  resource?: string;
  resourceId?: string;
  ip?: string | null;
  userAgent?: string | null;
  meta?: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId ?? undefined,
        action: params.action,
        resource: params.resource,
        resourceId: params.resourceId,
        ip: params.ip ?? undefined,
        userAgent: params.userAgent ?? undefined,
        meta: params.meta as object | undefined,
      },
    });
  } catch {
    /* never block main flow on audit failure */
  }
}
