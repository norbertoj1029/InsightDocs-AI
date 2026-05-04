import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { signOutAction } from "./actions";
import { LogOut, LayoutDashboard } from "lucide-react";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-ink-950 text-mist-100">
      <header className="border-b border-ink-800 bg-ink-900/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 font-semibold tracking-tight text-white"
          >
            <LayoutDashboard className="h-5 w-5 text-accent" />
            InsightDocs
          </Link>
          <nav className="flex items-center gap-4 text-sm text-mist-300">
            <span className="hidden sm:inline">{session.user.email}</span>
            <form action={signOutAction}>
              <button
                type="submit"
                className="inline-flex items-center gap-1 rounded-lg border border-ink-700 px-3 py-1.5 text-mist-200 transition hover:border-accent hover:text-white"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </div>
  );
}
