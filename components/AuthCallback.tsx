// components/AuthCallback.tsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabase } from "../services/db";

function getCodeFromUrl(): string | null {
  // For URLs like: https://freelanceos.org/?code=XXX#/auth/callback
  const searchParams = new URLSearchParams(window.location.search);
  const codeFromSearch = searchParams.get("code");
  if (codeFromSearch) return codeFromSearch;

  // Fallback: sometimes providers stick params in the hash
  const hash = window.location.hash || "";
  const qIndex = hash.indexOf("?");
  if (qIndex >= 0) {
    const hashParams = new URLSearchParams(hash.slice(qIndex + 1));
    const codeFromHash = hashParams.get("code");
    if (codeFromHash) return codeFromHash;
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
        setMsg("Supabase client not available.");
        return;
      }

      const code = getCodeFromUrl();
      if (!code) {
        setMsg("No OAuth code found in callback URL.");
        return;
      }

      try {
        setMsg("Exchanging code for session…");

        // ✅ This should be enough. No need to call getSession() afterwards.
        const { data, error } = await client.auth.exchangeCodeForSession(code);
        if (error) throw error;

        // If we got a session back, we're done.
        if (data?.session) {
          window.history.replaceState({}, "", "/#/");
          navigate("/", { replace: true });
          return;
        }

        // Rare fallback: wait briefly for auth state change
        setMsg("Finalising session…");
        await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => {
            reject(new Error("Timed out waiting for session."));
          }, 15000);

          const { data: sub } = client.auth.onAuthStateChange((_e, session) => {
            if (session) {
              window.clearTimeout(timeout);
              sub.subscription.unsubscribe();
              resolve();
            }
          });
        });

        window.history.replaceState({}, "", "/#/");
        navigate("/", { replace: true });
      } catch (e: any) {
        setMsg(`OAuth failed: ${e?.message || "Unknown error"}`);
      }
    };

    run();
  }, [navigate]);

  return <div className="p-10">{msg}</div>;
}
