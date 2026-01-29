
import { GoogleGenAI, Type } from "@google/genai";
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
  // Update prompt to ask for just the number since we can't enforce JSON schema with Maps tool
  const prompt = `Find the fastest driving distance in miles between UK postcodes "${start}" and "${end}" using Google Maps. 
  Respond with ONLY the number representing the distance in miles.`;

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
    const text = response.text || "0";
    // Robust parsing for distance as we can't use responseSchema with Maps grounding
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

// Fix: Added missing startBusinessChat export for pages/Assistant.tsx
export const startBusinessChat = (state: AppState) => {
  const ai = getAIClient();
  if (!ai) throw new Error("AI Client not initialized");

  const totalRevenue = state.jobs.reduce((sum, j) => sum + (j.totalRecharge || 0), 0);
  
  // System instruction provides the business context for the coach
  const systemInstruction = `You are a world-class freelance business coach and growth strategist for ${state.user?.name || 'a freelancer'}'s business, ${state.user?.businessName || 'Freelance OS'}. 
  Your mission is to provide expert guidance on scaling, rate optimization, and client management.
  
  Current Workspace Overview:
  - Clients: ${state.clients.length}
  - Active/Archive Projects: ${state.jobs.length}
  - Lifetime Gross Billing: ${totalRevenue}
  - Settled Invoices: ${state.invoices.filter(i => i.status === 'Paid').length}
  - Outstanding Receivables: ${state.invoices.filter(i => i.status !== 'Paid').length}
  
  Provide concise, strategic, and actionable insights to help the user professionalize their operation.`;

  return ai.chats.create({
    model: 'gemini-3-pro-preview',
    config: {
      systemInstruction,
    },
  });
};
