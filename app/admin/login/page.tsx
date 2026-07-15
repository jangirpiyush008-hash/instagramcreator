import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isAdminAuthed } from "@/web/lib/admin-auth";
import { AdminLoginForm } from "@/web/components/admin/AdminLoginForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin login",
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminLoginPage() {
  // If already authed, bounce to the dashboard.
  if (await isAdminAuthed()) redirect("/admin");
  return (
    <div className="min-h-screen grid place-items-center px-4 bg-background">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="inline-flex h-12 w-12 rounded-2xl bg-gradient-ig mb-3" aria-hidden />
          <h1 className="text-2xl font-bold tracking-tight">Admin console</h1>
          <p className="text-sm text-muted-foreground mt-1">
            DecodeCreator owner-only access.
          </p>
        </div>
        <AdminLoginForm />
        <p className="text-[11px] text-muted-foreground mt-4 text-center">
          Sessions last 12 hours. Forgot the password? Rotate{" "}
          <code className="text-xs">ADMIN_PASSWORD</code> in Railway env vars.
        </p>
      </div>
    </div>
  );
}
