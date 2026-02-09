// src/pages/Mileage.tsx
import React, { useMemo, useState } from "react";
import { calculateDrivingDistance } from "../lib/gemini";

export default function Mileage() {
  const [start, setStart] = useState("WV3 8DA");
  const [end, setEnd] = useState("E16 1XL");
  const [country, setCountry] = useState("United Kingdom");

  const [baseMiles, setBaseMiles] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [trips, setTrips] = useState<number>(1);
  const [isReturn, setIsReturn] = useState<boolean>(false);

  const multiplier = useMemo(() => {
    const t = Math.max(1, Number(trips) || 1);
    return t * (isReturn ? 2 : 1);
  }, [trips, isReturn]);

  const totalMiles = useMemo(() => {
    if (!baseMiles) return 0;
    return Number((baseMiles * multiplier).toFixed(1));
  }, [baseMiles, multiplier]);

  async function handleCalculate() {
    setLoading(true);
    setErr(null);
    try {
      const res = await calculateDrivingDistance(start, end, country);
      if (!res.miles) {
        setBaseMiles(null);
        setErr(res.error || "NO_DISTANCE_RETURNED");
      } else {
        setBaseMiles(res.miles);
      }
    } catch (e: any) {
      setBaseMiles(null);
      setErr(e?.message || "UNKNOWN_ERROR");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 16, maxWidth: 720, margin: "0 auto" }}>
      <h2>Mileage</h2>

      <label>Start point</label>
      <input
        value={start}
        onChange={(e) => setStart(e.target.value)}
        style={{ width: "100%", padding: 12, margin: "6px 0 16px" }}
      />

      <label>End point</label>
      <input
        value={end}
        onChange={(e) => setEnd(e.target.value)}
        style={{ width: "100%", padding: 12, margin: "6px 0 16px" }}
      />

      <label>Country</label>
      <input
        value={country}
        onChange={(e) => setCountry(e.target.value)}
        style={{ width: "100%", padding: 12, margin: "6px 0 16px" }}
      />

      <button
        onClick={handleCalculate}
        disabled={loading}
        style={{ padding: 12, width: "100%", marginBottom: 16 }}
      >
        {loading ? "Calculating..." : "Calculate distance"}
      </button>

      <div style={{ border: "1px solid #ddd", padding: 12, borderRadius: 10 }}>
        <div style={{ fontSize: 12, opacity: 0.7 }}>Single leg (base)</div>
        <div style={{ fontSize: 32, fontWeight: 700 }}>
          {baseMiles ? baseMiles.toFixed(1) : "0.0"}
        </div>
        {err && <div style={{ color: "crimson", marginTop: 6 }}>{err}</div>}
      </div>

      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Trips</div>
          <input
            type="number"
            min={1}
            value={trips}
            onChange={(e) => setTrips(parseInt(e.target.value || "1", 10))}
            style={{ width: "100%", padding: 12 }}
          />
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Return?</div>
          <button
            onClick={() => setIsReturn((v) => !v)}
            style={{ width: "100%", padding: 12 }}
          >
            {isReturn ? "YES" : "NO"}
          </button>
        </div>
      </div>

      <div style={{ marginTop: 16, border: "1px solid #ddd", padding: 12, borderRadius: 10 }}>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          Total miles (base × trips × return)
        </div>
        <div style={{ fontSize: 28, fontWeight: 700 }}>
          {totalMiles.toFixed(1)} mi
        </div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>
          multiplier: {multiplier}×
        </div>
      </div>
    </div>
  );
}
