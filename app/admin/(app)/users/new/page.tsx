import type { Metadata } from "next";
import Link from "next/link";
import { CreateUserForm } from "@/web/components/admin/CreateUserForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Add user — Admin",
  robots: { index: false, follow: false, nocache: true },
};

// Owner-only manual user creation. Uses Supabase auth admin API on the
// server (see /api/admin/users/create) — creates auth.users + the
// profiles row via the existing trigger, optionally seeds a
// starter subscription and wallet balance.

export default async function AdminUserCreatePage({
  searchParams,
}: {
  searchParams: Promise<{ seg?: string }>;
}) {
  const { seg = "consumers" } = await searchParams;
  return (
    <div className="max-w-xl">
      <Link href={`/admin/users?seg=${seg}`} className="text-xs text-muted-foreground hover:text-foreground">
        ← Back to users
      </Link>
      <header className="mt-3 mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Add a user</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manually create an account. Useful for onboarding pilot
          customers, agency accounts, or comping a friend. The user
          will get their credentials by email (or you can copy them
          from the confirmation screen).
        </p>
      </header>
      <CreateUserForm seg={seg} />
    </div>
  );
}
