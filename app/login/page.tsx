import Link from "next/link";
import { LoginForm } from "@/web/components/LoginForm";

export const metadata = {
  title: "Sign in — DecodeCreator",
  description:
    "Sign in to DecodeCreator to unlock the full analytics report for any public Instagram, TikTok, or YouTube account.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <section className="container py-16 max-w-md">
      <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
      <p className="text-muted-foreground text-sm mt-1">
        Magic link to your inbox. We sign you in without a password.
      </p>
      <div className="mt-8">
        <LoginForm next={next ?? "/account"} mode="signin" />
      </div>
      <p className="text-xs text-muted-foreground mt-6 text-center">
        New to DecodeCreator?{" "}
        <Link href="/signup" className="text-foreground underline hover:text-primary transition">
          Create an account
        </Link>
      </p>
    </section>
  );
}
