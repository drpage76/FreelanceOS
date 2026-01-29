import { GoogleGenAI } from "@google/genai";
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
  const prompt = `Task: Find the fastest driving distance in miles between UK postcodes "${start}" and "${end}" using Google Maps. 
  Rule: Your response MUST contain the phrase "Distance: [number] miles". 
  Example: "Distance: 12.5 miles". 
  Do not provide extra conversation.`;

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

    const text = response.text || "";
    // Regex isolates the first decimal or integer found in the text
    const match = text.match(/(\d+(\.\d+)?)/);
    const miles = match ? parseFloat(match[0]) : null;

    return {
      miles: miles,
      sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
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