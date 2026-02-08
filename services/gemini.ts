
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
export const calculateDrivingDistance = async (start: string, end: string, country: string = "United Kingdom") => {
  const ai = getAIClient();
  if (!ai) return { miles: null, sources: [], error: "AI Key Missing" };

  const model = "gemini-2.5-flash"; 
  // Refined prompt to explicitly trigger Google Maps grounding for accurate distance retrieval
  const prompt = `Use Google Maps to find the shortest driving distance between these locations in ${country}: 
  From: "${start}"
  To: "${end}"
  
  Return ONLY the numeric value in MILES (e.g., 12.4). If the distance is in kilometers, convert it to miles (1 km = 0.621371 miles). 
  Respond with only the number, no text.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            // Defaulting to a central point if needed, but the prompt is primary
            latLng: { latitude: 51.5074, longitude: -0.1278 } 
          }
        }
      },
    });

    const text = response.text?.trim() || "";
    // Robust extraction: matches the first occurrence of a digit-based number
    const match = text.replace(/,/g, '').match(/(\d+(\.\d+)?)/);
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
