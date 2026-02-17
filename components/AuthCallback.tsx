import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabase } from "../services/db";

function getParamFromHashOrSearch(name: string): string | null {
  // 1) normal query string
  const s = new URLSearchParams(window.location.search);
  const fromSearch = s.get(name);
  if (fromSearch) return fromSearch;

  // 2) query string inside the hash: #/auth/callback?code=...
  const hash = window.location.hash || "";
  const qIndex = hash.indexOf("?");
  if (qIndex >= 0) {
    const qs = hash.slice(qIndex + 1);
    const h = new URLSearchParams(qs);
    const fromHash = h.get(name);
    if (fromHash) return fromHash;
  }

  return null;
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const ran = useRef(false);
  const [msg, setMsg] = useState("Signing you in…");

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const run = async () => {
      const client = getSupabase();
      if (!client) {
        setMsg("Supabase client not available.");
        return;
      }

      // Supabase may return error params too
      const errorDesc =
        getParamFromHashOrSearch("error_description") ||
        getParamFromHashOrSearch("error");
      if (errorDesc) {
        setMsg(`OAuth error: ${decodeURIComponent(errorDesc)}`);
        return;
      }

      const code = getParamFromHashOrSearch("code");
      if (!code) {
        setMsg("No code found in callback URL.");
        return;
      }

      try {
        const { error } = await client.auth.exchangeCodeForSession(code);
        if (error) throw error;

        const { data, error: sessErr } = await client.auth.getSession();
        if (sessErr) throw sessErr;
        if (!data.session) throw new Error("Session not created");

        // Clean URL (remove code/state/etc)
        window.history.replaceState({}, document.title, "/#/");

        // Go to app
        navigate("/dashboard", { replace: true });
      } catch (e: any) {
        setMsg(`OAuth failed: ${e?.message || "Unknown error"}`);
      }
    };

    run();
  }, [navigate]);

  return <div className="p-10">{msg}</div>;
}
