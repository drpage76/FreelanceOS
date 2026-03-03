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
    console.error("[Supabase] Missing config:", {
      VITE_SUPABASE_URL: SUPABASE_URL || "(missing)",
      VITE_SUPABASE_ANON_KEY: maskKey(SUPABASE_ANON_KEY),
      hint: "Check your Vite env vars on local + GitHub Actions secrets for deploy.",
    });
  }
}

assertSupabaseConfig();

// Safer storage access (avoids crashing in non-browser contexts)
const safeStorage =
  typeof window !== "undefined" && window.localStorage ? window.localStorage : undefined;

// Make the auth token key predictable (still unique per project)
const storageKey = "freelanceos-auth";

// Create client
export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // ✅ Required for Google OAuth in SPA
    flowType: "pkce",

    // ✅ Keep sessions across reloads
    persistSession: true,
    autoRefreshToken: true,

    // ✅ MUST be true when provider returns ?code=...
    detectSessionInUrl: true,

    // ✅ Use localStorage when available
    storage: safeStorage,

    // ✅ Predictable key name (helps debugging; avoids surprises)
    storageKey,
  },
});