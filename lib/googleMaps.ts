// lib/googleMaps.ts

export type GoogleMapsDistanceResult = {
  miles: number | null;
  error?: string | null;
  raw?: any;
};

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

function assertEnv() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      "Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Check .env and restart Vite."
    );
  }
}

export async function getDrivingDistanceFromGoogleMaps(
  start: string,
  end: string
): Promise<GoogleMapsDistanceResult> {
  try {
    assertEnv();

    const res = await fetch(`${SUPABASE_URL}/functions/v1/mileage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // These two are the important bits:
        apikey: SUPABASE_ANON_KEY!,
        Authorization: `Bearer ${SUPABASE_ANON_KEY!}`,
      },
      body: JSON.stringify({ start, end }),
    });

    const text = await res.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { rawText: text }; }

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
