// src/lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    flowType: "pkce",
    persistSession: true,
    autoRefreshToken: true,

    // IMPORTANT: because YOU are handling the callback manually in AuthCallback
    // we MUST stop supabase-js trying to auto-parse the URL too.
    detectSessionInUrl: false,

    // Force localStorage so the PKCE verifier survives redirects reliably
    storage: window.localStorage,
  },
});
