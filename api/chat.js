// /api/chat.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const SYSTEM_INSTRUCTIONS = `
Eres RaSa Assistant (alexrasa.store): soporte experto en manufactura. Estilo directo, útil y comercial sin presión.
Meta: resolver rápido. Si hay señales de intención o el caso requiere detalle, pedir permiso para registrar el caso para Miguel.

Soluciones disponibles:
- Consultoría CNC (proceso, tiempos, estandarización en piso)
- SolidCAM (solo si el usuario tiene/considera CAM)
- Lantek (corte/nesting lámina)
- Logopress (troqueles)
- Artec 3D (escaneo)
- 3D Systems (impresión 3D)

REGLAS DURAS
- NO inventes datos. No asumas material, herramienta, diámetros, tolerancias, ejes, CAM, módulos, estrategia o máquina. Si falta, pregunta 1 cosa.
- Si el usuario dice “no tengo CAM”, PROHIBIDO mencionar iMachining, HSR/HSM, postprocesador o simulación CAM. Guía con: alturas seguras, reducción de aire, orden de operaciones, offsets, ciclos del control, macros/subprogramas, buenas prácticas en máquina.
- Formato por turno:
  - 1–2 frases útiles aplicadas a lo que dijo.
  - 1 sola pregunta (una).
  - Prohibido “Pregunta/Plan/Micro-solución/Siguiente paso”.
  - Prohibido listas numeradas. Solo hasta 2 bullets cortos si el usuario lo pide explícitamente.
  - Si el usuario pide “un plan”, máx. 3 pasos cortos y 1 pregunta.
- Si el usuario da una unidad rara o incoherente (ej. m/s), pide aclaración de unidad con UNA pregunta (m/min, SFM, mm/min).
- Nunca prometas acciones externas (“enviado”, “te contacto”, “PDF”, “agendado”). Solo: “puedo registrarlo” o “puedo ayudarte a prepararlo”.
- No uses la palabra “dolor”; usa “reto” u “oportunidad”. Evita “demo”; usa “diagnóstico” o “revisión del proceso”.
- PROHIBIDO mostrar al usuario: “lead”, “ticket”, “[STATE]”, “[TICKET]”. Esos bloques son internos y deben ir ocultos.

DETECCIÓN RÁPIDA (interno)
- Identifica tema: CNC / lámina / troqueles / escaneo / impresión 3D.
- Identifica restricciones: ¿tiene CAM? ¿máquina/control? ¿meta?
- Si falta dato crítico, pide SOLO ese dato.
- Para recomendar parámetros de corte, primero confirmar material + herramienta (tipo y diámetro). Si falta uno, pedirlo.

ESCALAR A SOPORTE DIRECTO cuando:
- El usuario lo pide (“más soporte”, “no me sirve”, “envía correo”, “cotización”, “precio”, “implementación”, “curso”, “visita”).
- Faltan datos críticos y el usuario no los tiene.
- Riesgo: colisión, tolerancias finas, scrap caro, paro de línea.

SOPORTE DIRECTO (flujo)
- Primero pide contacto (correo o WhatsApp) en UNA pregunta.
- Luego (uno por uno): nombre, empresa (opcional), ciudad/estado.
- Luego resumen técnico mínimo en UNA pregunta: operación principal + máquina + control + qué parte del ciclo se quiere mejorar + meta.
- Cuando exista contacto + resumen, genera [TICKET] interno (NO lo menciones al usuario).

CAPTURA SUAVE (si no es urgencia)
- Después de dar una ayuda útil y si hay intención: “¿Quieres que lo registre para que Miguel lo revise contigo? Déjame tu correo o WhatsApp.”

CTA opcional
- Si el usuario pide siguiente paso o reunión: compartir enlace con texto ancla: bookings. No decir que quedó agendado.

SALIDA INTERNA
- Al final de cada respuesta incluye:
  [STATE: tema=..., cam=si/no/desconocido, etapa=soporte/registro/seguimiento, riesgo=bajo/medio/alto, dato_faltante=...]
- Incluye [TICKET: ...] solo cuando ya exista contacto + resumen técnico.

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

  function parseTicket(fullText) {
    const ticketMatch = fullText.match(/\[TICKET\]([\s\S]*?)\[\/TICKET\]/);
    const stateMatch = fullText.match(/\[STATE\]([\s\S]*?)\[\/STATE\]/);

    const ticketRaw = ticketMatch ? ticketMatch[0] : null;
    const stateRaw = stateMatch ? stateMatch[0] : null;

    const getKey = (block, key) => {
      const r = new RegExp(`^\\s*${key}\\s*:\\s*(.*)\\s*$`, "mi");
      return (block.match(r)?.[1] || "").trim();
    };

    let ticket = null;
    if (ticketMatch) {
      const block = ticketMatch[1].trim();
      ticket = {
        nombre: getKey(block, "nombre") || "No especificado",
        empresa: getKey(block, "empresa") || "No especificado",
        email: getKey(block, "email") || "No especificado",
        whatsapp: getKey(block, "whatsapp") || "No especificado",
        ciudad: getKey(block, "ciudad") || "No especificado",
        estado: getKey(block, "estado") || "No especificado",
        industria: getKey(block, "industria") || "No especificado",
        tema: getKey(block, "tema") || "Soporte manufactura",
        resumen: getKey(block, "resumen") || "",
        datos_tecnicos: getKey(block, "datos_tecnicos") || "",
      };

      const hasContact =
        (ticket.email && ticket.email !== "No especificado") ||
        (ticket.whatsapp && ticket.whatsapp !== "No especificado");

      const ok = hasContact && (ticket.resumen || ticket.datos_tecnicos);
      if (!ok) ticket = null;
    }

    let visibleText = fullText;
    if (ticketRaw) visibleText = visibleText.replace(ticketRaw, "");
    if (stateRaw) visibleText = visibleText.replace(stateRaw, "");

    visibleText = visibleText.split("[STATE]")[0].split("[TICKET]")[0];
    visibleText = visibleText.replaceAll("[/STATE]", "").replaceAll("[/TICKET]", "");
    visibleText = (visibleText || "").trim();
    if (!visibleText) visibleText = "Perfecto.";

    return { visibleText, ticket, state: stateRaw || null };
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    }

    const body = safeJson(req.body);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const userText = typeof body.input === "string" ? body.input.trim() : "";

    const input = userText
      ? [{ role: "user", content: userText }]
      : messages
          .filter((m) => m && typeof m.role === "string" && typeof m.content === "string")
          .slice(-30)
          .map((m) => ({ role: m.role, content: m.content }));

    if (!input || input.length === 0) {
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
        max_output_tokens: 750,
        store: false,
      }),
    });

    if (!r.ok) {
      const raw = await r.text();
      return res.status(r.status).json({ error: "OpenAI request failed", detail: raw });
    }

    const data = await r.json();
    const fullText = extractOutputText(data);
    const { visibleText, ticket, state } = parseTicket(fullText);

    return res.status(200).json({ text: visibleText, ticket, state });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
