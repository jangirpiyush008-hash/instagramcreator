import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let serviceClient: SupabaseClient | null = null;

// Service-role client. Server-side ONLY. Never import from web/components.
//
// Fail LOUDLY when required env vars are missing rather than silently
// falling back to placeholder credentials. The old placeholder pattern
// made every DB call return an error the caller handled with a try/catch
// — which combined with the rate-limiter's fail-open logic meant a
// misconfigured deploy served unlimited anonymous requests. Hard-throw
// forces the misconfiguration to show up at boot instead of at runtime
// as a silent security downgrade.
export function supabaseService(): SupabaseClient {
  if (serviceClient) return serviceClient;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE;

  if (!url) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL is not set. Server cannot start without it.",
    );
  }
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE is not set. Server cannot start without it — refusing to fall back to placeholder credentials because that would silently disable the auth + rate-limit checks that depend on this client.",
    );
  }

  serviceClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serviceClient;
}
