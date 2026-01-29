
import { GoogleGenAI, Type } from "@google/genai";
import { AppState } from "../types";

const getAIClient = () => {
  const apiKey = process.env.API_KEY;
  if (!apiKey || apiKey === "undefined") {
    return null;
  }
  return new GoogleGenAI({ apiKey });
};

export const getBusinessInsights = async (state: AppState) => {
  const ai = getAIClient();
  if (!ai) return "AI Coach offline. Please configure GEMINI_API_KEY in GitHub Secrets.";

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
    return response.text || "Maintain strong client momentum.";
  } catch (error) {
    console.error("Gemini Insight Error:", error);
    return "Focus on pipeline health and timely invoicing.";
  }
};

export const calculateDrivingDistance = async (start: string, end: string) => {
  const ai = getAIClient();
  if (!ai) return { miles: null, sources: [], error: "AI Key Missing" };

  const model = "gemini-2.5-flash"; 
  const prompt = `Find the driving distance between UK postcodes "${start}" and "${end}" using Google Maps. 
  Respond ONLY with the distance in miles as a single decimal number.
  If multiple routes exist, provide the distance for the fastest one.
  Example output: 12.4`;

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
    // Robustly find any decimal or integer number in the response
    const matches = text.match(/(\d+(\.\d+)?)/);
    const miles = matches ? parseFloat(matches[0]) : null;

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

export const startBusinessChat = (state: AppState) => {
  const ai = getAIClient();
  if (!ai) return null;

  return ai.chats.create({
    model: "gemini-3-flash-preview",
    config: {
      systemInstruction: `Advice for freelancer. State: ${state.clients.length} clients.`
    }
  });
};
