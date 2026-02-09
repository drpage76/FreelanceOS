// src/lib/gemini.ts
import { supabase } from "../supabaseClient";

export type DrivingDistanceResult = {
  miles: number | null;
  error?: string | null;
  raw?: string;
};

export async function calculateDrivingDistance(
  start: string,
  end: string,
  country: string = "United Kingdom"
): Promise<DrivingDistanceResult> {
  const { data, error } = await supabase.functions.invoke("mileage", {
    body: { start, end, country },
  });

  if (error) {
    return { miles: null, error: error.message || "EDGE_FUNCTION_ERROR" };
  }

  // data is whatever the function returned
  return {
    miles: data?.miles ?? null,
    error: data?.error ?? null,
    raw: data?.raw ?? "",
  };
}
