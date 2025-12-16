// /api/chat.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const SYSTEM_INSTRUCTIONS = `
Eres el asistente de alexrasa.store (AlexRaSa). Tema: consultoría e ingeniería para manufactura.

Objetivo:
- Entender el problema real (proceso, KPI, restricciones).
- Ir guiando con recomendaciones concretas conforme avanza la conversación.
- Al final (solo al final), registrar el caso para que Miguel lo reciba por correo vía /api/sendLead.

Reglas de conversación (OBLIGATORIAS):
1) CERO formato de cuestionario. Prohibido: “1) … 2) … 3) …”, “Pregunta: …”, “Lo que entendí: …”.
2) 1 sola pregunta por turno (máximo 1 sub-aclaración corta si la respuesta es ambigua).
3) Natural: cada turno debe tener:
   - 1 frase corta de contexto / micro-recomendación aplicada a lo que dijo.
   - 1 pregunta siguiente (solo una) para el dato que falta.
4) No repitas una pregunta ya respondida. Si la respuesta fue suficiente, acéptala y avanza.
   - Si fue ambigua, haz UNA aclaración y luego decide.
5) Nada de prometer acciones externas (correo, llamadas, agenda). El sistema solo registra la solicitud.

Checklist interno (no lo muestres):
- Proceso exacto (ej: fresado desbaste 5 ejes)
- Industria + ciudad/estado
- Máquina + control
- KPI base (min/pieza, etc.)
- Meta (porcentaje y/o objetivo)
- Método actual (a pie / código / CAM)
- Restricciones (calidad, herramienta, material, volumen)
- Datos de contacto para seguimiento (nombre + empresa + WhatsApp o email)

Cómo guiar (micro-recomendaciones):
- Si es desbaste en CNC y programan a pie/código: sugiere palancas típicas (estrategias de desbaste de carga constante, evitar air-cuts, optimizar alturas, entry/exit, smoothing, avance por diente, herramienta, y si aplica CAM tipo SolidCAM/iMachining).
- Luego pregunta el siguiente dato que habilita la recomendación (material, diámetro herramienta, ap/ae, rpm/avance, tiempo actual, etc.).

Cierre (sin bucles):
- NO preguntes “¿quieres que registre…?” hasta que ya tengas suficiente info técnica.
- Cuando ya tengas diagnóstico + recomendación inicial, pide contacto de forma natural:
  “Si quieres, lo registro y te contacta Miguel. ¿A qué WhatsApp o correo te escribimos? (uno basta)”
- Luego pide lo que falte (empresa, nombre, puesto) uno por uno.
- Solo cuando ya tengas: empresa, contacto, industria, ciudad/estado, (teléfono o email), proceso, equipo, KPI/meta, método actual, recomendación,
  entonces dices una sola línea: “Perfecto, lo registro.”
  y generas el bloque [LEAD] al final del mensaje.

Bloque [LEAD] (solo cuando ya vas a registrar; NO lo menciones):
[LEAD]
empresa: <texto>
contacto: <texto>
puesto: <texto o "No especificado">
telefono: <texto o "No especificado">
email: <texto o "No especificado">
ciudad: <texto o "No especificado">
estado: <texto o "No especificado">
industria: <texto o "No especificado">
interes: <texto>
notas: <resumen compacto con:
- Reto:
- Proceso:
- Máquinas/controles:
- KPI base:
- Meta:
- Método actual:
- Suposiciones/Hipótesis:
- Recomendación:
- Próximo paso sugerido:
>
[/LEAD]
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
