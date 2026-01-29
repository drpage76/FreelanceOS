
import { GoogleGenAI } from "@google/genai";
import { AppState } from "../types";

const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === "undefined") {
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

// Fix: calculateDrivingDistance updated to comply with Google Maps grounding rules (no responseMimeType/responseSchema)
export const calculateDrivingDistance = async (start: string, end: string) => {
  const ai = getAIClient();
  if (!ai) return { miles: null, sources: [], error: "AI Key Missing" };

  const model = "gemini-2.5-flash"; 
  // Refined prompt to get a clear distance in text
  const prompt = `Find the fastest driving distance in miles between UK postcodes "${start}" and "${end}" using Google Maps. 
  Please state the total distance clearly in miles. For example: "The distance is 15.4 miles".`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        // responseMimeType and responseSchema are NOT allowed when using the googleMaps tool per guidelines
        toolConfig: {
          retrievalConfig: {
            latLng: { latitude: 51.5074, longitude: -0.1278 }
          }
        }
      },
    });

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const text = response.text || "";
    
    // Robust parsing for distance as we can't use responseSchema with Maps grounding
    // Look for the first number followed by "miles" or just the first decimal/integer number
    const match = text.match(/(\d+(\.\d+)?)/);
    const miles = match ? parseFloat(match[0]) : null;

    return {
      miles: miles,
      sources: groundingChunks || []
    };
  } catch (error) {
    console.error("Mileage AI Error:", error);
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
          type: "OBJECT" as any, // Schema types are strictly enum or string in some contexts, but following instructions
          properties: {
            description: { type: "STRING" as any },
            location: { type: "STRING" as any },
            startDate: { type: "STRING" as any },
            endDate: { type: "STRING" as any },
            suggestedItems: {
              type: "ARRAY" as any,
              items: {
                type: "OBJECT" as any,
                properties: {
                  description: { type: "STRING" as any },
                  qty: { type: "NUMBER" as any },
                  unitPrice: { type: "NUMBER" as any }
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
