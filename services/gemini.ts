
import { GoogleGenAI, Type } from "@google/genai";
import { AppState } from "../types";

// Business Insights using Gemini 3 Flash
export const getBusinessInsights = async (state: AppState) => {
  // Always create a new instance right before the call to ensure fresh configuration
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  const model = "gemini-3-flash-preview";
  
  const context = {
    jobs: state.jobs.map(j => ({ desc: j.description, status: j.status, value: j.totalRecharge })),
    invoices: state.invoices.map(i => ({ status: i.status, date: i.date }))
  };

  const prompt = `
    Context: Freelance business data.
    Data: ${JSON.stringify(context)}
    Provide one single, high-impact business growth tip under 30 words. No Markdown.
  `;

  try {
    const response = await ai.models.generateContent({ model, contents: prompt });
    // response.text is a property, not a method
    return response.text || "Focus on pipeline health.";
  } catch (error) {
    return "Maintain strong client momentum.";
  }
};

// Distance calculation using Gemini 2.5 series for Maps grounding
export const calculateDrivingDistance = async (start: string, end: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  // Maps grounding is only supported in Gemini 2.5 series models. 
  // gemini-2.5-flash is used as per the documentation example for maps grounding.
  const model = "gemini-2.5-flash"; 
  const prompt = `Calculate the driving distance in miles for the fastest route between UK postcodes "${start}" and "${end}". Return only the numeric value.`;

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

    // Extract grounding metadata as required for Maps tool usage
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    
    // response.text is a property, not a method
    const text = response.text || "";
    const matches = text.match(/(\d+(\.\d+)?)/);
    return {
      miles: matches ? parseFloat(matches[0]) : null,
      sources: groundingChunks || []
    };
  } catch (error) {
    return { miles: null, sources: [] };
  }
};

// Smart extraction using Gemini 3 Flash
export const smartExtractJob = async (rawText: string) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
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
    // response.text is a property, not a method
    return JSON.parse(response.text || '{}');
  } catch (error) {
    return null;
  }
};

// Business chat using Gemini 3 Flash
export const startBusinessChat = (state: AppState) => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  return ai.chats.create({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: `Advice for freelancer. State: ${state.clients.length} clients.`
    }
  });
};
