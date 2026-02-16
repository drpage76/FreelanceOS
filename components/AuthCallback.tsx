import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabase } from "../services/db";

function getParamEverywhere(name: string): string | null {
  // 1) Normal query string (?code=...)
  const fromSearch = new URLSearchParams(window.location.search).get(name);
  if (fromSearch) return fromSearch;

  // 2) Hash-router query (/#/auth/callback?code=...)
  // window.location.hash might be "#/auth/callback?code=XYZ"
  const hash = window.location.hash || "";
  const qIndex = hash.indexOf("?");
  if (qIndex >= 0) {
    const hashQuery = hash.slice(qIndex + 1);
    const fromHash = new URLSearchParams(hashQuery).get(name);
    if (fromHash) return fromHash;
  }

  return null;
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const [msg, setMsg] = useState("Signing you in…");

  useEffect(() => {
    const run = async () => {
      const client = getSupabase();
      if (!client) {
        setMsg("OAuth failed: Supabase client missing (URL/anon key).");
        return;
      }

      const code = getParamEverywhere("code");
      if (!code) {
        setMsg("No code found in callback URL.");
        return;
      }

      try {
        // Exchange code -> session (PKCE)
        const { error } = await client.auth.exchangeCodeForSession(code);
        if (error) throw error;

        const { data } = await client.auth.getSession();
        if (!data.session) throw new Error("Session not created");

        // Clean URL (remove ?code=... etc)
        window.history.replaceState({}, document.title, `${window.location.origin}/#/`);

        // Go to app
        navigate("/dashboard", { replace: true });
      } catch (e: any) {
        setMsg(`OAuth failed: ${e?.message || String(e)}`);
      }
    };

    run();
  }, [navigate]);

  return (
    <div className="p-10">
      {msg}
    </div>
  );
}
