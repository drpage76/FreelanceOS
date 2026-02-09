import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const { start, end, country } = await req.json();

    if (!start || !end) {
      return new Response(JSON.stringify({ error: "MISSING_PARAMS" }), {
        status: 400,
      });
    }

    const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_KEY) throw new Error("Missing GEMINI_API_KEY");

    const prompt = `Give driving distance in miles between ${start} and ${end} in ${country}. Only return a number.`;

    const r = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=" +
        GEMINI_KEY,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    const j = await r.json();
    const text = j?.candidates?.[0]?.content?.parts?.[0]?.text || "";

    const match = text.match(/([\d.]+)/);

    if (!match) {
      return new Response(
        JSON.stringify({ miles: null, error: "NO_DISTANCE_RETURNED" }),
        { status: 200 }
      );
    }

    return new Response(JSON.stringify({ miles: Number(match[1]) }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
    });
  }
});
