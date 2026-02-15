// lib/googleMaps.ts
import { supabase } from "./supabaseClient";

export type GoogleMapsDistanceResult = {
  miles: number | null;
  error?: string | null;
  raw?: any;
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;

function assertEnv() {
  if (!SUPABASE_URL) {
    throw new Error("Missing VITE_SUPABASE_URL. Check .env and restart Vite.");
  }
}

export async function getDrivingDistanceFromGoogleMaps(
  start: string,
  end: string
): Promise<GoogleMapsDistanceResult> {
  try {
    assertEnv();

    // ✅ Get the signed-in user's access token
    const { data: sessData, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) {
      return { miles: null, error: `SESSION_ERROR_${sessErr.message}`, raw: sessErr };
    }

    const accessToken = sessData?.session?.access_token;
    if (!accessToken) {
      return { miles: null, error: "NO_SESSION_TOKEN" };
    }

    // ✅ Call the Edge Function directly, with the USER token as Bearer
    const res = await fetch(`${SUPABASE_URL}/functions/v1/mileage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ start, end }),
    });

    const text = await res.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { rawText: text };
    }

    if (!res.ok) {
      return {
        miles: null,
        error: `EDGE_${res.status}_${res.statusText}`,
        raw: data,
      };
    }

    const miles = typeof data?.miles === "number" ? data.miles : null;
    const err = data?.error ?? null;

    if (miles === null || err) {
      return { miles: null, error: err || "NO_DISTANCE_RETURNED", raw: data?.raw ?? data };
    }

    return { miles, error: null, raw: data?.raw ?? data };
  } catch (e: any) {
    return { miles: null, error: e?.message || "UNKNOWN_ERROR", raw: null };
  }
}
