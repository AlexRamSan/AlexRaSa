// Endpoint: POST /api/chat  (Vercel Serverless Function)
// Llama a OpenAI Responses API y regresa texto plano.

const SYSTEM_INSTRUCTIONS = `
Eres el asistente del sitio alexrasa.store (AlexRaSa).
Objetivo: resolver dudas, explicar servicios y llevar a un siguiente paso (contacto o cita).
Si falta info (alcance, tiempos, presupuesto), pide el dato mínimo y ofrece opciones claras.
Respuestas cortas por defecto.
`;

function safeJson(req) {
  if (!req?.body) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const body = safeJson(req);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const userText = typeof body.input === "string" ? body.input : null;

    // Acepta 2 modos:
    // 1) { input: "texto" }
    // 2) { messages: [{role:"user|assistant", content:"..."}, ...] }
    const input =
      userText
        ? userText
        : messages
            .filter(m => m && typeof m.role === "string" && typeof m.content === "string")
            .slice(-20) // recorta historial para costos/latencia
            .map(m => ({ role: m.role, content: m.content }));

    if (!input || (Array.isArray(input) && input.length === 0)) {
      return res.status(400).json({ error: "Missing input/messages" });
    }

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5-nano",
        instructions: SYSTEM_INSTRUCTIONS,
        input,
        max_output_tokens: 350,
        store: false,
      }),
    });

    if (!r.ok) {
      const detail = await r.text();
      return res.status(500).json({ error: "OpenAI request failed", detail });
    }

    const data = await r.json();
    return res.status(200).json({ text: data.output_text ?? "" });
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String(e) });
  }
};
