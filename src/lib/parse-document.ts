import mammoth from "mammoth";
import type { DocumentType } from "@prisma/client";

export type ParsedDocument = {
  text: string;
  docType: DocumentType;
  pageCount: number | null;
};

function detectType(
  filename: string,
  mimeType: string,
): "PDF" | "DOCX" | "TXT" | "UNKNOWN" {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".pdf") || mimeType.includes("pdf")) return "PDF";
  if (lower.endsWith(".docx") || mimeType.includes("wordprocessingml"))
    return "DOCX";
  if (lower.endsWith(".txt") || mimeType.startsWith("text/plain")) return "TXT";
  return "UNKNOWN";
}

export async function parseDocumentBuffer(params: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}): Promise<ParsedDocument> {
  const kind = detectType(params.filename, params.mimeType);

  if (kind === "TXT") {
    return {
      text: params.buffer.toString("utf8"),
      docType: "TXT",
      pageCount: null,
    };
  }

  if (kind === "DOCX") {
    const result = await mammoth.extractRawText({ buffer: params.buffer });
    return {
      text: result.value.trim(),
      docType: "DOCX",
      pageCount: null,
    };
  }

  if (kind === "PDF") {
    const pdfParse = (await import("pdf-parse")).default;
    const data = await pdfParse(params.buffer);
    return {
      text: (data.text || "").trim(),
      docType: "PDF",
      pageCount: typeof data.numpages === "number" ? data.numpages : null,
    };
  }

  throw new Error("Unsupported file type. Use PDF, DOCX, or TXT.");
}
