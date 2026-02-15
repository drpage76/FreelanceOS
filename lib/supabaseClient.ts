// src/lib/supabaseClient.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn(
    "[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Cloud features will be disabled."
  );
}

/**
 * FreelanceOS Supabase client (SPA / HashRouter safe)
 * - Uses PKCE (code flow) for OAuth
 * - Persists session in localStorage
 * - Detects session in URL when the SPA loads (fine), but the dedicated callback page
 *   should do exchangeCodeForSession() explicitly to avoid implicit-grant parsing issues.
 */
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      storage: localStorage,

      // Keep true in the SPA. Your /auth/callback.html will do an explicit exchange anyway.
      detectSessionInUrl: true,
    },
    global: {
      headers: {
        "X-Client-Info": "freelanceos-web",
      },
    },
  }
);
