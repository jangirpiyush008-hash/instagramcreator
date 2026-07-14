import Link from "next/link";
import { LoginForm } from "@/web/components/LoginForm";

export const metadata = {
  title: "Create account — DecodeCreator",
  description:
    "Create your free DecodeCreator account to unlock the full analytics report on any public Instagram, TikTok, or YouTube account.",
};

// Same underlying Supabase magic-link / Google flows as /login — Supabase
// auto-creates users on first sign-in and just signs them in on repeats.
// This page differs from /login only in copy, so the user gets a proper
// "welcome, sign up" landing when they click a "get started" CTA.
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <section className="container py-16 max-w-md">
      <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
      <p className="text-muted-foreground text-sm mt-1">
        No password to remember. We&apos;ll email you a link — or continue with Google.
      </p>

      <ul className="mt-6 space-y-2 text-sm text-muted-foreground">
        <li className="flex items-start gap-2">
          <span className="text-primary mt-0.5">✓</span>
          Full engagement, growth, and audience analytics — all 12 tools unlocked
        </li>
        <li className="flex items-start gap-2">
          <span className="text-primary mt-0.5">✓</span>
          Save scans, track favorite accounts, download in bulk
        </li>
        <li className="flex items-start gap-2">
          <span className="text-primary mt-0.5">✓</span>
          Free tier — subscribe only if you want unlimited scans
        </li>
      </ul>

      <div className="mt-8">
        <LoginForm next={next ?? "/account"} mode="signup" />
      </div>
      <p className="text-xs text-muted-foreground mt-6 text-center">
        Already have an account?{" "}
        <Link href="/login" className="text-foreground underline hover:text-primary transition">
          Sign in
        </Link>
      </p>
      <p className="text-[11px] text-muted-foreground/70 mt-4 text-center">
        By creating an account you agree to public-data analytics only — DecodeCreator never
        notifies the account being analyzed.
      </p>
    </section>
  );
}
