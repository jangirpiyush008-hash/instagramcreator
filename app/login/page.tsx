import { LoginForm } from "@/web/components/LoginForm";

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
        <LoginForm next={next ?? "/account"} />
      </div>
    </section>
  );
}
