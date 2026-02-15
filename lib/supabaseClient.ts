import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Bulletproof Supabase client for Vite.
 * - Uses env vars if valid
 * - Falls back safely if env is broken
 * - NEVER white-screens due to bad URL
 */

// Raw env values
const RAW_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? "";
const RAW_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? "";

// Trim whitespace
const ENV_URL = RAW_URL.trim();
const ENV_KEY = RAW_KEY.trim();

// Known-good fallbacks (your project)
const FALLBACK_URL = "https://hucvermrtjxsjcsjirwj.supabase.co";
const FALLBACK_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh1Y3Zlcm1ydGp4c2pjc2ppcndqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyNDQ1NDAsImV4cCI6MjA4MzgyMDU0MH0.hpdDWrdQubhBW2ga3Vho8J_fOtVw7Xr6GZexF8ksSmA";

// Only accept env URL if it is valid http(s)
function isValidHttpUrl(url: string) {
  return /^https?:\/\/.+/i.test(url);
}

const supabaseUrl = isValidHttpUrl(ENV_URL) ? ENV_URL : FALLBACK_URL;
const supabaseAnonKey = ENV_KEY || FALLBACK_KEY;

export const isSupabaseConfigured = () => !!(supabaseUrl && supabaseAnonKey);

export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  }
);

// Dev-only diagnostics (never prints key)
if (import.meta.env.DEV) {
  console.log("[Supabase] URL:", supabaseUrl);
  console.log("[Supabase] Key present:", !!supabaseAnonKey);
}
