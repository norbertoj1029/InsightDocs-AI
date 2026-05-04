# InsightDocs AI — Project guide

This document explains what the app does, the ideas behind it, and how the code and infrastructure fit together. Read it once for the big picture; use the tables as a reference when you open specific files.

---

## 1. What you are building

**InsightDocs AI** is a web app where users:

1. **Register / log in** with email and password.
2. **Upload** PDF, DOCX, or TXT files (stored on disk; metadata in PostgreSQL).
3. Wait while each file is **parsed**, split into **chunks**, and each chunk is turned into a **vector embedding** stored in the database (pgvector).
4. **Ask questions** in chat. The app finds the most relevant chunks, sends them to an LLM as context, and returns an answer that should stay **grounded in those chunks**, with **citations**.
5. Use **one-click actions** (summarize, action items, risks, email reply, compare two docs) via a separate API that feeds **full document text** into the model (same **Groq** stack as chat, different prompt path than RAG retrieval).

The marketing angle on the home page: *private RAG* over contracts, policies, and reports—meaning answers are driven by **your** uploaded content, not the model’s training memory alone.

---

## 2. Glossary (terms that keep appearing)

| Term | Meaning |
|------|--------|
| **RAG** (Retrieval-Augmented Generation) | For a question: (1) **retrieve** relevant text snippets from your data, (2) **augment** the LLM prompt with those snippets, (3) **generate** the answer. Reduces hallucination about *your* files. |
| **Embedding** | A list of numbers (here **768** dims) representing the *meaning* of a piece of text. Similar texts get similar vectors. |
| **Chunk** | A slice of document text (here: sized by **tokens**, with overlap) stored as one row in `DocumentChunk`. |
| **Vector search / similarity** | Compare the question’s embedding to every chunk’s embedding; take the closest ones (pgvector operator `<=>` in SQL). |
| **pgvector** | PostgreSQL extension that stores vectors and runs fast similarity queries. |
| **Worker** | A long-running process that polls for `QUEUED` documents and runs the same processing pipeline as the app can run inline. |

---

## 3. High-level architecture

These diagrams are plain text (ASCII). Read from **top to bottom**; `│` and `▼` mean “then / talks to.” No Mermaid required.

### Big picture — who sits where

Your browser only ever reaches **your Next.js app**. The app and the worker reach the database, files, and **Groq** for embeddings and chat.

```
                         YOU
                    (web browser)
                          │
                          │  you only open this site
                          ▼
               ┌─────────────────────┐
               │   Next.js app       │  ← one program: pages + /api/*
               │   login, dashboard…   │
               └──────────┬──────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
        ▼                 ▼                 ▼
 ┌─────────────┐  ┌─────────────┐  ┌───────────────────┐
 │ PostgreSQL  │  │ Disk folder │  │ Groq (internet)   │
 │ + pgvector  │  │ (uploads)   │  │ embeddings + chat │
 └──────▲──────┘  └──────▲──────┘  └─────────▲─────────┘
        │                │                  │
        │    same machine / same Docker      │
        │                │                  │
        └────────────────┼──────────────────┘
                         │
               ┌─────────┴─────────┐
               │ document-worker   │  ← second program: no website,
               │ (background loop) │    only “process queued files”
               └───────────────────┘
```

- **Next.js** — What you start with `npm run dev` or the `app` Docker container: HTML for humans + JSON APIs.
- **Worker** — A separate process (`npm run worker` or the `worker` container). It shares **the same** database and upload folder as the app so it can finish uploads the browser started.

### Path A — you upload a file

```
1. Browser  →  POST /api/documents/upload  →  Next.js
2. Next.js  →  save bytes to Disk, write row in Postgres (status QUEUED)
3a. If worker mode ON:  Worker (later) reads Disk, chunks text, embeds, saves vectors in Postgres → READY
3b. If worker mode OFF:  Next.js runs the same step after the response (after()), still no browser involved
```

### Path B — you ask a question (RAG chat)

```
1. Browser  →  POST /api/chat  →  Next.js
2. Next.js  →  Postgres (load your chunks / vectors)
3. Next.js  →  **Embeddings** (OpenAI or Groq — see `embeddings.ts`)
4. Next.js  →  Postgres vector search (find closest chunks)
5. Next.js  →  Groq **chat** (answer using only those chunks)
6. Next.js  →  Postgres (save messages), Browser gets JSON answer
```

The **worker never runs step 5**; it never calls the chat model.

### Groq: two doors (quick reference)

| Program | Calls embeddings? | Calls chat? |
|---------|---------------------|-------------|
| **Next.js** (`/api/chat`, `/api/actions`, …) | Yes (via `embeddings.ts`) | Yes (Groq) |
| **document-worker** | Yes (same embedding path) | **No** |

- **PostgreSQL + pgvector** — Users, documents, chunk text, vectors, chat history, usage, audits.
- **Disk** — Raw uploads (`storageKey` paths). In Docker, **app** and **worker** must share the same volume.

---

## 4. Repository map (where to look)

| Area | Paths |
|------|--------|
| Pages (UI) | `src/app/` — `page.tsx` (home), `login/`, `register/`, `dashboard/` |
| Auth | `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts` |
| Documents API | `src/app/api/documents/route.ts`, `src/app/api/documents/upload/route.ts` |
| Chat (RAG) | `src/app/api/chat/route.ts`, `src/lib/rag.ts` |
| Preset actions | `src/app/api/actions/route.ts`, `src/lib/action-presets.ts`, `src/lib/document-context.ts` |
| Processing pipeline | `src/lib/process-document.ts`, `src/lib/parse-document.ts`, `src/lib/chunking.ts` |
| Groq (chat) | `src/lib/groq-client.ts` (uses the `openai` npm package against Groq’s compatible base URL) |
| Embeddings (RAG) | `src/lib/embeddings.ts` — OpenAI when `OPENAI_API_KEY` is set, else Groq (`EMBEDDING_PROVIDER` overrides) |
| DB client & schema | `src/lib/prisma.ts`, `prisma/schema.prisma`, `prisma/migrations/` |
| Background worker | `scripts/document-worker.ts` |
| Docker | `Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh` |
| Env template | `env.example` |

---

## 5. Document lifecycle (upload → READY)

Statuses (`DocumentStatus` in Prisma): `UPLOADED` → `QUEUED` → `PROCESSING` → `READY` or `FAILED`.

1. **Upload** (`POST` `/api/documents/upload`): Validates auth, rate limit, MIME type (PDF / DOCX / TXT), and size (`MAX_UPLOAD_MB`). Creates a `Document`, saves the file to disk (`saveUploadBuffer` → `storageKey`), sets status **`QUEUED`**.
2. **Who runs processing?**
   - If `USE_DOCUMENT_WORKER` is **`"true"`**: only the **worker** picks up `QUEUED` docs. The upload handler does **not** call `after(processDocumentById)`. (Docker Compose defaults to **`false`** so `docker compose up` works without a worker.)
   - If **`"false"`**: Next.js uses **`after()`** to call `processDocumentById` after the response returns (same Node process as the app).
3. **`processDocumentById`** (`src/lib/process-document.ts`):
   - Claims the job: only updates to `PROCESSING` if status was `UPLOADED`, `QUEUED`, or `FAILED`.
   - Reads file → **`parseDocumentBuffer`**: PDF (`pdf-parse`), DOCX (`mammoth`), or UTF-8 TXT.
   - **`chunkByTokens`**: splits into overlapping token windows (default ~800 tokens, ~150 overlap) using **tiktoken** `cl100k_base`.
   - Replaces `DocumentChunk` rows for that document; optional **`pageHint`** for PDFs is estimated from chunk index vs total chunks and `pageCount`.
   - **`embedTexts`** (`embeddings.ts`): OpenAI `text-embedding-3-small` with **768** dims if `OPENAI_API_KEY` is set; otherwise Groq (`GROQ_EMBEDDING_MODEL`). Vectors must match **`vector(768)`**.
   - Writes vectors with raw SQL (`UPDATE ... embedding = ...::vector`) because Prisma does not natively map `vector`.
   - Sets document **`READY`** and `docType` / `pageCount`, or **`FAILED`** with `errorMessage`.

The worker (`scripts/document-worker.ts`) loops: find oldest `QUEUED` document, `processDocumentById`, sleep if empty, catch errors and retry after a delay.

---

## 6. Chat lifecycle (RAG)

Endpoint: **`POST` `/api/chat/route.ts`**.

1. Auth + **chat rate limit** (`RATE_LIMIT_CHAT_PER_MIN`).
2. Optional `documentIds`: server checks every id belongs to the user.
3. Requires at least one **`READY`** document (in the selected set, or globally for the user).
4. **`answerWithRag`** (`src/lib/rag.ts`):
   - Embed the **user question** (one embedding call).
   - **`searchSimilarChunks`**: SQL over `DocumentChunk` joined to `Document`, filter `userId`, `embedding IS NOT NULL`, order by vector distance, `LIMIT` (e.g. 10).
   - Build **context blocks** numbered `[#1 | filename | chunk n]`, etc.
   - **System prompt** instructs the model to use **only** that context and to cite with `[1]`, `[2]`, …
   - **`chatCompletion`** returns the answer; top hits become **`sources`** (filename, document id, chunk index, page hint, excerpt).
5. Persist **`ChatSession`** / **`ChatMessage`**, **`UsageRecord`**, **`AuditLog`**; return JSON with `answer`, `sources`, `sessionId`.

**Important:** RAG chat does **not** send the entire document every time—it sends only the **retrieved chunks**. That keeps prompts smaller and focuses the model on likely-relevant passages.

---

## 7. Preset actions (dashboard buttons)

Endpoint: **`POST` `/api/actions`** (`src/app/api/actions/route.ts`).

Kinds include: `summarize`, `action_items`, `risks`, `email_reply`, and `compare` (two document ids).

These use **`loadDocumentTextsForUser`** to pull **full text** of ready documents the user owns, then a **preset system/user prompt** from `getActionPreset`. Same rate limit bucket as chat (`checkChatRate`). They are **not** the same as vector retrieval; they are “read these whole docs and do X.”

---

## 8. Auth and security notes

- **NextAuth v5** with **Credentials** provider: email + password, **bcrypt** hash in `User.passwordHash`, **JWT** sessions (`session: { strategy: "jwt" }`).
- **Multi-tenant isolation**: document and chunk queries always tie to `userId` from the session. Do not expose other users’ ids to the client without checks (the APIs already verify ownership where ids are passed in).
- **AuditLog** / **UsageRecord**: operational visibility and rough cost tracking (`estimatedUsdCents` etc.).

---

## 9. Environment variables

See **`env.example`** for copy-paste defaults. Highlights:

| Variable | Role |
|----------|------|
| `DATABASE_URL` | Postgres connection string |
| `AUTH_SECRET` | NextAuth signing secret (required in production) |
| `NEXTAUTH_URL` | Public URL of the app (e.g. `http://localhost:3000`) |
| `GROQ_API_KEY` | **Required** for chat (`https://api.groq.com/openai/v1`) |
| `GROQ_CHAT_MODEL` | Default: `llama-3.1-8b-instant` |
| `OPENAI_API_KEY` | **Optional**; if set, **embeddings** use OpenAI (`text-embedding-3-small` + 768 dims) — avoids Groq `404` on embed models |
| `OPENAI_EMBEDDING_MODEL` | Default: `text-embedding-3-small` (must support `dimensions: 768` or output 768) |
| `GROQ_EMBEDDING_MODEL` | Used only when `OPENAI_API_KEY` is unset. Default: `nomic-embed-text-v1.5` |
| `EMBEDDING_PROVIDER` | `auto` (default): OpenAI if key set, else Groq. `openai` \| `groq` to force |
| `UPLOAD_DIR` | Filesystem root for uploads |
| `MAX_UPLOAD_MB` | Upload size cap |
| `RATE_LIMIT_*` | Per-user throttles |
| `USE_DOCUMENT_WORKER` | `"true"` = only worker processes queue; `"false"` = `after()` in Next |

**Embedding model and DB:** `DocumentChunk.embedding` is **`vector(768)`**. OpenAI path uses `dimensions: 768` on `text-embedding-3-*`. Changing dimension requires a migration and full re-embed.

---

## 10. Docker Compose (three services)

| Service | Role |
|---------|------|
| `db` | `pgvector/pgvector:pg16` — Postgres with extension; port `5432` |
| `app` | Builds image, runs Next.js on `3000`, runs migrations on start; `USE_DOCUMENT_WORKER` defaults to **`false`** in compose |
| `worker` | Optional (`--profile worker`). Same image; `tsx scripts/document-worker.ts`; set `USE_DOCUMENT_WORKER=true` on `app` when using this. |

Shared **volume** for uploads: both `app` and `worker` must see the same files.

---

## 11. Common “why does this happen?” questions

| Symptom | Likely cause |
|---------|----------------|
| Chat says no processed documents | Nothing in `READY` yet; worker down, missing keys, quota/rate limits, or processing failed (`FAILED` + `errorMessage`). |
| Upload stuck in `QUEUED` | With `USE_DOCUMENT_WORKER=true`, the worker must be running. With `false` (Compose default), check app logs for `after()` errors; confirm `GROQ_API_KEY`. |
| 503 on chat about AI not configured | `GROQ_API_KEY` unset in the environment that runs the **app** route. |
| Groq embedding `404` / `model_not_found` | Set **`OPENAI_API_KEY`** for embeddings only (chat stays Groq), or try another `GROQ_EMBEDDING_MODEL` if Groq lists one for your account. |
| Vector / dimension errors | Embedding output size ≠ **768**; use `text-embedding-3-small` + OpenAI `dimensions`, or a Groq model that returns 768. |

---

## 12. NPM scripts (from `package.json`)

| Script | Purpose |
|--------|---------|
| `npm run dev` | Next.js dev server |
| `npm run build` | `prisma generate` + `next build` |
| `npm run start` | Production server on `0.0.0.0:3000` |
| `npm run worker` | Run `scripts/document-worker.ts` locally (needs DB + uploads + key) |
| `npm run db:migrate` / `db:push` / `db:studio` | Prisma workflows |

---

When you change behavior, update this guide **or** add a short comment at the top of the file you edited—future you will thank you. For deeper Prisma/SQL details, read `prisma/schema.prisma` and the init migration under `prisma/migrations/`.
