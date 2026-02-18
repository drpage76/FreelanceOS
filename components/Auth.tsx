// src/components/Auth.tsx
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

interface AuthProps {
  onSuccess: () => void;
  initialIsSignUp?: boolean;
}

export const Auth: React.FC<AuthProps> = ({ onSuccess, initialIsSignUp = false }) => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(initialIsSignUp);
  const [error, setError] = useState<string | null>(null);

  // If already signed in, bounce through
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!cancelled && data?.session) onSuccess();
      } catch {
        // ignore
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) onSuccess();
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [onSuccess]);

  const handleEmailAuth = async () => {
    setError(null);
    setLoading(true);
    try {
      if (!email || !password) throw new Error("Enter email + password");

      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      // onSuccess will be triggered via listener
    } catch (e: any) {
      setError(e?.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setLoading(true);

    try {
      // Store config for callback.html (GitHub Pages + static callback)
      const url = (import.meta.env.VITE_SUPABASE_URL || "").trim();
      const key = (import.meta.env.VITE_SUPABASE_ANON_KEY || "").trim();
      if (url) localStorage.setItem("FO_SUPABASE_URL", url);
      if (key) localStorage.setItem("FO_SUPABASE_ANON_KEY", key);

      // ✅ ALWAYS redirect to the static callback file (not the hash route)
      const redirectTo = `${window.location.origin}/auth/callback.html`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (error) throw error;
      // Browser redirects away after this
    } catch (e: any) {
      setError(e?.message || "OAuth failed");
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: "0 auto", padding: 24 }}>
      <h2 style={{ marginBottom: 12 }}>{isSignUp ? "Create account" : "Sign in"}</h2>

      {error && (
        <div style={{ marginBottom: 12, color: "#b00020", whiteSpace: "pre-wrap" }}>
          {error}
        </div>
      )}

      <div style={{ display: "grid", gap: 10 }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoComplete="email"
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          type="password"
          autoComplete={isSignUp ? "new-password" : "current-password"}
        />

        <button onClick={handleEmailAuth} disabled={loading}>
          {loading ? "Please wait…" : isSignUp ? "Register" : "Sign In"}
        </button>

        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ flex: 1, height: 1, background: "#ddd" }} />
          <span style={{ color: "#666", fontSize: 12 }}>or</span>
          <div style={{ flex: 1, height: 1, background: "#ddd" }} />
        </div>

        <button
          onClick={handleGoogleLogin}
          disabled={loading}
          style={{ display: "flex", justifyContent: "center" }}
        >
          Continue with Google
        </button>

        <button
          type="button"
          onClick={() => setIsSignUp((s) => !s)}
          disabled={loading}
          style={{
            background: "transparent",
            border: "none",
            color: "#4f46e5",
            cursor: "pointer",
          }}
        >
          {isSignUp ? "Already have an account? Sign in" : "No account? Register"}
        </button>
      </div>
    </div>
  );
};
