// lib/mileage.ts
import { getDrivingDistanceFromGoogleMaps } from "./googleMaps";

export type MileageResult = {
  miles: number | null;
  error?: string | null;
  baseMiles?: number | null;
};

export async function calculateMileage(
  start: string,
  end: string,
  trips = 1,
  isReturn = false
): Promise<MileageResult> {
  const { miles: baseMiles, error } = await getDrivingDistanceFromGoogleMaps(start, end);

  if (!baseMiles || error) {
    return { miles: null, baseMiles: null, error: error || "NO_DISTANCE_RETURNED" };
  }

  const safeTrips = Math.max(1, Number(trips) || 1);
  const multiplier = safeTrips * (isReturn ? 2 : 1);

  const total = Number((baseMiles * multiplier).toFixed(1));

  return { miles: total, baseMiles: Number(baseMiles.toFixed(1)), error: null };
}
