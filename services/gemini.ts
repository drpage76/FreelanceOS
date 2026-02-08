
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
 * Optimized to strictly separate result from input postcode digits.
 */
export const calculateDrivingDistance = async (start: string, end: string, country: string = "United Kingdom") => {
  const ai = getAIClient();
  if (!ai) return { miles: null, error: "AI Key Missing" };

  const model = "gemini-2.5-flash"; 
  
  // Refined prompt to avoid "number leakage" from postcodes into the final result
  const prompt = `Find the shortest driving distance between these two locations.
  
  LOCATIONS:
  - FROM: "${start}"
  - TO: "${end}"
  - REGION: "${country}"

  TASK:
  Use Google Maps grounding. Calculate the distance in MILES.
  
  RESPONSE FORMAT:
  Your response MUST contain the distance clearly labeled like this: "RESULT: [number]"
  Example: "RESULT: 14.5"
  
  RULES:
  - Convert KM to Miles (x 0.621371) if necessary.
  - Do not let the numbers in the postcodes affect your output.
  - Provide ONLY the RESULT line.`;

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

    const text = response.text?.trim() || "";
    
    // Look specifically for the "RESULT: [number]" pattern to avoid picking up numbers from postcodes
    const resultMatch = text.match(/RESULT:\s*(\d+(\.\d+)?)/i);
    let miles = null;
    
    if (resultMatch) {
      miles = parseFloat(resultMatch[1]);
    } else {
      // Fallback: search for a number that follows a word like "distance", "is", or "miles"
      const fallbackMatch = text.match(/(?:distance|is|total)\s*(\d+(\.\d+)?)/i) || text.match(/(\d+(\.\d+)?)\s*(?:miles|mi)/i);
      if (fallbackMatch) {
        miles = parseFloat(fallbackMatch[1]);
      } else {
        // Last resort: find the very last numeric sequence in the text (assuming postcodes are at start)
        const allNums = text.match(/(\d+(\.\d+)?)/g);
        if (allNums && allNums.length > 0) {
          miles = parseFloat(allNums[allNums.length - 1]);
        }
      }
    }

    console.debug("Grounding Protocol:", { input: { start, end }, output: text, parsed: miles });

    return {
      miles: (miles !== null && !isNaN(miles) && miles > 0) ? miles : null,
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
