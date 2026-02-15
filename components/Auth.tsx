import React, { useEffect, useState } from "react";
import { getSupabase } from "../services/db";

interface AuthProps {
  onSuccess: () => void;
  initialIsSignUp?: boolean;
}

/**
 * Auth component (Email/Password + Google OAuth)
 * Fixes common 401 loops by:
 * - Using a stable redirectTo (/#/auth/callback) for HashRouter deployments
 * - Detecting existing session on mount
 * - Listening for auth state changes to auto-advance the app
 */
export const Auth: React.FC<AuthProps> = ({
  onSuccess,
  initialIsSignUp = false,
}) => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSignUp, setIsSignUp] = useState(initialIsSignUp);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsSignUp(initialIsSignUp);
  }, [initialIsSignUp]);

  // ✅ If the user already has a valid session (persisted), go straight in
  useEffect(() => {
    const client = getSupabase();
    if (!client) return;

    let unsub: { data?: { subscription?: { unsubscribe: () => void } } } | null =
      null;

    (async () => {
      try {
        const { data } = await client.auth.getSession();
        if (data?.session) {
          onSuccess();
          return;
        }

        // ✅ If the session is created later (e.g., after OAuth callback),
        // this will fire and we auto-advance.
        unsub = client.auth.onAuthStateChange((_event, session) => {
          if (session) onSuccess();
        });
      } catch (e) {
        // don’t hard-fail UI on session check
      }
    })();

    return () => {
      try {
        unsub?.data?.subscription?.unsubscribe?.();
      } catch {
        // ignore
      }
    };
  }, [onSuccess]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const client = getSupabase();
    if (!client) {
      setError("Cloud connection not configured.");
      setLoading(false);
      return;
    }

    try {
      if (isSignUp) {
        // For email confirmations, give Supabase a safe redirect back into the app
        const emailRedirectTo = `${window.location.origin}/#/auth/callback`;

        const { error } = await client.auth.signUp({
          email,
          password,
          options: { emailRedirectTo },
        });

        if (error) throw error;
        alert("Check your email for the confirmation link!");
      } else {
        const { error } = await client.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;

        onSuccess();
      }
    } catch (err: any) {
      setError(err?.message || "Authentication failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async (e: React.MouseEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const client = getSupabase();
    if (!client) {
      setError("Supabase client failed to initialize.");
      setLoading(false);
      return;
    }

    try {
      // ✅ Always send OAuth back to a known callback route (HashRouter-safe)
      const redirectTo = `${window.location.origin}/#/auth/callback`;

      const { error } = await client.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
          queryParams: {
            prompt: "select_account",
            access_type: "offline",
            // keep your scopes as requested
            scope:
              "openid email profile https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/drive.file",
          },
        },
      });

      if (error) throw error;

      // Note: On success, the browser usually redirects immediately.
      // If it doesn't (popup-blocker etc.), we stop loading after a short delay.
      window.setTimeout(() => setLoading(false), 1500);
    } catch (err: any) {
      console.error("CRITICAL OAUTH ERROR:", err);
      setError(`Auth Error: ${err?.message || "OAuth failed."}`);
      setLoading(false);
    }
  };

  return (
    <div className="w-full bg-white rounded-[40px] shadow-2xl overflow-hidden p-6 md:p-8 border border-slate-100 max-h-full overflow-y-auto">
      <div className="text-center mb-6 md:mb-8">
        <div className="w-12 h-12 md:w-16 md:h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mx-auto mb-4 md:mb-6 shadow-xl shadow-indigo-100">
          <i className="fa-solid fa-bolt text-2xl md:text-3xl"></i>
        </div>
        <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">
          Cloud Workspace
        </h1>
        <p className="text-slate-500 text-[10px] md:text-xs font-medium mt-2">
          {isSignUp
            ? "Establish your professional identity"
            : "Unlock your secure business cloud"}
        </p>
      </div>

      <div className="space-y-4">
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="w-full py-3 md:py-4 bg-white text-slate-700 border border-slate-200 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-50 transition-all flex items-center justify-center gap-3 shadow-sm disabled:opacity-50"
        >
          {loading ? (
            <i className="fa-solid fa-spinner animate-spin text-indigo-600"></i>
          ) : (
            <img
              src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg"
              className="w-4 h-4"
              alt="Google"
            />
          )}
          {loading ? "Handoff..." : "Continue with Google"}
        </button>

        <div className="flex items-center gap-4 py-1 md:py-2">
          <div className="flex-1 h-px bg-slate-100"></div>
          <span className="text-[8px] md:text-[9px] font-black text-slate-300 uppercase tracking-widest">
            or email
          </span>
          <div className="flex-1 h-px bg-slate-100"></div>
        </div>

        <form onSubmit={handleAuth} className="space-y-3 md:space-y-4">
          <div className="space-y-1">
            <label className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest block px-1">
              Email
            </label>
            <input
              type="email"
              required
              className="w-full px-4 py-2.5 md:px-5 md:py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <label className="text-[8px] md:text-[9px] font-black text-slate-400 uppercase tracking-widest block px-1">
              Password
            </label>
            <input
              type="password"
              required
              className="w-full px-4 py-2.5 md:px-5 md:py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600 text-[9px] font-bold flex items-center gap-2 leading-relaxed">
              <i className="fa-solid fa-circle-exclamation shrink-0"></i>
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 md:py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl hover:bg-black transition-all flex items-center justify-center gap-3 disabled:opacity-50"
          >
            {loading && email ? (
              <i className="fa-solid fa-spinner animate-spin"></i>
            ) : null}
            {isSignUp ? "Create Cloud Account" : "Sign Into Cloud"}
          </button>
        </form>
      </div>

      <div className="mt-4 md:mt-6 text-center">
        <button
          type="button"
          onClick={() => setIsSignUp(!isSignUp)}
          className="text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-600 transition-colors"
        >
          {isSignUp ? "Already have a cloud account?" : "Need a new workspace?"}
        </button>
      </div>
    </div>
  );
};
