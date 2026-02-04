import { GoogleGenAI, Type } from "@google/genai";

/**
 * IMPORTANT FOR VITE:
 * - Use import.meta.env instead of process.env
 * - You should define VITE_GEMINI_API_KEY in your .env file
 *   e.g. VITE_GEMINI_API_KEY=xxxxx
 */
const getEnv = (key: string): string | undefined => {
  // Works in Vite
  const v = (import.meta as any)?.env?.[key];
  return typeof v === "string" ? v : undefined;
};

const getAIClient = () => {
  const apiKey = "PASTE_YOUR_GEMINI_KEY_HERE";
  if (!apiKey || apiKey === "undefined") return null;
  return new GoogleGenAI({ apiKey });
};

// Simple timeout wrapper
const withTimeout = async <T>(p: Promise<T>, ms: number): Promise<T> => {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)),
  ]);
};

/**
 * Calculates driving distance using Google Maps tool grounding.
 * Returns miles as a number, or null with an error string.
 */
export const calculateDrivingDistance = async (start: string, end: string) => {
  const ai = getAIClient();
  if (!ai) return { miles: null as number | null, sources: [] as any[], error: "AI Key Missing" };

  const model = "gemini-2.5-flash";
  const prompt = `Task: Use Google Maps tool to determine the driving distance in MILES between UK postcodes "${start}" and "${end}".
CRITICAL: Your entire response must consist of exactly one decimal number representing the miles.
Do NOT use markdown. Do NOT include the word "miles". Do NOT explain.
Example valid response: 14.8`;

  try {
    const response = await withTimeout(
      ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          tools: [{ googleMaps: {} }],
          toolConfig: {
            retrievalConfig: {
              latLng: { latitude: 51.5074, longitude: -0.1278 }, // London reference
            },
          },
        },
      }),
      15000
    );

    const text = response.text?.trim() || "";

    // Extract first plausible number:
    // - handles "14.8", "14,8", "14.8 mi", etc.
    const normalized = text.replace(",", ".");
    const match = normalized.match(/(\d+(\.\d+)?)/);
    const miles = match ? Number(match[1]) : null;

    const parsedMiles = Number.isFinite(miles as any) && (miles as number) > 0 ? (miles as number) : null;

    return {
      miles: parsedMiles,
      sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || [],
      error: parsedMiles ? undefined : `Could not parse miles from response: "${text}"`,
    };
  } catch (error: any) {
    console.error("Mileage AI Protocol Error:", error);
    return {
      miles: null,
      sources: [],
      error: error?.message || "Mileage lookup failed",
    };
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
                  unitPrice: { type: Type.NUMBER },
                },
              },
            },
          },
        },
      },
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("smartExtractJob error:", error);
    return null;
  }
};
