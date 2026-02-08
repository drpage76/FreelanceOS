
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
 * Optimized for strict numerical extraction from map data.
 */
export const calculateDrivingDistance = async (start: string, end: string, country: string = "United Kingdom") => {
  const ai = getAIClient();
  if (!ai) return { miles: null, error: "AI Key Missing" };

  const model = "gemini-2.5-flash"; 
  
  // Use a highly directive prompt to ensure the model focuses on the numeric result
  const prompt = `CRITICAL SYSTEM INSTRUCTION: Use Google Maps to calculate the shortest driving distance.
  
  LOCATIONS:
  - From: "${start}"
  - To: "${end}"
  - Region: "${country}"

  REQUIREMENT:
  Find the distance in miles. If you find it in kilometers, multiply by 0.621 to convert.
  
  FORMAT:
  Return the final answer in the following exact format:
  DISTANCE_VALUE: [number]
  
  Example: "DISTANCE_VALUE: 12.4"
  
  Do not include any other text or reasoning.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            // Center on UK for better grounding relevance
            latLng: { latitude: 52.3555, longitude: -1.1743 } 
          }
        }
      },
    });

    const text = response.text || "";
    
    // Extraction logic:
    // 1. Look for our specific tag DISTANCE_VALUE:
    // 2. Fallback to any number that isn't clearly a postcode
    const tagMatch = text.match(/DISTANCE_VALUE:\s*(\d+(\.\d+)?)/i);
    const milesMatch = tagMatch || text.match(/(\d+(\.\d+)?)\s*(?:miles|mi)/i) || text.match(/(?:is|of)\s*(\d+(\.\d+)?)/i);
                       
    let miles = null;
    if (milesMatch) {
      miles = parseFloat(milesMatch[1]);
      
      // Sanity check: If the number extracted is exactly one of the postcode numbers (e.g. 3 or 8 from WV3 8DA), 
      // it's likely a false positive. We look for decimals or values that don't match the inputs exactly.
      const startDigits = start.replace(/[^0-9]/g, '');
      const endDigits = end.replace(/[^0-9]/g, '');
      if ((miles.toString() === startDigits || miles.toString() === endDigits) && !text.includes('DISTANCE_VALUE')) {
        miles = null; 
      }
    }

    console.debug("Grounding Protocol Result:", { 
      query: { start, end }, 
      raw: text, 
      parsed: miles,
      grounding: response.candidates?.[0]?.groundingMetadata?.groundingChunks
    });

    return {
      miles: (miles !== null && !isNaN(miles) && miles > 0) ? miles : null,
      sources: response.candidates?.[0]?.groundingMetadata?.groundingChunks || []
    };
  } catch (error) {
    console.error("Mileage Protocol Error:", error);
    return { miles: null, error: "Protocol Failure" };
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
