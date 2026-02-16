import React, { useEffect, useState } from "react";
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

  useEffect(() => {
    setIsSignUp(initialIsSignUp);
  }, [initialIsSignUp]);

  // Auto-enter app if session already exists
  useEffect(() => {
    const client = getSupabase();
    if (!client) return;

    (async () => {
      const { data } = await client.auth.getSession();
      if (data.session) onSuccess();
    })();

    const { data } = client.auth.onAuthStateChange((_e, session) => {
      if (session) onSuccess();
    });

    return () => data.subscription.unsubscribe();
  }, [onSuccess]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const client = getSupabase();
    if (!client) return;

    try {
      if (isSignUp) {
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
        onSuccess();
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
    if (!client) return;

    try {
      const redirectTo = `${window.location.origin}/#/auth/callback`;

      await client.auth.signInWithOAuth({
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
    } catch (err: any) {
      setError(err?.message || "OAuth failed.");
      setLoading(false);
    }
  };

  return (
    <div className="p-6 bg-white rounded-xl shadow-xl">
      <button
        onClick={handleGoogleLogin}
        disabled={loading}
        className="w-full mb-4 py-3 bg-white border rounded-xl font-bold"
      >
        Continue with Google
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
          className="w-full py-3 bg-black text-white rounded"
        >
          {isSignUp ? "Create Account" : "Sign In"}
        </button>
      </form>

      <button
        className="mt-4 text-xs underline"
        onClick={() => setIsSignUp(!isSignUp)}
      >
        {isSignUp ? "Already have an account?" : "Need an account?"}
      </button>
    </div>
  );
};
