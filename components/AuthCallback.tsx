import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabase } from "../services/db";

function getCodeFromUrl(): string | null {
  // Your URL often looks like: /?code=XYZ#/auth/callback
  const direct = new URLSearchParams(window.location.search).get("code");
  if (direct) return direct;

  // Or: #/auth/callback?code=XYZ
  const hash = window.location.hash || "";
  const q = hash.indexOf("?");
  if (q >= 0) {
    const qs = hash.slice(q + 1);
    return new URLSearchParams(qs).get("code");
  }

  return null;
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const ran = useRef(false);
  const [status, setStatus] = useState("Signing you in…");

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    const run = async () => {
      try {
        const client = getSupabase();
        if (!client) {
          setStatus("Supabase client not available (getSupabase() returned null/undefined).");
          return;
        }

        const code = getCodeFromUrl();

        // Debug info (safe)
        console.log("[AuthCallback] location.href:", window.location.href);
        console.log("[AuthCallback] has code?:", !!code, "length:", code?.length || 0);

        // If already signed in, skip exchange
        const existing = await client.auth.getSession();
        console.log("[AuthCallback] existing session?:", !!existing.data.session);

        if (existing.data.session) {
          window.history.replaceState({}, document.title, "/#/");
          navigate("/", { replace: true });
          return;
        }

        if (!code) {
          setStatus("No code found in callback URL.");
          return;
        }

        setStatus("Exchanging code for session…");
        console.log("[AuthCallback] calling exchangeCodeForSession…");

        const { error } = await client.auth.exchangeCodeForSession(code);

        console.log("[AuthCallback] exchange returned. error?:", !!error);
        if (error) throw error;

        const sess = await client.auth.getSession();
        console.log("[AuthCallback] session after exchange?:", !!sess.data.session);

        if (!sess.data.session) {
          throw new Error("Session not created after exchange.");
        }

        window.history.replaceState({}, document.title, "/#/");
        setStatus("Done. Redirecting…");
        navigate("/", { replace: true });
      } catch (e: any) {
        console.error("[AuthCallback] FAILED:", e);
        setStatus(`OAuth failed: ${e?.message || "Unknown error"}`);
      }
    };

    run();
  }, [navigate]);

  return <div className="p-10">{status}</div>;
}
