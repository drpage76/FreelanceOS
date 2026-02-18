// src/lib/supabaseClient.ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || "").trim();
const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();

export const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,

    // We handle the exchange manually in AuthCallback.tsx
    detectSessionInUrl: false,

    storage: window.localStorage,
  },
});
