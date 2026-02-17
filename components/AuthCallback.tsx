import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabase } from "../services/db";

function getCodeFromUrl(): string | null {
  // code in query (your current URL style: /?code=...#/auth/callback)
  const direct = new URLSearchParams(window.location.search).get("code");
  if (direct) return direct;

  // fallback: code inside hash query (#/auth/callback?code=...)
  const hash = window.location.hash || "";
  const q = hash.indexOf("?");
  if (q >= 0) {
    const qs = hash.slice(q + 1);
    return new URLSearchParams(qs).get("code");
  }
  return null;
}

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = window.setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    p.then((v) => {
      clearTimeout(t);
      resolve(v);
    }).catch((e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const ran = useRef(false);
  const [status, setStatus] = useState("Signing you in…");

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      try {
        const client = getSupabase();
        if (!client) {
          setStatus("Supabase client not available.");
          return;
        }

        console.log("[AuthCallback] href:", window.location.href);

        const code = getCodeFromUrl();
        console.log("[AuthCallback] has code?:", !!code, "length:", code?.length || 0);

        setStatus("Checking existing session…");
        console.log("[AuthCallback] calling getSession()");
        const existing = await withTimeout(client.auth.getSession(), 8000, "getSession");
        console.log("[AuthCallback] existing session?:", !!existing.data.session);

        if (existing.data.session) {
          setStatus("Already signed in. Redirecting…");
          window.history.replaceState({}, document.title, "/#/");
          navigate("/", { replace: true });
          return;
        }

        if (!code) {
          setStatus("No code found in callback URL.");
          return;
        }

        setStatus("Exchanging code for session…");
        console.log("[AuthCallback] calling exchangeCodeForSession()");
        const { error } = await withTimeout(client.auth.exchangeCodeForSession(code), 12000, "exchangeCodeForSession");
        if (error) throw error;
        console.log("[AuthCallback] exchange success");

        setStatus("Verifying session…");
        console.log("[AuthCallback] calling getSession() after exchange");
        const sess = await withTimeout(client.auth.getSession(), 8000, "getSession-after-exchange");
        console.log("[AuthCallback] session created?:", !!sess.data.session);

        if (!sess.data.session) throw new Error("Session not created after exchange.");

        setStatus("Done. Redirecting…");
        window.history.replaceState({}, document.title, "/#/");
        navigate("/", { replace: true });
      } catch (e: any) {
        console.error("[AuthCallback] FAILED:", e);
        setStatus(`OAuth failed: ${e?.message || "Unknown error"}`);
      }
    })();
  }, [navigate]);

  return <div className="p-10">{status}</div>;
}
