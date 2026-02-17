import React, { useEffect, useState, useRef } from "react";
import { getSupabase } from "../services/db";

interface AuthProps {
  onSuccess: () => void;
  initialIsSignUp?: boolean;
}

export const Auth: React.FC<AuthProps> = ({
  onSuccess,
  initialIsSignUp = false,
}) => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(initialIsSignUp);
  const [error, setError] = useState<string | null>(null);

  const onSuccessOnce = useRef(false);

  useEffect(() => {
    setIsSignUp(initialIsSignUp);
  }, [initialIsSignUp]);

  // Auto-enter app if session already exists
  useEffect(() => {
    const client = getSupabase();
    if (!client) return;

    let mounted = true;

    (async () => {
      try {
        const { data } = await client.auth.getSession();
        if (!mounted) return;
        if (data.session && !onSuccessOnce.current) {
          onSuccessOnce.current = true;
          onSuccess();
        }
      } catch {
        // ignore
      }
    })();

    const { data } = client.auth.onAuthStateChange((_e, session) => {
      if (session && !onSuccessOnce.current) {
        onSuccessOnce.current = true;
        onSuccess();
      }
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, [onSuccess]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const client = getSupabase();
    if (!client) {
      setError("Supabase client not available.");
      setLoading(false);
      return;
    }

    try {
      if (isSignUp) {
        // For email signups, this redirect is for confirmation links
        const emailRedirectTo = `${window.location.origin}/#/auth/callback`;

        const { error } = await client.auth.signUp({
          email,
          password,
          options: { emailRedirectTo },
        });

        if (error) throw error;
        alert("Check your email to confirm signup.");
      } else {
        const { error } = await client.auth.signInWithPassword({
          email,
          password,
        });

        if (error) throw error;

        if (!onSuccessOnce.current) {
          onSuccessOnce.current = true;
          onSuccess();
        }
      }
    } catch (err: any) {
      setError(err?.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);

    const client = getSupabase();
    if (!client) {
      setError("Supabase client not available.");
      setLoading(false);
      return;
    }

    try {
      // IMPORTANT for HashRouter
      const redirectTo = `${window.location.origin}/#/auth/callback`;

      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            prompt: "select_account",
            access_type: "offline",
            scope:
              "openid email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.file",
          },
        },
      });

      if (error) throw error;

      // Do not setLoading(false) here because the browser is about to redirect.
    } catch (err: any) {
      setError(err?.message || "Google sign-in failed.");
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow-xl">
      {/* Fix: explicit text color + layout so it never renders "blank" */}
      <button
        type="button"
        onClick={handleGoogleLogin}
        disabled={loading}
        className="w-full mb-4 py-3 bg-white border rounded-xl font-bold text-slate-900 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-3"
        aria-label="Continue with Google"
      >
        {/* Simple Google mark (no dependency) */}
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path
            fill="#FFC107"
            d="M43.611 20.083H42V20H24v8h11.303C33.747 32.659 29.27 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.047 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
          />
          <path
            fill="#FF3D00"
            d="M6.306 14.691l6.571 4.819C14.655 16.108 19.01 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.047 6.053 29.268 4 24 4c-7.682 0-14.408 4.33-17.694 10.691z"
          />
          <path
            fill="#4CAF50"
            d="M24 44c5.166 0 9.86-1.977 13.409-5.197l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.249 0-9.712-3.317-11.267-7.946l-6.523 5.025C9.45 39.556 16.227 44 24 44z"
          />
          <path
            fill="#1976D2"
            d="M43.611 20.083H42V20H24v8h11.303c-.746 2.198-2.142 4.071-3.984 5.565l.003-.002 6.19 5.238C36.971 39.084 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
          />
        </svg>
        <span>{loading ? "Redirecting…" : "Continue with Google"}</span>
      </button>

      <form onSubmit={handleAuth} className="space-y-3">
        <input
          type="email"
          placeholder="Email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-3 border rounded"
        />

        <input
          type="password"
          placeholder="Password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-3 border rounded"
        />

        {error && <div className="text-red-600 text-sm">{error}</div>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-black text-white rounded disabled:opacity-60"
        >
          {isSignUp ? "Create Account" : "Sign In"}
        </button>
      </form>

      <button
        type="button"
        className="mt-4 text-xs underline"
        onClick={() => setIsSignUp(!isSignUp)}
        disabled={loading}
      >
        {isSignUp ? "Already have an account?" : "Need an account?"}
      </button>
    </div>
  );
};
