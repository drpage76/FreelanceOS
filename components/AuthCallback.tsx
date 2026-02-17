import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { getSupabase } from "../services/db";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [msg, setMsg] = useState("Signing you in…");

  useEffect(() => {
    const run = async () => {
      const supabase = getSupabase();

      // VERY IMPORTANT: code lives BEFORE the hash
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");

      console.log("[AuthCallback] code:", code);

      if (!code) {
        setMsg("Missing OAuth code.");
        return;
      }

      try {
        setMsg("Exchanging code for session…");

        const { data, error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) throw error;

        console.log("[AuthCallback] session:", data?.session);

        if (data?.session) {
          // clean URL
          window.history.replaceState({}, "", "/#/");
          navigate("/", { replace: true });
          return;
        }

        throw new Error("No session returned.");
      } catch (err: any) {
        console.error(err);
        setMsg(`OAuth failed: ${err?.message || "Unknown error"}`);
      }
    };

    run();
  }, [navigate]);

  return <div className="p-10">{msg}</div>;
}
