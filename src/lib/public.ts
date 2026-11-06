import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Anonymous client for customer-facing pages; only the token RPCs are reachable. */
export function anonClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
