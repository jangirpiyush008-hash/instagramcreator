import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let serviceClient: SupabaseClient | null = null;

// Service-role client. Server-side ONLY. Never import from web/components.
export function supabaseService(): SupabaseClient {
  if (serviceClient) return serviceClient;
  // Use placeholders if not configured so dev/preview works without Supabase
  // wired — all callers wrap in try/catch and degrade gracefully on network failure.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
  const key = process.env.SUPABASE_SERVICE_ROLE || "placeholder";
  serviceClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serviceClient;
}
