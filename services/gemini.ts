
import { GoogleGenAI, Type } from "@google/genai";
import { AppState } from "../types";

const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === "undefined") {
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * Calculates driving distance using Google Maps grounding.
 */
export const calculateDrivingDistance = async (start: string, end: string) => {
  const ai = getAIClient();
  if (!ai) return { miles: null, sources: [], error: "AI Key Missing" };

  const model = "gemini-2.5-flash"; 
  const prompt = `Calculate the direct shortest driving distance in MILES between UK postcodes "${start}" and "${end}". 
  Your response MUST contain the numeric distance (e.g. 15.5). 
  Only provide the number. Do not say "The distance is...".`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: { latitude: 51.5074, longitude: -0.1278 } // Center for UK
          }
        }
      },
    });

    const text = response.text?.trim() || "";
    // Robust extraction: matches the first occurrence of a digit-based number
    const match = text.match(/(\d+(\.\d+)?)/);
    const miles = match ? parseFloat(match[0]) : null;

    console.debug("Grounding Protocol Result:", text, "Extracted Miles:", miles);

    return {
      miles: (miles !== null && !isNaN(miles) && miles > 0) ? miles : null,
      sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
    };
  } catch (error) {
    console.error("Mileage AI Protocol Error:", error);
    return { miles: null, sources: [] };
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
    return JSON.parse(response.text || '{}');
  } catch (error) {
    return null;
  }
};
