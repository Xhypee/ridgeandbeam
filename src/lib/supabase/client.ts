import { createBrowserClient } from "@supabase/ssr";

/** Browser Supabase client (session from the auth cookies). Used by the offline upload queue. */
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
