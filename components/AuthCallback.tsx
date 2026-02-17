import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabase } from "../services/db";

/**
 * HashRouter note:
 * OAuth providers often redirect to:
 *   https://site.com/#/auth/callback?code=XYZ
 * In that case, window.location.search is EMPTY
 * because the querystring lives inside window.location.hash.
 */
function getCodeFromUrl(): string | null {
  try {
    const url = new URL(window.location.href);

    // 1) Normal query (?code=) before hash
    const direct = url.searchParams.get("code");
    if (direct) return direct;

    // 2) Query inside hash: "#/auth/callback?code=XYZ&state=..."
    const hash = window.location.hash || "";
    const qIndex = hash.indexOf("?");
    if (qIndex >= 0) {
      const qs = hash.slice(qIndex + 1);
      const params = new URLSearchParams(qs);
      const fromHash = params.get("code");
      if (fromHash) return fromHash;
    }

    return null;
  } catch {
    return null;
  }
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const ran = useRef(false);
  const [status, setStatus] = useState("Signing you in…");

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const run = async () => {
      const client = getSupabase();
      if (!client) {
        setStatus("Supabase client not available.");
        return;
      }

      const code = getCodeFromUrl();
      if (!code) {
        setStatus("No code found in callback URL.");
        return;
      }

      try {
        setStatus("Exchanging code for session…");

        const { error } = await client.auth.exchangeCodeForSession(code);
        if (error) throw error;

        const { data } = await client.auth.getSession();
        if (!data.session) throw new Error("Session not created");

        // Clean up URL (removes code/state)
        // Keep HashRouter root
        window.history.replaceState({}, document.title, "/#/");

        setStatus("Done. Redirecting…");
        navigate("/", { replace: true });
      } catch (e: any) {
        setStatus(`OAuth failed: ${e?.message || "Unknown error"}`);
      }
    };

    run();
  }, [navigate]);

  return <div className="p-10">{status}</div>;
}
