// supabase/functions/mileage/index.ts
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });

  try {
    const { start, end } = await req.json().catch(() => ({} as any));

    if (!start || !end) {
      return json({ miles: null, error: "MISSING_START_OR_END", raw: null }, 400);
    }

    const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!apiKey) {
      return json({ miles: null, error: "MISSING_GOOGLE_MAPS_API_KEY", raw: null }, 500);
    }

    // Distance Matrix (driving)
    const url =
      "https://maps.googleapis.com/maps/api/distancematrix/json" +
      `?origins=${encodeURIComponent(start)}` +
      `&destinations=${encodeURIComponent(end)}` +
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
          error: status ? `GOOGLE_DISTANCE_STATUS_${status}` : "GOOGLE_DISTANCE_NO_ELEMENT",
          raw,
        },
        200
      );
    }

    const meters = element?.distance?.value; // meters
    if (typeof meters !== "number" || !isFinite(meters)) {
      return json({ miles: null, error: "NO_DISTANCE_METERS", raw }, 200);
    }

    const miles = Number(metersToMiles(meters).toFixed(1));
    return json({ miles, error: null, raw }, 200);
  } catch (e: any) {
    return json({ miles: null, error: e?.message ?? "UNKNOWN_ERROR", raw: null }, 500);
  }
});
