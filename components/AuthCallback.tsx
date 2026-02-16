import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabase } from "../services/db";

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const run = async () => {
      const client = getSupabase();
      if (!client) return;

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

        // Clear URL junk
        window.history.replaceState({}, "", "/#/");

        navigate("/", { replace: true });
      } catch (e: any) {
        document.body.innerText = `OAuth failed: ${e.message}`;
      }
    };

    run();
  }, [navigate]);

  return <div className="p-10">Signing you in…</div>;
}
