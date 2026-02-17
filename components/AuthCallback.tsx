import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabase } from "../services/db";

/**
 * Robustly read ?code= from either:
 *  - https://freelanceos.org/?code=XYZ#/auth/callback   (common with hash routing)
 *  - https://freelanceos.org/#/auth/callback?code=XYZ   (less common)
 */
function getOAuthCode(): string | null {
  // 1) Standard querystring
  const searchParams = new URLSearchParams(window.location.search);
  const codeFromSearch = searchParams.get("code");
  if (codeFromSearch) return codeFromSearch;

  // 2) Querystring inside the hash (/#/auth/callback?code=...)
  const hash = window.location.hash || "";
  const qIndex = hash.indexOf("?");
  if (qIndex >= 0) {
    const hashQuery = hash.slice(qIndex + 1);
    const hashParams = new URLSearchParams(hashQuery);
    const codeFromHash = hashParams.get("code");
    if (codeFromHash) return codeFromHash;
  }

  return null;
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const [msg, setMsg] = useState("Exchanging code for session…");
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return; // prevent double-run in dev/strict mode
    ranRef.current = true;

    const run = async () => {
      const client = getSupabase();
      if (!client) {
        setMsg("Supabase client not available.");
        return;
      }

      try {
        // If session already exists, just go home
        const existing = await client.auth.getSession();
        if (existing?.data?.session) {
          window.history.replaceState({}, "", "/#/");
          navigate("/", { replace: true });
          return;
        }

        const code = getOAuthCode();
        if (!code) {
          setMsg("No code found in callback URL.");
          return;
        }

        // This should perform the token exchange (PKCE)
        const { data, error } = await client.auth.exchangeCodeForSession(code);
        if (error) throw error;

        // Prefer the session returned directly (avoids getSession timing issues)
        if (!data?.session) {
          // Fallback attempt
          const { data: s2 } = await client.auth.getSession();
          if (!s2?.session) throw new Error("Session not created after exchange.");
        }

        // Clean URL so refresh doesn't repeat callback
        window.history.replaceState({}, "", "/#/");

        navigate("/", { replace: true });
      } catch (e: any) {
        setMsg(`OAuth failed: ${e?.message || String(e)}`);
      }
    };

    run();
  }, [navigate]);

  return <div className="p-10">{msg}</div>;
}
