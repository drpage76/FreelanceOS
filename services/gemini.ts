
import { GoogleGenAI } from "@google/genai";
import { AppState } from "../types";

const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === "undefined") {
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

// Fixed: calculateDrivingDistance revised to strictly pull the fastest numerical distance from Maps grounding
export const calculateDrivingDistance = async (start: string, end: string) => {
  const ai = getAIClient();
  if (!ai) return { miles: null, sources: [], error: "AI Key Missing" };

  const model = "gemini-2.5-flash"; 
  // Ultra-specific prompt to minimize verbose text
  const prompt = `Task: Calculate the fastest driving distance in miles between UK postcodes "${start}" and "${end}" using Google Maps. 
  Output Rule: Your response must include the number of miles clearly. For example: "Distance: 12.5 miles".`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: { latitude: 51.5074, longitude: -0.1278 }
          }
        }
      },
    });

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const text = response.text || "";
    
    // Improved regex to find the first number that might be the distance
    // It looks for decimals or integers.
    const match = text.match(/(\d+(\.\d+)?)/);
    const miles = match ? parseFloat(match[0]) : null;

    return {
      miles: miles,
      sources: groundingChunks || []
    };
  } catch (error) {
    console.error("Mileage Protocol Error:", error);
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
          type: "OBJECT" as any,
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
