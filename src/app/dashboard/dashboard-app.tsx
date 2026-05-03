"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  MessageSquare,
  Upload,
  FileWarning,
  RefreshCw,
  Sparkles,
  ListTodo,
  AlertTriangle,
  Mail,
  GitCompare,
} from "lucide-react";

type DocRow = {
  id: string;
  filename: string;
  status: string;
  docType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
  pageCount: number | null;
};

type Source = {
  filename: string;
  documentId: string;
  chunkIndex: number;
  pageHint: number | null;
  excerpt: string;
};

type DashboardPayload = {
  documents: DocRow[];
  usage30d: {
    tokensIn: number;
    tokensOut: number;
    embeddingCalls: number;
    estimatedUsdCents: number;
  };
  chatSessions: { id: string; title: string | null; updatedAt: string }[];
  auditLogs: {
    id: string;
    action: string;
    resource: string | null;
    resourceId: string | null;
    userId: string | null;
    createdAt: string;
  }[] | null;
  isAdmin: boolean;
};

export function DashboardApp() {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [question, setQuestion] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [actionResult, setActionResult] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [compareB, setCompareB] = useState<string>("");

  const refresh = useCallback(async () => {
    setLoadError(null);
    const res = await fetch("/api/dashboard");
    if (!res.ok) {
      setLoadError("Could not load dashboard.");
      return;
    }
    const j = (await res.json()) as DashboardPayload;
    setData(j);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const readyDocs = data?.documents.filter((d) => d.status === "READY") ?? [];

  useEffect(() => {
    if (!data) return;
    const ready = data.documents.filter((d) => d.status === "READY").map((d) => d.id);
    setSelectedIds((prev) => {
      if (prev.length > 0) return prev;
      return ready;
    });
  }, [data]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setActionResult(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/documents/upload", { method: "POST", body: fd });
    const body = (await res.json()) as { error?: string };
    setUploading(false);
    e.target.value = "";
    if (!res.ok) {
      setActionResult(body.error || "Upload failed");
      return;
    }
    await refresh();
  }

  async function sendChat(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    setChatLoading(true);
    setAnswer(null);
    setSources([]);
    setActionResult(null);
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        documentIds: selectedIds.length ? selectedIds : undefined,
        sessionId,
      }),
    });
    const j = (await res.json()) as {
      answer?: string;
      sources?: Source[];
      sessionId?: string;
      error?: string;
    };
    setChatLoading(false);
    if (!res.ok) {
      setAnswer(j.error || "Chat failed.");
      return;
    }
    setAnswer(j.answer ?? "");
    setSources(j.sources ?? []);
    if (j.sessionId) setSessionId(j.sessionId);
    void refresh();
  }

  async function runAction(
    kind:
      | "summarize"
      | "action_items"
      | "risks"
      | "email_reply"
      | "compare",
    extra?: { b?: string },
  ) {
    const first = selectedIds[0];
    if (!first && kind !== "compare") {
      setActionResult("Select at least one processed document.");
      return;
    }
    if (kind === "compare") {
      const a = selectedIds[0];
      const b = extra?.b || compareB;
      if (!a || !b || a === b) {
        setActionResult("Pick two different documents for compare.");
        return;
      }
    }

    setActionLoading(kind);
    setActionResult(null);
    const payload =
      kind === "compare"
        ? {
            kind,
            documentIdA: selectedIds[0],
            documentIdB: compareB || extra?.b,
          }
        : { kind, documentId: first! };

    const res = await fetch("/api/actions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const j = (await res.json()) as { result?: string; error?: string };
    setActionLoading(null);
    if (!res.ok) {
      setActionResult(j.error || "Action failed.");
      return;
    }
    setActionResult(j.result ?? "");
    void refresh();
  }

  if (!data && !loadError) {
    return (
      <div className="flex justify-center py-20 text-mist-300">
        <Loader2 className="h-8 w-8 animate-spin text-accent" />
      </div>
    );
  }

  if (loadError) {
    return (
      <p className="text-center text-red-400">
        {loadError}{" "}
        <button type="button" onClick={() => void refresh()} className="text-accent underline">
          Retry
        </button>
      </p>
    );
  }

  const d = data!;

  return (
    <div className="space-y-10">
      <section>
        <h1 className="text-2xl font-bold text-white">Workspace</h1>
        <p className="mt-1 text-sm text-mist-300">
          Documents are private to your account. Processing runs after upload (or via worker when{" "}
          <code className="rounded bg-ink-800 px-1">USE_DOCUMENT_WORKER=true</code>).
        </p>
        <div className="mt-4 grid gap-4 sm:grid-cols-4">
          <Stat label="Tokens in (30d)" value={d.usage30d.tokensIn.toLocaleString()} />
          <Stat label="Tokens out (30d)" value={d.usage30d.tokensOut.toLocaleString()} />
          <Stat label="Embedding calls" value={d.usage30d.embeddingCalls.toLocaleString()} />
          <Stat
            label="Est. cost (30d)"
            value={`~$${(d.usage30d.estimatedUsdCents / 100).toFixed(2)}`}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-ink-800 bg-ink-900/40 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Upload className="h-5 w-5 text-accent" />
            Upload
          </h2>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent-muted">
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Choose file
            <input
              type="file"
              accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
              className="hidden"
              disabled={uploading}
              onChange={(e) => void onUpload(e)}
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-mist-300">PDF, DOCX, TXT — max size from MAX_UPLOAD_MB.</p>
      </section>

      <section className="rounded-2xl border border-ink-800 bg-ink-900/40 p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-lg font-semibold text-white">Documents</h2>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-1 rounded-lg border border-ink-700 px-3 py-1.5 text-sm text-mist-200 hover:border-accent"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-ink-800 text-mist-300">
                <th className="pb-2 pr-2">Scope</th>
                <th className="pb-2 pr-2">File</th>
                <th className="pb-2 pr-2">Type</th>
                <th className="pb-2 pr-2">Status</th>
                <th className="pb-2 pr-2">Updated</th>
              </tr>
            </thead>
            <tbody>
              {d.documents.map((doc) => (
                <tr key={doc.id} className="border-b border-ink-800/60">
                  <td className="py-2 pr-2">
                    {doc.status === "READY" ? (
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(doc.id)}
                        onChange={() => {
                          setSelectedIds((prev) =>
                            prev.includes(doc.id)
                              ? prev.filter((x) => x !== doc.id)
                              : [...prev, doc.id],
                          );
                        }}
                        aria-label={`Include ${doc.filename}`}
                      />
                    ) : (
                      <span className="text-mist-500">—</span>
                    )}
                  </td>
                  <td className="max-w-[200px] truncate pr-2 font-medium text-white">
                    {doc.filename}
                  </td>
                  <td className="pr-2 text-mist-300">{doc.docType}</td>
                  <td className="pr-2">
                    <StatusBadge status={doc.status} />
                  </td>
                  <td className="text-mist-400">
                    {new Date(doc.updatedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {d.documents.length === 0 && (
            <p className="py-6 text-center text-mist-400">No documents yet.</p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-ink-800 bg-ink-900/40 p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <Sparkles className="h-5 w-5 text-accent" />
          Quick actions
        </h2>
        <p className="mt-1 text-xs text-mist-400">
          Uses full document text (chunk-joined). For very large files, context may truncate.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <ActionBtn
            icon={<Sparkles className="h-4 w-4" />}
            label="Summarize"
            loading={actionLoading === "summarize"}
            onClick={() => void runAction("summarize")}
          />
          <ActionBtn
            icon={<ListTodo className="h-4 w-4" />}
            label="Action items"
            loading={actionLoading === "action_items"}
            onClick={() => void runAction("action_items")}
          />
          <ActionBtn
            icon={<AlertTriangle className="h-4 w-4" />}
            label="Find risks"
            loading={actionLoading === "risks"}
            onClick={() => void runAction("risks")}
          />
          <ActionBtn
            icon={<Mail className="h-4 w-4" />}
            label="Email reply"
            loading={actionLoading === "email_reply"}
            onClick={() => void runAction("email_reply")}
          />
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-ink-800 pt-4">
          <div>
            <label className="text-xs text-mist-400">Compare: second document</label>
            <select
              value={compareB}
              onChange={(e) => setCompareB(e.target.value)}
              className="mt-1 block rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm text-white"
            >
              <option value="">Select…</option>
              {readyDocs.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.filename}
                </option>
              ))}
            </select>
          </div>
          <ActionBtn
            icon={<GitCompare className="h-4 w-4" />}
            label="Compare documents"
            loading={actionLoading === "compare"}
            onClick={() => void runAction("compare")}
          />
        </div>
        {actionResult && (
          <pre className="mt-4 max-h-80 overflow-auto whitespace-pre-wrap rounded-lg border border-ink-800 bg-ink-950 p-4 text-sm text-mist-100">
            {actionResult}
          </pre>
        )}
      </section>

      <section className="rounded-2xl border border-ink-800 bg-ink-900/40 p-6">
        <h2 className="flex items-center gap-2 text-lg font-semibold text-white">
          <MessageSquare className="h-5 w-5 text-accent" />
          Chat with documents
        </h2>
        <form onSubmit={(e) => void sendChat(e)} className="mt-4 space-y-3">
          <textarea
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            rows={3}
            placeholder='e.g. "What are the payment terms?"'
            className="w-full rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-white outline-none ring-accent focus:ring-2"
          />
          <button
            type="submit"
            disabled={chatLoading}
            className="rounded-lg bg-accent px-5 py-2 font-semibold text-white hover:bg-accent-muted disabled:opacity-50"
          >
            {chatLoading ? "Thinking…" : "Ask"}
          </button>
        </form>
        {answer && (
          <div className="mt-6 space-y-4">
            <div>
              <h3 className="text-sm font-medium text-mist-300">Answer</h3>
              <p className="mt-2 whitespace-pre-wrap text-mist-100">{answer}</p>
            </div>
            {sources.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-mist-300">Sources</h3>
                <ul className="mt-2 space-y-2">
                  {sources.map((s, i) => (
                    <li
                      key={`${s.documentId}-${s.chunkIndex}-${i}`}
                      className="rounded-lg border border-ink-800 bg-ink-950/80 p-3 text-sm"
                    >
                      <span className="font-medium text-accent">
                        {s.filename}
                        {s.pageHint != null ? ` — page ~${s.pageHint}` : ""}
                      </span>
                      <span className="text-mist-500"> · chunk {s.chunkIndex}</span>
                      <p className="mt-1 text-mist-300">{s.excerpt}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-ink-800 bg-ink-900/40 p-6">
        <h2 className="text-lg font-semibold text-white">Recent chat sessions</h2>
        <ul className="mt-3 space-y-2 text-sm text-mist-300">
          {d.chatSessions.map((c) => (
            <li key={c.id}>
              <span className="text-white">{c.title || "Chat"}</span> ·{" "}
              {new Date(c.updatedAt).toLocaleString()}
            </li>
          ))}
          {d.chatSessions.length === 0 && <li>No chats yet.</li>}
        </ul>
      </section>

      {d.isAdmin && d.auditLogs && d.auditLogs.length > 0 && (
        <section className="rounded-2xl border border-ink-800 bg-ink-900/40 p-6">
          <h2 className="text-lg font-semibold text-white">Audit log (admin)</h2>
          <ul className="mt-3 max-h-60 space-y-1 overflow-auto font-mono text-xs text-mist-400">
            {d.auditLogs.map((a) => (
              <li key={a.id}>
                {new Date(a.createdAt).toISOString()} {a.action}{" "}
                {a.resource ?? ""} {a.resourceId ?? ""}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-ink-800 bg-ink-950/60 px-4 py-3">
      <p className="text-xs text-mist-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-white">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    READY: "text-emerald-400 border-emerald-500/40",
    PROCESSING: "text-amber-300 border-amber-500/40",
    QUEUED: "text-sky-300 border-sky-500/40",
    UPLOADED: "text-mist-300 border-ink-600",
    FAILED: "text-red-400 border-red-500/40",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${colors[status] ?? "text-mist-300"}`}
    >
      {status === "FAILED" && <FileWarning className="h-3 w-3" />}
      {status}
    </span>
  );
}

function ActionBtn({
  icon,
  label,
  onClick,
  loading,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  loading: boolean;
}) {
  return (
    <button
      type="button"
      disabled={loading}
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-lg border border-ink-700 bg-ink-950 px-3 py-2 text-sm font-medium text-mist-100 transition hover:border-accent hover:text-white disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {label}
    </button>
  );
}
