// src/components/AuthCallback.tsx
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

const AuthCallback: React.FC = () => {
  const navigate = useNavigate();
  const [msg, setMsg] = useState("Signing you in…");
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const clearBrokenAuth = () => {
      Object.keys(localStorage).forEach((k) => {
        if (k.startsWith("sb-")) localStorage.removeItem(k);
      });
    };

    const run = async () => {
      try {
        // Works for BOTH:
        // /#/auth/callback?code=XXX
        // /?code=XXX#/auth/callback
        const params =
          window.location.search ||
          (window.location.hash.includes("?")
            ? window.location.hash.split("?")[1]
            : "");

        const code = new URLSearchParams(params).get("code");

        if (!code) throw new Error("No OAuth code found.");

        setMsg("Exchanging code for session…");

        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) throw error;

        if (cancelled) return;

        // Clean URL
        window.history.replaceState({}, "", "/#/dashboard");

        navigate("/dashboard", { replace: true });
      } catch (e: any) {
        if (cancelled) return;

        console.error(e);

        // auto recover from PKCE / refresh corruption
        clearBrokenAuth();
        await supabase.auth.signOut();

        setErr(e?.message || "Login failed");
        setMsg("OAuth failed. Please try again.");
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div style={{ padding: 32 }}>
      <h2>{msg}</h2>

      {err && (
        <>
          <pre style={{ color: "#b00020" }}>{err}</pre>
          <button onClick={() => navigate("/", { replace: true })}>
            Back to sign in
          </button>
        </>
      )}
    </div>
  );
};

export default AuthCallback;
