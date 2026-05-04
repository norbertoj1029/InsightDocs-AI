import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { LoginForm } from "./ui";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const session = await auth();
  const sp = await searchParams;
  if (session) {
    redirect(sp.callbackUrl || "/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-ink-800 bg-ink-900/60 p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-white">Sign in</h1>
        <p className="mt-1 text-sm text-mist-300">
          Access your private document workspace.
        </p>
        <div className="mt-8">
          <LoginForm callbackUrl={sp.callbackUrl} />
        </div>
        <p className="mt-6 text-center text-sm text-mist-300">
          No account?{" "}
          <Link href="/register" className="text-accent hover:underline">
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}
