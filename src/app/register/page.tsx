import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { RegisterForm } from "./ui";

export default async function RegisterPage() {
  const session = await auth();
  if (session) redirect("/dashboard");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-950 px-4">
      <div className="w-full max-w-md rounded-2xl border border-ink-800 bg-ink-900/60 p-8 shadow-xl">
        <h1 className="text-2xl font-bold text-white">Create account</h1>
        <p className="mt-1 text-sm text-mist-300">
          Each account has its own private documents and chat history.
        </p>
        <div className="mt-8">
          <RegisterForm />
        </div>
        <p className="mt-6 text-center text-sm text-mist-300">
          Already registered?{" "}
          <Link href="/login" className="text-accent hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
