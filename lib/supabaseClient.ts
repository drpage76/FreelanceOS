// src/lib/supabaseClient.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Read from Vite env
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

// Optional: helps avoid weird runtime failures if envs are missing
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // Don’t throw in production build, just warn.
  console.warn(
    "[Supabase] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Cloud features will be disabled."
  );
}

/**
 * Supabase client
 * Key settings for OAuth + SPA deployments:
 * - detectSessionInUrl: MUST be true so OAuth callback exchanges the code and persists session
 * - persistSession/autoRefreshToken: keep user signed in reliably
 * - storage: ensure browser localStorage is used
 * - flowType: PKCE is recommended for SPAs
 */
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  {
    auth: {
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true,
      storage: localStorage,
      flowType: "pkce",
    },
    global: {
      headers: {
        "X-Client-Info": "freelanceos-web",
      },
    },
  }
);
