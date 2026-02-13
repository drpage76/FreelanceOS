// lib/supabaseClient.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Robust Supabase client for Vite.
 * - Prefers VITE_* env vars
 * - Falls back to known project URL/key (dev safety)
 * - Exports SUPABASE_URL + SUPABASE_ANON_KEY so DB.isCloudConfigured() works
 * - DOES NOT throw at import-time (prevents blank page)
 */

const ENV_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
const ENV_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";

// ✅ These MUST be your real Supabase project URL + anon key (NOT your domain)
const FALLBACK_URL = "https://hucvermrtjxsjcsjirwj.supabase.co";
const FALLBACK_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1Y3Zlcm1ydGp4c2pjc2ppcndqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNDQ1NDAsImV4cCI6MjA4MzgyMDU0MH0.hpdDWrdQubhBW2ga3Vho8J_fOtVw7Xr6GZexF8ksSmA";

// ✅ Exported constants (this is what your DB.ts expects)
export const SUPABASE_URL = (ENV_URL || FALLBACK_URL).trim();
export const SUPABASE_ANON_KEY = (ENV_KEY || FALLBACK_KEY).trim();

export const isSupabaseConfigured = () => !!(SUPABASE_URL && SUPABASE_ANON_KEY);

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});
