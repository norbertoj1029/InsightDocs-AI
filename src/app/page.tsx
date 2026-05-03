import Link from "next/link";
import { auth } from "@/auth";
import { FileText, Shield, Sparkles } from "lucide-react";

export default async function HomePage() {
  const session = await auth();

  return (
    <div className="min-h-screen bg-gradient-to-b from-ink-950 via-ink-900 to-ink-950">
      <div className="mx-auto max-w-5xl px-4 py-16 sm:py-24">
        <p className="mb-3 text-center text-sm font-medium uppercase tracking-widest text-accent">
          AI Business Document Assistant
        </p>
        <h1 className="text-center text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Private RAG over your contracts, policies, and reports
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-center text-lg text-mist-300">
          Upload PDF, DOCX, or TXT. Ask questions, get answers with citations,
          and run one-click summaries, risk scans, and document comparison.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          {session ? (
            <Link
              href="/dashboard"
              className="rounded-xl bg-accent px-6 py-3 font-semibold text-white shadow-lg shadow-accent/25 transition hover:bg-accent-muted"
            >
              Open dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/register"
                className="rounded-xl bg-accent px-6 py-3 font-semibold text-white shadow-lg shadow-accent/25 transition hover:bg-accent-muted"
              >
                Create account
              </Link>
              <Link
                href="/login"
                className="rounded-xl border border-ink-700 px-6 py-3 font-semibold text-mist-100 transition hover:border-accent hover:text-white"
              >
                Sign in
              </Link>
            </>
          )}
        </div>

        <div className="mt-20 grid gap-6 sm:grid-cols-3">
          <Feature
            icon={<FileText className="h-6 w-6" />}
            title="Document pipeline"
            text="Parsing, token-aware chunking, embeddings in pgvector, and background-ready processing."
          />
          <Feature
            icon={<Sparkles className="h-6 w-6" />}
            title="Grounded answers"
            text="Retrieve similar chunks, cite filename and estimated page, track tokens and cost."
          />
          <Feature
            icon={<Shield className="h-6 w-6" />}
            title="Production-minded"
            text="Auth, per-user isolation, rate limits, audit logs, usage records, and error handling."
          />
        </div>
      </div>
    </div>
  );
}

function Feature({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-ink-800 bg-ink-900/50 p-6">
      <div className="mb-3 text-accent">{icon}</div>
      <h2 className="text-lg font-semibold text-white">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-mist-300">{text}</p>
    </div>
  );
}
