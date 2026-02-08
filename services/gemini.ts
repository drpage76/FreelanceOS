import { GoogleGenAI, Type } from "@google/genai";

/**
 * IMPORTANT (Vite + GitHub Actions):
 * - Set a GitHub Actions secret named: VITE_GEMINI_API_KEY
 * - Inject it into the build step in deploy.yml
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
 * Robust parsing to reduce NO_DISTANCE_RETURNED.
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

Return the answer as:
DISTANCE_VALUE: [number in miles]

If the distance is in km, convert to miles using miles = km * 0.621371.

Return ONLY the line starting with DISTANCE_VALUE.
`.trim();

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            // UK-ish centroid; helps grounding relevance
            latLng: { latitude: 52.3555, longitude: -1.1743 }
          }
        }
      }
    });

    const text = (response.text || "").trim();

    // 1) Preferred: DISTANCE_VALUE: xx.x
    const tagged = text.match(/DISTANCE_VALUE:\s*([0-9]+(?:\.[0-9]+)?)/i);
    if (tagged) {
      const miles = parseFloat(tagged[1]);
      return {
        miles: miles > 0 ? miles : null,
        sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
      };
    }

    // 2) Look for "xx mi/miles"
    const miMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(mi|miles)\b/i);
    if (miMatch) {
      const miles = parseFloat(miMatch[1]);
      return {
        miles: miles > 0 ? miles : null,
        sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
      };
    }

    // 3) Look for "xx km" and convert
    const kmMatch = text.match(/([0-9]+(?:\.[0-9]+)?)\s*(km|kilometers|kilometres)\b/i);
    if (kmMatch) {
      const km = parseFloat(kmMatch[1]);
      const miles = km * 0.621371;
      return {
        miles: miles > 0 ? miles : null,
        sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
      };
    }

    // 4) Last resort: pick the largest plausible number
    const nums = (text.match(/[0-9]+(?:\.[0-9]+)?/g) || [])
      .map(n => parseFloat(n))
      .filter(n => !isNaN(n) && n >= 1 && n <= 1000);

    const best = nums.length ? Math.max(...nums) : null;

    if (!best) {
      console.warn("❌ NO_DISTANCE_RETURNED. Raw text:", text);
      return { miles: null, error: "NO_DISTANCE_RETURNED" };
    }

    return {
      miles: best,
      sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
    };
  } catch (err: any) {
    console.error("❌ Mileage Protocol Error:", err);
    return { miles: null, error: err?.message || "PROTOCOL_FAILURE" };
  }
};

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
