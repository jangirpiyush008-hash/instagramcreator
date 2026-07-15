import { redirect } from "next/navigation";
import { isAdminAuthed } from "@/web/lib/admin-auth";
import { AdminShell } from "@/web/components/admin/AdminShell";

// Auth-guarded layout for every admin page EXCEPT /admin/login.
// The (app) route group hides this folder from the URL, so:
//   app/admin/(app)/page.tsx           → served at /admin
//   app/admin/(app)/users/page.tsx     → served at /admin/users
//   app/admin/login/page.tsx           → served at /admin/login (no shell)
//
// Because login lives OUTSIDE this route group, it doesn't inherit this
// layout — no infinite redirect loop.

export const dynamic = "force-dynamic";

export default async function AdminAppLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAdminAuthed())) redirect("/admin/login");
  return <AdminShell>{children}</AdminShell>;
}
