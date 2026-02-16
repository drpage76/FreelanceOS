import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabase } from "../services/db";

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const run = async () => {
      const client = getSupabase();
      if (!client) {
        document.body.innerText = "Supabase client not available.";
        return;
      }

      // In HashRouter, OAuth arrives like:
      // https://freelanceos.org/?code=XXXX#/auth/callback
      // so the code is in window.location.search
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      if (!code) {
        document.body.innerText = "No code found in callback URL.";
        return;
      }

      try {
        const { error } = await client.auth.exchangeCodeForSession(code);
        if (error) throw error;

        const { data } = await client.auth.getSession();
        if (!data.session) throw new Error("Session not created");

        // Clean URL: remove ?code=... but keep hash routing
        window.history.replaceState({}, document.title, "/#/auth/callback");

        // Go somewhere that is definitely "inside" the app
        navigate("/dashboard", { replace: true });
      } catch (e: any) {
        document.body.innerText = `OAuth failed: ${e?.message || "Unknown error"}`;
      }
    };

    run();
  }, [navigate]);

  return <div className="p-10">Signing you in…</div>;
}
