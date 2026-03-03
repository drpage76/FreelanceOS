import React, { useEffect, useMemo, useState } from "react";
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

  // Keep hash routes, but strip query params like ?code=...
  const cleanUrlParams = () => {
    const cleanUrl = window.location.origin + window.location.pathname + (window.location.hash || "#/");
    window.history.replaceState({}, document.title, cleanUrl);
  };

  // ✅ IMPORTANT: Always return to the SAME origin you started on
  // localhost -> localhost, live -> live. Do NOT hardcode domains.
  // Also: don't include hash in redirectTo because OAuth providers drop it.
  const redirectTo = useMemo(() => {
    return window.location.origin + window.location.pathname; // e.g. http://localhost:5173/
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!cancelled && data?.session) {
          cleanUrlParams();
          onSuccess();
        }
      } catch {
        // ignore
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN") {
        cleanUrlParams();
        onSuccess();
      }
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

      // onAuthStateChange will call onSuccess()
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
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          scopes: [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/calendar.events",
            "https://www.googleapis.com/auth/calendar.readonly",
            "https://www.googleapis.com/auth/drive.file",
          ].join(" "),
          queryParams: {
            access_type: "offline",
            prompt: "consent",
          },
        },
      });

      if (error) throw error;
      // browser will redirect away
    } catch (e: any) {
      setError(e?.message || "OAuth failed");
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <div className="mb-4">
        <h2 className="text-white text-xl font-black tracking-tight">
          {isSignUp ? "Create account" : "Sign in"}
        </h2>
        <p className="text-slate-400 text-xs font-bold mt-1">
          Use email/password or Google.
        </p>
      </div>

      {error && (
        <div className="mb-4 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-200 text-xs font-bold p-3 whitespace-pre-wrap">
          {error}
        </div>
      )}

      <div className="grid gap-3">
        <input
          className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white placeholder:text-slate-500 text-sm font-semibold outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          autoComplete="email"
          disabled={loading}
        />

        <input
          className="w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-white placeholder:text-slate-500 text-sm font-semibold outline-none focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-500/20"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          type="password"
          autoComplete={isSignUp ? "new-password" : "current-password"}
          disabled={loading}
        />

        <button
          type="button"
          onClick={handleEmailAuth}
          disabled={loading}
          className="w-full px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white text-xs font-black uppercase tracking-widest shadow-xl shadow-indigo-500/20 transition-all"
        >
          {loading ? "Please wait…" : isSignUp ? "Register" : "Sign In"}
        </button>

        <div className="flex items-center gap-3 py-1">
          <div className="flex-1 h-px bg-white/10" />
          <span className="text-slate-500 text-[10px] font-black uppercase tracking-widest">or</span>
          <div className="flex-1 h-px bg-white/10" />
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-60 text-white text-xs font-black uppercase tracking-widest border border-white/10 transition-all"
        >
          Continue with Google
        </button>

        <button
          type="button"
          onClick={() => setIsSignUp((s) => !s)}
          disabled={loading}
          className="text-indigo-400 hover:text-indigo-300 text-xs font-black tracking-wide text-left disabled:opacity-60"
        >
          {isSignUp ? "Already have an account? Sign in" : "No account? Register"}
        </button>
      </div>

      <div className="mt-4 text-[10px] text-slate-500 font-bold">
        Redirect target: <span className="text-slate-400">{redirectTo}</span>
      </div>
    </div>
  );
};