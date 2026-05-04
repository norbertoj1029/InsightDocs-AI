import { mkdir, writeFile } from "fs/promises";
import { join } from "path";

const uploadRoot = () =>
  process.env.UPLOAD_DIR?.trim() || join(process.cwd(), "uploads");

export function storagePathForKey(storageKey: string): string {
  return join(uploadRoot(), storageKey);
}

export async function saveUploadBuffer(params: {
  userId: string;
  documentId: string;
  originalFilename: string;
  buffer: Buffer;
}): Promise<string> {
  const safe = params.originalFilename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const relative = join(params.userId, `${params.documentId}-${safe}`);
  const abs = storagePathForKey(relative);
  await mkdir(join(uploadRoot(), params.userId), { recursive: true });
  await writeFile(abs, params.buffer);
  return relative.replace(/\\/g, "/");
}
