import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const documents = await prisma.document.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      filename: true,
      mimeType: true,
      sizeBytes: true,
      status: true,
      docType: true,
      errorMessage: true,
      pageCount: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { chunks: true } },
    },
  });

  return NextResponse.json({ documents });
}
