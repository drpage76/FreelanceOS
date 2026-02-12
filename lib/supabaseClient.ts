// lib/supabaseClient.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Robust Supabase client for Vite.
 * - Prefers VITE_* env vars
 * - Falls back to known project URL/key (dev safety)
 * - DOES NOT throw at import-time (prevents blank page)
 */

const ENV_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
const ENV_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";

// Known-good fallbacks (from your services/db.ts)
const FALLBACK_URL = "https://hucvermrtjxsjcsjirwj.supabase.co";
const FALLBACK_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1Y3Zlcm1ydGp4c2pjc2ppcndqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNDQ1NDAsImV4cCI6MjA4MzgyMDU0MH0.hpdDWrdQubhBW2ga3Vho8J_fOtVw7Xr6GZexF8ksSmA";

const supabaseUrl = ENV_URL || FALLBACK_URL;
const supabaseAnonKey = ENV_KEY || FALLBACK_KEY;

export const isSupabaseConfigured = () => !!(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

if (import.meta.env.DEV) {
  // Helpful but safe (doesn't print the key)
  console.log("[Supabase] URL:", supabaseUrl);
  console.log("[Supabase] Key present:", !!supabaseAnonKey);
}
