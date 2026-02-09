import { GoogleGenAI, Type } from "@google/genai";

/**
 * Vite + GitHub Actions:
 * - Add GitHub secret: VITE_GEMINI_API_KEY
 * - Inject into build step in deploy.yml
 */
const getAIClient = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

  if (!apiKey || apiKey === "undefined") {
    console.error("❌ Gemini API key missing (VITE_GEMINI_API_KEY)");
    return null;
  }

  return new GoogleGenAI({ apiKey });
};

/**
 * Calculates driving distance using Gemini + Google Maps grounding.
 * Uses JSON schema output to avoid flaky text parsing.
 */
export const calculateDrivingDistance = async (
  start: string,
  end: string,
  country: string = "United Kingdom"
) => {
  const ai = getAIClient();
  if (!ai) return { miles: null, error: "AI_KEY_MISSING" };

  const model = "gemini-2.5-flash";

  const prompt = `
Use Google Maps to calculate the shortest driving distance.

FROM: "${start}"
TO: "${end}"
REGION: "${country}"

Return JSON ONLY with:
{ "miles": number }

If the distance is in km, convert to miles using miles = km * 0.621371.
`.trim();

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            // UK-ish centroid for grounding relevance
            latLng: { latitude: 52.3555, longitude: -1.1743 }
          }
        },
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            miles: { type: Type.NUMBER }
          },
          required: ["miles"]
        }
      }
    });

    const raw = (response.text || "").trim();

    if (!raw) {
      console.warn("❌ EMPTY_RESPONSE from Gemini (response.text was blank).");
      return { miles: null, error: "EMPTY_RESPONSE" };
    }

    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      console.warn("❌ JSON_PARSE_FAILED. Raw:", raw);
      return { miles: null, error: "JSON_PARSE_FAILED" };
    }

    const miles = typeof data?.miles === "number" ? data.miles : null;

    if (!miles || isNaN(miles) || miles <= 0) {
      console.warn("❌ NO_DISTANCE_RETURNED. Parsed:", miles, "Raw:", raw);
      return { miles: null, error: "NO_DISTANCE_RETURNED" };
    }

    return {
      miles,
      sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
    };
  } catch (err: any) {
    console.error("❌ Mileage Protocol Error:", err);
    return { miles: null, error: err?.message || "PROTOCOL_FAILURE" };
  }
};

/**
 * Smart Job Extraction (kept, using same key handling)
 */
export const smartExtractJob = async (rawText: string) => {
  const ai = getAIClient();
  if (!ai) return null;

  const model = "gemini-3-flash-preview";
  const prompt = `Extract project details from: "${rawText}"`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            description: { type: Type.STRING },
            location: { type: Type.STRING },
            startDate: { type: Type.STRING },
            endDate: { type: Type.STRING },
            suggestedItems: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  description: { type: Type.STRING },
                  qty: { type: Type.NUMBER },
                  unitPrice: { type: Type.NUMBER }
                }
              }
            }
          }
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("❌ smartExtractJob failed:", error);
    return null;
  }
};
