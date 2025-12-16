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
2) Si el usuario quiere que lo contacten / cotización / diagnóstico, recopila datos gradualmente y registra la solicitud.

Reglas clave:
- NO inventes acciones (no digas “ya envié correo”, “ya te marqué”, etc.).
- Recopila datos de manera gradual: una pregunta por turno. No pidas todo de golpe.
- Cuando detectes intención de ser contactado (o el usuario lo pida), pide primero consentimiento:
  “¿Quieres que registre tus datos para que Miguel te contacte?”
  Si responde “sí”, empieza a recolectar lo mínimo de forma ordenada:

Orden sugerido (una por turno, solo lo que falte):
1) empresa
2) nombre del contacto (con quién hablo)
3) industria (ej. automotriz, aero, moldes, etc.)
4) ciudad/estado
5) teléfono (WhatsApp) y/o email (con al menos uno basta)
6) puesto (si lo quieren dar)
7) resumen técnico del objetivo (notas): qué quieren mejorar + KPI + tipo de proceso

Confirmación final:
- Antes de registrar: “¿Confirmas que registre esta información para contacto?”
- Solo si confirma, genera el bloque [LEAD] EXACTO.

Formato obligatorio del bloque (solo cuando ya va a registrarse):
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
notas: <resumen técnico corto>
[/LEAD]

Importante:
- El bloque [LEAD] no debe mencionarse ni explicarse al usuario.
- Mantén el estilo directo, profesional, enfocado a manufactura.
`;

  function safeJson(body) {
    if (!body) return {};
    if (typeof body === "string") {
      try {
        return JSON.parse(body);
      } catch {
        return {};
      }
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

  function parseLeadBlock(fullText) {
    if (!fullText) return { visibleText: "", lead: null };

    const m = fullText.match(/\[LEAD\]([\s\S]*?)\[\/LEAD\]/);
    if (!m) return { visibleText: fullText.trim(), lead: null };

    const block = m[1].trim();

    const get = (key) => {
      const r = new RegExp(`^\\s*${key}\\s*:\\s*(.*)\\s*$`, "mi");
      return (block.match(r)?.[1] || "").trim();
    };

    const lead = {
      empresa: get("empresa"),
      contacto: get("contacto"),
      puesto: get("puesto") || "No especificado",
      telefono: get("telefono") || "No especificado",
      email: get("email") || "No especificado",
      ciudad: get("ciudad") || "No especificado",
      estado: get("estado") || "No especificado",
      industria: get("industria") || "No especificado",
      interes: get("interes") || "Consultoría — Manufactura",
      notas: get("notas"),
    };

    // mínimos para considerar “registrable”
    const hasContact = (lead.telefono && lead.telefono !== "No especificado") || (lead.email && lead.email !== "No especificado");
    const ok = Boolean(lead.empresa && lead.contacto && lead.notas && hasContact);

    // Texto visible: quita el bloque completo
    const visibleText = fullText.replace(m[0], "").trim();

    return { visibleText, lead: ok ? lead : null };
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
          .filter((m) => m && typeof m.role === "string" && typeof m.content === "string")
          .slice(-20)
          .map((m) => ({ role: m.role, content: m.content }));

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
        max_output_tokens: 550,
        store: false,
      }),
    });

    if (!r.ok) {
      const raw = await r.text();
      return res.status(r.status).json({ error: "OpenAI request failed", detail: raw });
    }

    const data = await r.json();
    const fullText = extractOutputText(data);

    const { visibleText, lead } = parseLeadBlock(fullText);

    // Devolvemos texto limpio + lead (si existe)
    return res.status(200).json({ text: visibleText, lead });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
