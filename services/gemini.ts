
import { GoogleGenAI, Type } from "@google/genai";
import { AppState } from "../types";

const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === "undefined") {
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

// Start a business coaching chat session using gemini-3-pro-preview with full business context
export const startBusinessChat = (state: AppState) => {
  const ai = getAIClient();
  if (!ai) return null;

  const systemInstruction = `You are a professional business coach and freelance strategist for a user running a business called "${state.user?.businessName || 'Freelance OS'}".
    You have access to their business data:
    - Total Clients: ${state.clients.length}
    - Total Projects: ${state.jobs.length}
    - Financials: ${state.invoices.length} invoices recorded.
    
    Current projects include: ${state.jobs.slice(0, 5).map(j => j.description).join(', ')}...
    
    Provide actionable, data-driven insights on revenue growth, client acquisition, and operational efficiency. 
    Use a professional, encouraging tone. Format responses in Markdown.`;

  return ai.chats.create({
    model: 'gemini-3-pro-preview',
    config: {
      systemInstruction,
    },
  });
};

export const calculateDrivingDistance = async (start: string, end: string) => {
  const ai = getAIClient();
  if (!ai) return { miles: null, sources: [], error: "AI Key Missing" };

  const model = "gemini-2.5-flash"; 
  // Refined prompt to demand a parseable number and use grounding
  const prompt = `Find the precise driving distance in miles between UK postcodes "${start}" and "${end}" using Google Maps.
  Rules:
  1. Analyze real-time map data.
  2. If there are multiple routes, pick the fastest.
  3. Output ONLY the number of miles as a decimal.
  4. Do not include any units or explanation.
  Example output: 14.5`;

  try {
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
      config: {
        tools: [{ googleMaps: {} }],
        toolConfig: {
          retrievalConfig: {
            latLng: { latitude: 51.5074, longitude: -0.1278 } // Default to London center for UK context
          }
        }
      },
    });

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    const text = response.text || "";
    
    // Robustly extract the first number found in the output
    const match = text.match(/(\d+(\.\d+)?)/);
    const miles = match ? parseFloat(match[0]) : null;

    return {
      miles: miles,
      sources: groundingChunks || []
    };
  } catch (error) {
    console.error("Mileage Service Error:", error);
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
                  qty: { type: Type.INTEGER },
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
