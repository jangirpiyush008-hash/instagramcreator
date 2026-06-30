"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/web/components/ui/Button";
import { supabaseBrowser } from "@/web/lib/supabase-browser";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await supabaseBrowser().auth.signOut();
        router.push("/");
        router.refresh();
      }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </Button>
  );
}
