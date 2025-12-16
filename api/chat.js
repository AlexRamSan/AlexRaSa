// Vercel Serverless Function
// Endpoint: POST /api/chat

const SYSTEM_INSTRUCTIONS = `
Eres el asistente del sitio alexrasa.store (AlexRaSa).
El sitio es sobre consultoría e ingeniería para manufactura (CNC, mejora de procesos, estandarización, reducción de tiempos de ciclo, vida de herramienta, scrap/OEE, digitalización práctica, implementación CAM cuando aplique).

Objetivo:
1) Responder dudas técnicas de manufactura y consultoría.
2) Calificar el contexto (proceso, tipo de piezas, máquinas/controles, materiales, volumen, KPI actual, objetivo).
3) Proponer el siguiente paso (diagnóstico, visita, reunión técnica) con claridad.

Restricciones críticas (OBLIGATORIAS):
- No inventes acciones. No digas “ya envié correo”, “te marqué”, “agendé”, “cotización enviada”, etc.
- No puedes enviar correos, hacer llamadas ni agendar automáticamente. En su lugar:
  - Ofrece generar un borrador de correo listo para copiar/pegar, o
  - Indica que el usuario debe enviar el correo desde su cliente.
- Si piden algo fuera de la web (pagos, envíos, correos), responde: “Puedo prepararte el texto y los pasos”.

Estilo:
- Directo, breve, profesional. Enfocado a manufactura.
- Evita hablar de marketing/leads/CRM salvo que el usuario lo pida explícitamente.

Primera interacción:
- Pregunta qué reto de manufactura quieren resolver (tiempo de ciclo, scrap, set-up, tool life, programación, calidad).
`;

function safeJson(req) {
  if (!req?.body) return {};
  if (typeof req.body === "string") {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return req.body;
}

function extractOutputText(data) {
  // 1) Camino fácil
  let text = (data?.output_text || "").trim();
  if (text) return text;

  // 2) Fallback: recorre data.output[] buscando output_text
  if (Array.isArray(data?.output)) {
    let acc = "";
    for (const item of data.output) {
      if (item?.type === "message" && item?.role === "assistant" && Array.isArray(item.content)) {
        for (const c of item.content) {
          if (c?.type === "output_text" && typeof c.text === "string") {
            acc += c.text;
          }
        }
      }
    }
    text = (acc || "").trim();
  }
  return text;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

    const body = safeJson(req);

    const messages = Array.isArray(body.messages) ? body.messages : [];
    const userText = typeof body.input === "string" ? body.input.trim() : "";

    // Soporta:
    // 1) { input: "hola" }
    // 2) { messages: [{role, content}, ...] }
    const input = userText
      ? userText
      : messages
          .filter(m => m && typeof m.role === "string" && typeof m.content === "string")
          .slice(-20)
          .map(m => ({ role: m.role, content: m.content }));

    if (!input || (Array.isArray(input) && input.length === 0)) {
      return res.status(400).json({ error: "Missing input/messages" });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY in server environment" });
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
        // Para chat rápido/corto
        reasoning: { effort: "minimal" },
        text: { verbosity: "low" },
        max_output_tokens: 350,
        store: false,
      }),
    });

    // Si OpenAI falla, devuelve el error real (no lo escondas)
    if (!r.ok) {
      let detail;
      try { detail = await r.json(); }
      catch { detail = { raw: await r.text() }; }

      return res.status(r.status).json({
        error: "OpenAI request failed",
        detail,
      });
    }

    const data = await r.json();
    const text = extractOutputText(data);

    return res.status(200).json({ text });
  } catch (e) {
    return res.status(500).json({ error: "Server error", detail: String(e) });
  }
};
