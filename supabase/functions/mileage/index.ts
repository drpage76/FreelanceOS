/// <reference types="jsr:@supabase/functions-js/edge-runtime.d.ts" />

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function metersToMiles(meters: number) {
  return meters / 1609.344;
}
function metersToKm(meters: number) {
  return meters / 1000;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  try {
    // --- Manual auth (secure) ---
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    if (!supabaseUrl || !serviceRoleKey) {
      return json({ miles: null, km: null, error: "MISSING_SUPABASE_ENV" }, 500);
    }

    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.toLowerCase().startsWith("bearer ")
      ? authHeader.slice(7).trim()
      : "";

    if (!token) {
      return json({ miles: null, km: null, error: "MISSING_AUTH_TOKEN" }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    const { data: userData, error: userErr } = await admin.auth.getUser(token);

    if (userErr || !userData?.user) {
      return json(
        { miles: null, km: null, error: "INVALID_AUTH_TOKEN", raw: userErr?.message ?? null },
        401
      );
    }

    // --- Body ---
    const body = await req.json().catch(() => ({} as any));
    const from = (body?.origin ?? body?.start ?? "").toString().trim();
    const to = (body?.destination ?? body?.end ?? "").toString().trim();

    if (!from || !to) {
      return json(
        { miles: null, km: null, error: "MISSING_ORIGIN_OR_DESTINATION", raw: body },
        400
      );
    }

    // --- Google Maps ---
    const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!apiKey) {
      return json({ miles: null, km: null, error: "MISSING_GOOGLE_MAPS_API_KEY" }, 500);
    }

    const url =
      "https://maps.googleapis.com/maps/api/distancematrix/json" +
      `?origins=${encodeURIComponent(from)}` +
      `&destinations=${encodeURIComponent(to)}` +
      `&mode=driving` +
      `&units=imperial` +
      `&key=${encodeURIComponent(apiKey)}`;

    const r = await fetch(url);
    const raw = await r.json();

    const element = raw?.rows?.[0]?.elements?.[0];
    const status = element?.status;

    if (!element || status !== "OK") {
      return json(
        {
          miles: null,
          km: null,
          error: status ? `GOOGLE_DISTANCE_STATUS_${status}` : "GOOGLE_DISTANCE_NO_ELEMENT",
          raw,
        },
        200
      );
    }

    const meters = element?.distance?.value;
    if (typeof meters !== "number" || !isFinite(meters)) {
      return json({ miles: null, km: null, error: "NO_DISTANCE_METERS", raw }, 200);
    }

    const miles = Number(metersToMiles(meters).toFixed(1));
    const km = Number(metersToKm(meters).toFixed(1));

    return json({ miles, km, error: null }, 200);
  } catch (e: any) {
    return json({ miles: null, km: null, error: e?.message ?? "UNKNOWN_ERROR" }, 500);
  }
});
