
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
 * Strictly optimized to return a clean numeric value for the UI.
 */
export const calculateDrivingDistance = async (start: string, end: string, country: string = "United Kingdom") => {
  const ai = getAIClient();
  if (!ai) return { miles: null, error: "AI Key Missing" };

  const model = "gemini-2.5-flash"; 
  
  // High-intensity prompt designed to force a numeric response from the grounding tool
  const prompt = `CRITICAL: Use Google Maps to find the shortest driving distance between these two locations.
  
  LOCATIONS:
  - From: "${start}"
  - To: "${end}"
  - Territory: "${country}"

  REQUIRED OUTPUT:
  Respond ONLY with the numeric distance in MILES. 
  Example: "14.2"
  
  RULES:
  - If Google Maps returns KM, convert to miles (multiply by 0.621371).
  - Do NOT include text, units, or explanations.
  - Just the number.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            // Provide a hint for the region to improve map grounding accuracy
            latLng: { latitude: 51.5074, longitude: -0.1278 } 
          }
        }
      },
    });

    const text = response.text?.trim() || "";
    // Aggressive regex to strip anything that isn't a number or decimal point
    const cleanedText = text.replace(/[^0-9.]/g, '');
    const miles = parseFloat(cleanedText);

    console.debug("Grounding Protocol:", { input: { start, end }, output: text, parsed: miles });

    return {
      miles: (!isNaN(miles) && miles > 0) ? miles : null,
      sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
    };
  } catch (error) {
    console.error("Mileage Protocol Error:", error);
    return { miles: null, error: "Network or Protocol Failure" };
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
