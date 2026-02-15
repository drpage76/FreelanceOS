import React, { useEffect, useState } from "react";
import { getSupabase } from "../services/db";

const pickCodeFromUrl = () => {
  // Case A: https://site/#/auth/callback?code=XXXX
  const hash = window.location.hash || "";
  const qIndex = hash.indexOf("?");
  if (qIndex >= 0) {
    const hashQuery = hash.slice(qIndex + 1);
    const p = new URLSearchParams(hashQuery);
    const c = p.get("code");
    if (c) return c;
  }

  // Case B: https://site/?code=XXXX#/auth/callback
  const search = window.location.search || "";
  if (search) {
    const p = new URLSearchParams(search);
    const c = p.get("code");
    if (c) return c;
  }

  return null;
};

const pickErrorFromUrl = () => {
  // Supabase/Google can return errors in either place too
  const hash = window.location.hash || "";
  const qIndex = hash.indexOf("?");
  if (qIndex >= 0) {
    const p = new URLSearchParams(hash.slice(qIndex + 1));
    return p.get("error_description") || p.get("error");
  }

  const p2 = new URLSearchParams(window.location.search || "");
  return p2.get("error_description") || p2.get("error");
};

export default function AuthCallback() {
  const [msg, setMsg] = useState("Completing sign-in…");

  useEffect(() => {
    (async () => {
      try {
        const err = pickErrorFromUrl();
        if (err) {
          setMsg(`OAuth error: ${err}`);
          return;
        }

        const code = pickCodeFromUrl();
        if (!code) {
          setMsg("No code found in callback URL.");
          return;
        }

        const client = getSupabase();
        if (!client) {
          setMsg("Supabase client not initialized.");
          return;
        }

        // ✅ Correct for Supabase v2 PKCE flow
        const { error } = await client.auth.exchangeCodeForSession(code);
        if (error) throw error;

        setMsg("Signed in ✓ Redirecting…");

        // Clean URL (remove code) then go home
        window.history.replaceState({}, document.title, `${window.location.origin}/#/`);
        window.location.replace("/#/");
      } catch (e: any) {
        setMsg(`OAuth failed: ${e?.message || String(e)}`);
      }
    })();
  }, []);

  return (
    <div style={{ padding: 16, fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, Arial" }}>
      <h3>{msg}</h3>
    </div>
  );
}
