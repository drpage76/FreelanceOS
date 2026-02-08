import { GoogleGenAI, Type } from "@google/genai";

/**
 * IMPORTANT:
 * Gemini key must be provided at build time via:
 *
 *   VITE_GEMINI_API_KEY
 *
 * (GitHub Actions -> Secrets -> VITE_GEMINI_API_KEY)
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
 * Calculates driving distance using Gemini + Google Maps grounding
 */
export const calculateDrivingDistance = async (
  start: string,
  end: string,
  country: string = "United Kingdom"
) => {
  const ai = getAIClient();

  if (!ai) {
    return {
      miles: null,
      error: "AI_KEY_MISSING"
    };
  }

  const model = "gemini-2.5-flash";

  const prompt = `
CRITICAL SYSTEM INSTRUCTION:
Use Google Maps to calculate the shortest driving distance.

FROM: "${start}"
TO: "${end}"
REGION: "${country}"

Return ONLY:

DISTANCE_VALUE: [number]

Example:
DISTANCE_VALUE: 12.4
`;

  try {
    console.log("[Mileage] Calculating distance:", { start, end, country });

    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: { latitude: 52.3555, longitude: -1.1743 }
          }
        }
      }
    });

    const text = response.text || "";

    // Extract numeric value
    const match = text.match(/DISTANCE_VALUE:\s*(\d+(\.\d+)?)/i);

    if (!match) {
      console.warn("❌ Mileage parse failed:", text);
      return {
        miles: null,
        error: "NO_DISTANCE_RETURNED"
      };
    }

    const miles = parseFloat(match[1]);

    if (!miles || isNaN(miles)) {
      return {
        miles: null,
        error: "INVALID_DISTANCE"
      };
    }

    console.log("✅ Mileage result:", miles);

    return {
      miles,
      sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
    };

  } catch (err: any) {
    console.error("❌ Gemini mileage protocol error:", err);

    return {
      miles: null,
      error: err?.message || "PROTOCOL_FAILURE"
    };
  }
};

/**
 * Smart Job Extraction (unchanged except for key handling)
 */
export const smartExtractJob = async (rawText: string) => {
  const ai = getAIClient();
  if (!ai) return null;

  const model = "gemini-3-flash-preview";

  try {
    const response = await ai.models.generateContent({
      model,
      contents: `Extract project details from: "${rawText}"`,
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

  } catch (err) {
    console.error("❌ smartExtractJob failed:", err);
    return null;
  }
};
