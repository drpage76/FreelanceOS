
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
 * Optimized for natural language grounding retrieval.
 */
export const calculateDrivingDistance = async (start: string, end: string, country: string = "United Kingdom") => {
  const ai = getAIClient();
  if (!ai) return { miles: null, error: "AI Key Missing" };

  const model = "gemini-2.5-flash"; 
  
  // Use a natural query which works best for grounding tools
  const prompt = `What is the shortest driving distance between the postcode "${start}" and the postcode "${end}" in the ${country}? 
  Please provide the distance in miles. Return the numeric value clearly.`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            // Hint for UK focus
            latLng: { latitude: 52.3555, longitude: -1.1743 } 
          }
        }
      },
    });

    const text = response.text || "";
    
    // Improved extraction: 
    // 1. Look for a number followed by 'miles' or 'mi'
    // 2. Look for a number after 'is' or 'approximately'
    // 3. Just find the most likely distance number in the text
    const milesMatch = text.match(/(\d+(\.\d+)?)\s*(miles|mi)/i) || 
                       text.match(/(?:is|approximately|distance of)\s*(\d+(\.\d+)?)/i) ||
                       text.match(/(\d+(\.\d+)?)/);
                       
    let miles = null;
    if (milesMatch) {
      miles = parseFloat(milesMatch[1]);
      // Safety check: if the distance seems like a postcode (very large or exactly matching input digits), reject it
      if (miles > 1000) miles = null; 
    }

    console.debug("Grounding Protocol Execution:", { 
      query: { start, end }, 
      raw: text, 
      parsed: miles,
      chunks: response.candidates?.[0]?.groundingMetadata?.groundingChunks
    });

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
