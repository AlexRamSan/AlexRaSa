// /api/chat.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const SYSTEM_INSTRUCTIONS = `
Eres RaSa Assistant (alexrasa.store): soporte experto en manufactura. Estilo directo, útil y comercial sin presión.
Meta: resolver rápido. Si hay intención o el caso requiere detalle, pedir permiso para registrar el caso para Miguel.

Soluciones disponibles:
- Consultoría CNC (proceso, tiempos, estandarización en piso)
- SolidCAM (solo si el usuario tiene/considera CAM; nunca inventar que lo tiene)
- Lantek (corte/nesting lámina)
- Logopress (troqueles)
- Artec 3D (escaneo)
- 3D Systems (impresión 3D)

REGLAS DURAS
- NO inventes datos. No asumas material, herramienta, diámetros, tolerancias, ejes, CAM, módulos, estrategia o máquina. Si falta, pregunta 1 cosa.
- Nunca digas “si no tienes CAM” o “no tienes CAM” a menos que el usuario lo haya dicho explícitamente.
- Si el usuario confirma que NO tiene CAM: prohibido mencionar iMachining, HSR/HSM, postprocesador o simulación CAM.
  En ese caso guía con: alturas seguras, reducción de aire, orden de operaciones, offsets, ciclos del control, macros/subprogramas, buenas prácticas en máquina.
- Formato por turno:
  - 1–2 frases útiles aplicadas a lo que dijo.
  - 1 sola pregunta (máximo 1).
  - Prohibido “Pregunta/Plan/Micro-solución/Siguiente paso”.
  - Prohibido listas numeradas.
  - Prohibido bullets salvo que el usuario pida explícitamente “lista”, “pasos”, “plantilla”, “checklist”.
- Si el usuario da una unidad rara o incoherente (ej. m/s), pide aclaración de unidad con UNA pregunta (m/min, SFM, mm/min).
- Nunca prometas acciones externas (“enviado”, “te contacto”, “PDF”, “agendado”). Solo: “puedo registrarlo” o “puedo ayudarte a prepararlo”.
- No uses la palabra “dolor”; usa “reto” u “oportunidad”. Evita “demo”; usa “diagnóstico” o “revisión del proceso”.
- PROHIBIDO mostrar al usuario: “lead”, “ticket”, “[STATE]”, “[TICKET]”. Esos bloques son internos.

ESCALAR A SOPORTE DIRECTO cuando:
- El usuario lo pide (“más soporte”, “no me sirve”, “envía correo”, “cotización”, “precio”, “implementación”, “curso”, “visita”).
- Faltan datos críticos y el usuario no los tiene.
- Riesgo: colisión, tolerancias finas, scrap caro, paro de línea.

SOPORTE DIRECTO (flujo)
- Primero pide contacto (correo o WhatsApp) en UNA pregunta.
- Luego (uno por uno): nombre, empresa (opcional), ciudad/estado.
- Luego resumen técnico mínimo en UNA pregunta: operación principal + máquina + control + qué parte del ciclo se quiere mejorar + meta.
- Cuando exista contacto + resumen, genera [TICKET] interno (NO lo menciones al usuario).

CAPTURA SUAVE
- Después de dar ayuda útil y si hay intención: “¿Quieres que lo registre para que Miguel lo revise contigo? Déjame tu correo o WhatsApp.”

SALIDA INTERNA (oculta)
- Al final de cada respuesta incluye un bloque [STATE] ... [/STATE] (pero el sistema lo ocultará).
- Incluye [TICKET] ... [/TICKET] solo cuando ya exista contacto + resumen técnico.
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

  // ---- Heurísticas de contexto (evita contradicciones) ----
  function detectCamStatus(messages) {
    const all = messages.map(m => String(m?.content || "")).join("\n").toLowerCase();
    const hasMastercam = all.includes("mastercam") || all.includes("master cam");
    const hasCamYes = /\b(tengo|uso|utilizo)\b.*\bcam\b/.test(all) || hasMastercam;
    const hasCamNo = /\b(no tengo|sin)\b.*\bcam\b/.test(all) || all.includes("programo a pie");
    if (hasCamYes && !hasCamNo) return "si";
    if (hasCamNo && !hasCamYes) return "no";
    if (hasCamYes && hasCamNo) return "desconocido"; // conflicto, mejor no asumir
    return "desconocido";
  }

  function userExplicitlyAskedForList(lastUserText = "") {
    const t = lastUserText.toLowerCase();
    return ["lista", "pasos", "plantilla", "checklist", "formato", "tabla"].some(w => t.includes(w));
  }

  // ---- Validación estilo/sentido ----
  function violatesStyle(txt, { camStatus, allowBullets }) {
    const t = (txt || "").toLowerCase();

    // Encabezados prohibidos
    const bannedHeads = ["pregunta:", "micro-solución", "solución rápida", "plan:", "siguiente paso:"];
    if (bannedHeads.some(w => t.includes(w))) return true;

    // Listas numeradas
    if (/\n\s*\d+\)/.test(txt)) return true;

    // Bullets no permitidos si el usuario no pidió lista
    if (!allowBullets && /\n\s*[-•]\s+/.test(txt)) return true;

    // Muchas preguntas (más de 1 "?")
    const q = (txt.match(/\?/g) || []).length;
    if (q > 1) return true;

    // Contradicción: si ya sabemos CAM=si, no puede decir "si no tienes cam"
    if (camStatus === "si" && (t.includes("si no tienes cam") || t.includes("no tienes cam"))) return true;

    // Basura típica que has visto (“hello”, “solidsilk”)
    if (t.includes("solidsilk") || t.includes(" hello")) return true;

    return false;
  }

  async function repairToHouseStyle(openaiKey, originalAssistantText, allowBullets) {
    const rr = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5-nano",
        instructions: `
Reescribe el texto del asistente cumpliendo:
- 1–2 frases útiles.
- Máximo 1 pregunta.
- Sin “Pregunta/Plan/Micro-solución/Siguiente paso”.
- Sin listas numeradas.
- ${allowBullets ? "Bullets permitidos (máx 2) si ayudan." : "Sin bullets."}
- No asumas datos no confirmados.
Devuelve solo el texto reescrito.`,
        input: [{ role: "user", content: originalAssistantText }],
        reasoning: { effort: "minimal" },
        text: { verbosity: "low" },
        max_output_tokens: 260,
        store: false,
      }),
    });

    const rdata = await rr.json().catch(() => ({}));
    const fixed = (rdata?.output_text || "").trim();
    return fixed || originalAssistantText;
  }

  // ---- Parse de ticket + limpieza de STATE ----
  function stripAnyState(text) {
    if (!text) return "";

    // 1) Bloque [STATE] ... [/STATE]
    let out = text.replace(/\[STATE\][\s\S]*?\[\/STATE\]/gi, "");

    // 2) Inline tipo [STATE: ...] (tu caso real)
    out = out.replace(/\[STATE:[^\]]*\]/gi, "");

    // 3) Cualquier línea que empiece con [STATE
    out = out
      .split("\n")
      .filter(line => !line.trim().toUpperCase().startsWith("[STATE"))
      .join("\n");

    return out.trim();
  }

  function parseTicket(fullText) {
    const ticketMatch = fullText.match(/\[TICKET\]([\s\S]*?)\[\/TICKET\]/i);
    const ticketRaw = ticketMatch ? ticketMatch[0] : null;

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
    visibleText = stripAnyState(visibleText);

    return { visibleText: visibleText || "Perfecto.", ticket };
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
    }

    const body = safeJson(req.body);
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const userText = typeof body.input === "string" ? body.input.trim() : "";

    const history = messages
      .filter((m) => m && typeof m.role === "string" && typeof m.content === "string")
      .slice(-30)
      .map((m) => ({ role: m.role, content: m.content }));

    const input = userText ? [{ role: "user", content: userText }] : history;

    if (!input || input.length === 0) {
      return res.status(400).json({ error: "Missing input/messages" });
    }

    const camStatus = detectCamStatus(history);
    const lastUser = [...history].reverse().find(m => m.role === "user")?.content || userText || "";
    const allowBullets = userExplicitlyAskedForList(lastUser);

    // Inyección de “hechos confirmados” para evitar contradicción
    const CONTEXT = `Contexto confirmado (no inventar):
- CAM: ${camStatus === "si" ? "El usuario SÍ tiene/usa CAM (ej. Mastercam). No digas 'no tienes CAM'." :
          camStatus === "no" ? "El usuario NO tiene CAM." : "No está claro si tiene CAM."}`;

    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-5-nano",
        instructions: SYSTEM_INSTRUCTIONS,
        input: [
          { role: "system", content: CONTEXT },
          ...input
        ],
        reasoning: { effort: "minimal" },
        text: { verbosity: "low" },
        max_output_tokens: 700,
        store: false,
      }),
    });

    if (!r.ok) {
      const raw = await r.text();
      return res.status(r.status).json({ error: "OpenAI request failed", detail: raw });
    }

    const data = await r.json();
    let fullText = extractOutputText(data);

    // Si viola reglas, lo reparamos a “1 pregunta + sin inventos”
    if (violatesStyle(fullText, { camStatus, allowBullets })) {
      fullText = await repairToHouseStyle(process.env.OPENAI_API_KEY, fullText, allowBullets);
    }

    const { visibleText, ticket } = parseTicket(fullText);

    return res.status(200).json({ text: visibleText, ticket });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
