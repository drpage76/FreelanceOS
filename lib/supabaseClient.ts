// lib/supabaseClient.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Read Vite env vars (must be present at BUILD time for deployed site)
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

// Helpful diagnostics (won't print full key)
function maskKey(k: string) {
  if (!k) return "(empty)";
  if (k.length <= 12) return `${k.slice(0, 3)}…${k.slice(-3)}`;
  return `${k.slice(0, 6)}…${k.slice(-6)}`;
}

function assertSupabaseConfig() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    // This is THE #1 reason for "Invalid API key" on deployed builds
    console.error("[Supabase] Missing config:", {
      VITE_SUPABASE_URL: SUPABASE_URL || "(missing)",
      VITE_SUPABASE_ANON_KEY: maskKey(SUPABASE_ANON_KEY),
      hint: "Check GitHub Actions build env + Supabase Project Settings → API values.",
    });
  }
}

assertSupabaseConfig();

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,

    // IMPORTANT: you are handling /auth/callback yourself
    detectSessionInUrl: false,

    // Ensure PKCE verifier persists
    storage: window.localStorage,
  },
});
