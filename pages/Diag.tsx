// src/pages/Diag.tsx
import React, { useEffect, useState } from "react";
import { DB, getSupabase } from "../services/db";

export const Diag: React.FC = () => {
  const [cloudConfigured, setCloudConfigured] = useState<boolean>(false);
  const [sessionEmail, setSessionEmail] = useState<string>("(checking...)");
  const [tenantId, setTenantId] = useState<string>("(checking...)");

  useEffect(() => {
    const run = async () => {
      setCloudConfigured(DB.isCloudConfigured());

      try {
        const { data } = await getSupabase().auth.getSession();
        setSessionEmail(data?.session?.user?.email || "(no session)");
      } catch (e: any) {
        setSessionEmail(`(error) ${e?.message || e}`);
      }

      try {
        const t = await DB.getTenantId();
        setTenantId(t || "(null)");
      } catch (e: any) {
        setTenantId(`(error) ${e?.message || e}`);
      }
    };
    run();
  }, []);

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6">
      <h1 className="text-2xl font-black">FreelanceOS Diagnostics</h1>
      <div className="mt-6 space-y-3 text-sm">
        <div><b>DB.isCloudConfigured():</b> {String(cloudConfigured)}</div>
        <div><b>Supabase session email:</b> {sessionEmail}</div>
        <div><b>DB.getTenantId():</b> {tenantId}</div>
      </div>
      <p className="mt-8 text-slate-400 text-xs">
        If CloudConfigured is false on live, your VITE env vars are not present at build time.
      </p>
    </div>
  );
};