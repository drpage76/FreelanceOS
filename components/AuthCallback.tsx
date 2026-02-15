import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function AuthCallback() {
  const [msg, setMsg] = useState("Completing sign-in…");

  useEffect(() => {
    (async () => {
      try {
        // HashRouter URL example:
        // https://freelanceos.org/#/auth/callback?code=XXXX
        const full = window.location.href;
        const hash = window.location.hash || ""; // "#/auth/callback?code=XXXX"
        const qIndex = hash.indexOf("?");
        const query = qIndex >= 0 ? hash.slice(qIndex + 1) : ""; // "code=XXXX..."

        const params = new URLSearchParams(query);
        const code = params.get("code");
        const errorDesc = params.get("error_description") || params.get("error");

        if (errorDesc) {
          setMsg(`OAuth error: ${errorDesc}`);
          return;
        }

        if (!code) {
          setMsg("No code found in callback URL.");
          return;
        }

        // Build a URL that Supabase expects for code exchange (query string URL)
        const exchangeUrl = `${window.location.origin}/?code=${encodeURIComponent(code)}`;

        const { error } = await supabase.auth.exchangeCodeForSession(exchangeUrl);
        if (error) throw error;

        setMsg("Signed in ✓ Redirecting…");
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
