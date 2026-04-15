import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

// Lazy singleton — avoids throwing during Next.js static page generation
// when env vars aren't available at build time.
// Env vars are read at call time (not module-load time) so that Next.js
// has a chance to inject NEXT_PUBLIC_* values before the first access.
let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient {
  if (!_client) {
    // Read env vars at call time — they may not be available at module load
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

    if (!url || !anonKey) {
      throw new Error(
        "Supabase credentials missing.\n" +
          "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local\n" +
          "See: https://supabase.com/dashboard/project/_/settings/api"
      );
    }

    _client = createBrowserClient(url, anonKey);
  }
  return _client;
}

// Proxy object that lazily initializes the real Supabase client on first access.
// This ensures module-level imports don't trigger createBrowserClient() at build time.
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    const client = getClient();
    const value = Reflect.get(client, prop, receiver);
    if (typeof value === "function") {
      return value.bind(client);
    }
    return value;
  },
});
