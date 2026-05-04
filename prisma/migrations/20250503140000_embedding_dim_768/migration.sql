-- 768-dim vectors for RAG (OpenAI text-embedding-3-* with dimensions=768, or Groq embed model).
-- Upgrades older installs that used vector(1536). Re-embed documents after migrating (re-upload or re-process).
ALTER TABLE "DocumentChunk" DROP COLUMN IF EXISTS embedding;
ALTER TABLE "DocumentChunk" ADD COLUMN embedding vector(768);
