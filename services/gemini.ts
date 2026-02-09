import { GoogleGenAI } from "@google/genai";

const getAIClient = () => {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({ apiKey });
};

export const calculateDrivingDistance = async (
  start: string,
  end: string,
  country: string = "United Kingdom"
) => {
  const ai = getAIClient();
  if (!ai) return { miles: null, error: "AI_KEY_MISSING" };

  const model = "gemini-2.5-flash";

  const prompt = `
Use Google Maps to calculate the shortest driving distance.

FROM: "${start}"
TO: "${end}"
REGION: "${country}"

Return ONLY a number in miles.
No explanation.
Example: 42.7
`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          tools: [{ googleMaps: {} }],
          toolConfig: {
            retrievalConfig: {
              latLng: { latitude: 52.3555, longitude: -1.1743 }
            }
          }
        }
      });

      const raw = (response.text || "").trim();

      console.log(`[Mileage] Gemini raw attempt ${attempt}:`, raw);

      if (!raw) continue;

      // Pull first decimal/number
      const match = raw.match(/([0-9]+(\.[0-9]+)?)/);

      if (!match) continue;

      const miles = parseFloat(match[1]);

      if (!isNaN(miles) && miles > 0) {
        return { miles };
      }
    } catch (err) {
      console.warn("Mileage attempt failed:", err);
    }
  }

  return { miles: null, error: "NO_DISTANCE_RETURNED" };
};
