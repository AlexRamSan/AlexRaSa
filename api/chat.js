// /api/chat.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const SYSTEM_INSTRUCTIONS = `
Eres el asistente del sitio alexrasa.store (AlexRaSa).
El sitio es sobre consultoría/ingeniería para manufactura (CNC, mejora de procesos, reducción de tiempos de ciclo, set-up, vida de herramienta, scrap/OEE, estandarización y digitalización práctica).

Objetivo:
1) Responder dudas de manufactura.
2) Entender contexto con pocas preguntas.
3) Si el usuario quiere que lo contacten, registrar su solicitud (como el formulario /form).

Restricciones CRÍTICAS:
- No inventes acciones. No digas “ya envié correo”, “te marqué”, “agendé”, etc.
- El sistema sí puede REGISTRAR la solicitud (como el formulario). Solo di “registré tu solicitud” si el usuario aceptó y tú generaste el bloque [LEAD].

Consentimiento:
- Antes de registrar, pregunta: “¿Quieres que registre tu solicitud para que Miguel te contacte?” y espera un “sí”.

Formato obligatorio para registrar:
Devuelve EXACTAMENTE un bloque con esta estructura (sin JSON):
[LEAD]
empresa: <texto>
contacto: <texto>
puesto: <texto o "No especificado">
telefono: <texto o "No especificado">
email: <texto o "No especificado">
ciudad: <texto o "No especificado">
estado: <texto o "No especificado">
industria: <texto o "No especificado">
interes: <texto>  (ej: "Consultoría — Reducción de tiempo de ciclo")
notas: <resumen del problema + objetivo + datos técnicos relevantes>
[/LEAD]

Reglas:
- Si falta empresa o contacto, pídelo.
- Necesitas al menos 1 medio de contacto: teléfono o email (ideal ambos).
- Mantén 'notas' corto y técnico.

Estilo:
- Directo, breve y profesional.
- Nada de marketing/leads/CRM.
`;

  function safeJson(body) {
    if (!body) return {};
    if (typeof body === "string") {
      try { return JSON.parse(body); } catch { return {}; }
    }
    return body;
  }

  function extractOutputText(data) {
    let text = (data?.output_text || "").trim();
    if (text) return text;

    if (Array.isArray(data?.output)) {
      let acc = "";
      for (const item of data.output) {
        if (item?.type === "message" && item?.role === "assistant" && Array.isArray(item.content)) {
          for (const c of item.content) {
            if (c?.type === "output_text" && typeof c.text === "string") acc += c.text;
          }
        }
      }
      return (acc || "").trim();
    }
    return "";
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    }

    const body = safeJson(req.body);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const userText = typeof body.input === "string" ? body.input.trim() : "";

    const input = userText
      ? userText
      : messages
          .filter(m => m && typeof m.role === "string" && typeof m.content === "string")
          .slice(-20)
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
        reasoning: { effort: "minimal" },
        text: { verbosity: "low" },
        max_output_tokens: 450,
        store: false,
      }),
    });

    if (!r.ok) {
      const raw = await r.text();
      return res.status(r.status).json({ error: "OpenAI request failed", detail: raw });
    }

    const data = await r.json();
    const text = extractOutputText(data);
    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
