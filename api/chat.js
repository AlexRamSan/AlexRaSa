// /api/chat.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: "Missing OPENAI_API_KEY" });
  }

  const OPENAI_KEY = process.env.OPENAI_API_KEY;

  // =========================
  // 1) System instructions
  // =========================
  const SYSTEM_INSTRUCTIONS = `
Eres RaSa Assistant (alexrasa.store): soporte experto en manufactura. Estilo directo, útil y comercial sin presión.
Tu prioridad: dar una acción práctica y solo una pregunta. Solo recopila datos para registrar caso si el usuario lo pide o acepta explícitamente.

Oferta (elige lo que aplique según lo que el usuario pide):
- Consultoría CNC (proceso, tiempos, estandarización en piso)
- SolidCAM (solo si el usuario tiene/considera CAM; no inventes que lo tiene)
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
  - Prohibido encabezados tipo “Pregunta/Plan/Micro-solución/Siguiente paso”.
  - Prohibido listas numeradas.
  - Prohibido bullets salvo que el usuario pida explícitamente “lista”, “pasos”, “plantilla”, “checklist”.
- Si el usuario da una unidad rara o incoherente (ej. m/s), pide aclaración de unidad con UNA pregunta (m/min, SFM, mm/min).
- Nunca prometas acciones externas (“enviado”, “te contacto”, “PDF”, “agendado”, “te contactarán”). Solo: “puedo registrarlo” o “puedo ayudarte a prepararlo”.
- No uses la palabra “dolor”; usa “reto” u “oportunidad”. Evita “demo”; usa “diagnóstico” o “revisión del proceso”.

CAPTURA DE LEAD SIN FASTIDIAR
- No pidas contacto si el usuario NO lo pidió y NO aceptó registrar el caso.
- Si el usuario acepta registrar: pide solo 1 dato por turno, en este orden:
  1) contacto (correo o WhatsApp) si falta
  2) nombre
  3) ciudad/estado
  4) resumen técnico mínimo: operación + máquina + control + qué parte del ciclo se quiere mejorar + meta
- Si el usuario dice “no” a registrar o a dar datos: deja de insistir y regresa a soporte.
`;

  // =========================
  // 2) Utilities
  // =========================
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

  function stripCodeFences(s) {
    const t = String(s || "").trim();
    return t
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
  }

  function parseJsonLoose(s) {
    const t = stripCodeFences(s);
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  }

  function userExplicitlyAskedForList(text = "") {
    const t = String(text || "").toLowerCase();
    return ["lista", "pasos", "plantilla", "checklist", "formato", "tabla"].some((w) => t.includes(w));
  }

  function isYes(text = "") {
    const t = String(text || "").trim().toLowerCase();
    return t === "si" || t === "sí" || t.startsWith("si ") || t.startsWith("sí ") || t.includes("ok") || t.includes("va");
  }

  function isNo(text = "") {
    const t = String(text || "").trim().toLowerCase();
    return t === "no" || t.startsWith("no ");
  }

  function detectIntentToEscalate(text = "") {
    const t = String(text || "").toLowerCase();
    return [
      "más soporte",
      "no me sirve",
      "envía correo",
      "enviar correo",
      "cotización",
      "cotizar",
      "precio",
      "costo",
      "coste",
      "implementación",
      "curso",
      "visita",
      "agendar",
      "reservar",
      "propuesta",
      "comprar",
    ].some((k) => t.includes(k));
  }

  function lastAssistantAskedRegister(history) {
    const lastA = history.slice().reverse().find((m) => m.role === "assistant")?.content || "";
    const t = lastA.toLowerCase();
    return t.includes("¿quieres que lo registre") || t.includes("quieres que lo registre") || t.includes("puedo registrarlo");
  }

  function lastAssistantAskedContact(history) {
    const lastA = history.slice().reverse().find((m) => m.role === "assistant")?.content || "";
    const t = lastA.toLowerCase();
    return t.includes("correo") || t.includes("whatsapp");
  }

  function detectCamStatus(messages) {
    const all = messages.map((m) => String(m?.content || "")).join("\n").toLowerCase();
    const hasMastercam = all.includes("mastercam") || all.includes("master cam");
    const hasCamYes = /\b(tengo|uso|utilizo)\b.*\bcam\b/.test(all) || hasMastercam;
    const hasCamNo = /\b(no tengo|sin)\b.*\bcam\b/.test(all) || all.includes("programo a pie");
    if (hasCamYes && !hasCamNo) return "si";
    if (hasCamNo && !hasCamYes) return "no";
    if (hasCamYes && hasCamNo) return "desconocido";
    return "desconocido";
  }

  function violatesStyle(txt, { camStatus, allowBullets }) {
    const t = String(txt || "").toLowerCase();

    const bannedHeads = ["pregunta:", "micro-solución", "solución rápida", "plan:", "siguiente paso:", "pasos:", "checklist:"];
    if (bannedHeads.some((w) => t.includes(w))) return true;

    // listas numeradas 1) o 1.
    if (/\n\s*\d+\s*[\)\.]\s+/.test(txt)) return true;

    // bullets sin permiso
    if (!allowBullets && /\n\s*[-•]\s+/.test(txt)) return true;

    // máximo 1 pregunta
    const q = (String(txt).match(/\?/g) || []).length;
    if (q > 1) return true;

    // contradicción CAM
    if (camStatus === "si" && (t.includes("si no tienes cam") || t.includes("no tienes cam"))) return true;

    // promesas externas prohibidas
    const bannedPromises = ["te contactarán", "te contacto", "te voy a contactar", "enviado", "agendado", "te llamo", "te marcaré"];
    if (bannedPromises.some((p) => t.includes(p))) return true;

    return false;
  }

  async function callOpenAIResponses({ model, instructions, input, max_output_tokens }) {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model,
        instructions,
        input,
        reasoning: { effort: "minimal" },
        text: { verbosity: "low" },
        max_output_tokens,
        store: false,
      }),
    });

    if (!r.ok) {
      const raw = await r.text();
      const err = new Error("OpenAI request failed");
      err.status = r.status;
      err.detail = raw;
      throw err;
    }
    return r.json();
  }

  async function repairToHouseStyle(originalAssistantText, { allowBullets, camStatus, hasContact, optedIn }) {
    const camLine =
      camStatus === "si"
        ? "El usuario SÍ usa CAM: prohibido decir 'no tienes CAM' o 'si no tienes CAM'."
        : camStatus === "no"
        ? "El usuario NO tiene CAM: prohibido mencionar iMachining/HSR/HSM/post/simulación CAM."
        : "CAM no confirmado: no afirmes que tiene o no tiene CAM.";

    const leadLine = optedIn
      ? hasContact
        ? "El usuario YA dio contacto: NO pedir correo/WhatsApp."
        : "El usuario aceptó registrar: puedes pedir correo o WhatsApp (UNA pregunta) si falta."
      : "El usuario NO aceptó registrar: NO pidas contacto; solo soporte + 1 pregunta técnica.";

    const data = await callOpenAIResponses({
      model: "gpt-5-nano",
      instructions: `
Reescribe el texto cumpliendo:
- 1–2 frases útiles.
- Máximo 1 pregunta.
- Sin encabezados tipo “Pregunta/Plan/Micro-solución/Siguiente paso”.
- Sin listas numeradas.
- ${allowBullets ? "Bullets permitidos (máx 2) SOLO si el usuario pidió lista." : "Sin bullets."}
- No asumas datos no confirmados.
- Prohibido prometer acciones externas (te contactarán / te contacto / enviado / agendado).
- ${camLine}
- ${leadLine}
Devuelve SOLO el texto reescrito.`,
      input: [{ role: "user", content: String(originalAssistantText || "") }],
      max_output_tokens: 220,
    });

    const fixed = (extractOutputText(data) || "").trim();
    return fixed || String(originalAssistantText || "");
  }

  // =========================
  // 3) Slot extraction + final summary
  // =========================
  async function extractSlots(history, prevSession, lastUserText) {
    const schemaHint = {
      track: "CAM|INGENIERIA|SOPORTE|DESCONOCIDO",
      producto: "SolidCAM|Lantek|Logopress|Artec3D|3DSystems|DESCONOCIDO",
      optedInToRegister: "boolean",
      contacto: { whatsapp: "string|null", email: "string|null", nombre: "string|null", empresa: "string|null", ciudad: "string|null", estado: "string|null", rol: "string|null" },
      tecnico: { proceso: "CNC|LAMINA|TROQUELES|ESCANEO|IMPRESION|DESCONOCIDO", maquina: "string|null", control: "string|null", material: "string|null", operacion: "string|null", meta: "string|null", volumen: "string|null", riesgo: "bajo|medio|alto|desconocido" },
      comercial: { tiene_cam: "si|no|desconocido", software_actual: "string|null", horizonte: "string|null", tipo_interes: "info|cotizacion|visita|curso|soporte|desconocido" },
    };

    const data = await callOpenAIResponses({
      model: "gpt-5-nano",
      instructions: `
Extrae/actualiza datos desde la conversación para uso interno (leads + soporte).
Devuelve SOLO JSON válido (sin texto extra).
No inventes: si no está, usa null o "desconocido".
optedInToRegister SOLO true si el usuario aceptó explícitamente registrar (ej. “sí, regístralo”).
Estructura guía: ${JSON.stringify(schemaHint)}`,
      input: [
        { role: "system", content: `Sesión previa JSON: ${JSON.stringify(prevSession || {})}` },
        ...history,
        { role: "user", content: `Último mensaje del usuario: ${String(lastUserText || "")}` },
      ],
      max_output_tokens: 400,
    });

    const raw = extractOutputText(data);
    const parsed = parseJsonLoose(raw);
    return parsed || (prevSession || {});
  }

  async function buildFinalSummary(session) {
    const data = await callOpenAIResponses({
      model: "gpt-5-nano",
      instructions: `
Genera un resumen interno para Miguel basado SOLO en el JSON.
Devuelve SOLO JSON válido con:
{
  "summary_for_miguel": "string corto (comercial + técnico)",
  "missing_info": ["..."],
  "next_best_step": "string"
}
No prometas acciones externas.`,
      input: [{ role: "user", content: JSON.stringify(session || {}) }],
      max_output_tokens: 260,
    });

    const raw = extractOutputText(data);
    const parsed = parseJsonLoose(raw);
    return parsed || { summary_for_miguel: "", missing_info: [], next_best_step: "" };
  }

  // =========================
  // 4) Main flow
  // =========================
  try {
    const body = safeJson(req.body);

    // Inputs del frontend esperados:
    // - body.messages: historial [{role, content}]
    // - body.input: último texto del user (string) (opcional si messages ya lo trae)
    // - body.session: objeto persistido por tu UI (localStorage)
    // - body.action: "finalize" para generar resumen final
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const userText = typeof body.input === "string" ? body.input.trim() : "";

    const history = messages
      .filter((m) => m && typeof m.role === "string" && typeof m.content === "string")
      .slice(-40)
      .map((m) => ({ role: m.role, content: m.content }));

    // Construye input SIEMPRE con historial + (si viene) último user
    const input = [...history, ...(userText ? [{ role: "user", content: userText }] : [])];

    // Evita duplicar si el último user del history ya es igual a userText
    if (
      userText &&
      history.length &&
      history[history.length - 1].role === "user" &&
      history[history.length - 1].content.trim() === userText
    ) {
      input.pop();
    }

    if (!input.length) {
      return res.status(400).json({ error: "Missing input/messages" });
    }

    const finalUserText =
      userText || (history.slice().reverse().find((m) => m.role === "user")?.content || "");

    const prevSession = typeof body.session === "object" && body.session ? body.session : {};
    const camStatus = detectCamStatus(history);
    const allowBullets = userExplicitlyAskedForList(finalUserText);

    // ---- Opt-in logic (candado para que no insista) ----
    const assistantAskedRegister = lastAssistantAskedRegister(history);
    const assistantAskedContact = lastAssistantAskedContact(history);
    const userWantsEscalation = detectIntentToEscalate(finalUserText);

    let optedIn = Boolean(prevSession?.optedInToRegister);

    // Si el usuario dijo NO cuando se le pidió registrar o contacto, cancela opt-in
    if (isNo(finalUserText) && (assistantAskedRegister || assistantAskedContact)) {
      optedIn = false;
    }

    // Solo activa opt-in si el usuario dijo SÍ justo después de que el bot pidió registrar
    if (!optedIn && assistantAskedRegister && isYes(finalUserText)) {
      optedIn = true;
    }

    // Si pidió cotización/precio/visita/etc, NO forzamos opt-in, pero permitimos pedir permiso en la conversación
    // (esto lo controla el contexto duro abajo)
    const hasContactFromSession =
      Boolean(prevSession?.contacto?.whatsapp) || Boolean(prevSession?.contacto?.email);

    // ---- Etapa interna sugerida (no se muestra) ----
    let stage = String(prevSession?.stage || "support");
    if (!optedIn) stage = "support";
    else if (!hasContactFromSession) stage = "collect_contact";
    else if (stage === "collect_contact" || stage === "support") stage = "collect_name";

    // Contexto duro para mantener lógica
    const FLOW_CONTEXT = `Contexto confirmado (no inventar):
- CAM: ${
      camStatus === "si"
        ? "El usuario SÍ tiene/usa CAM. No digas 'no tienes CAM'."
        : camStatus === "no"
        ? "El usuario NO tiene CAM."
        : "No está claro si tiene CAM."
    }
- Registro permitido (opt-in): ${optedIn ? "SÍ" : "NO"}
- El usuario pidió algo comercial/escala (precio/cotización/visita/etc): ${userWantsEscalation ? "SÍ" : "NO"}
Reglas de captura:
- Si opt-in=NO: NO pidas contacto. Da soporte y SOLO una pregunta técnica.
- Si opt-in=NO pero el usuario pide precio/cotización/visita: pide PERMISO para registrar (una pregunta) o da soporte (una pregunta), pero no interrogues.
- Si opt-in=SÍ: pide 1 dato por turno según etapa. Etapa=${stage}.
Prohibido prometer acciones externas: “te contactarán / te contacto / enviado / agendado”.`;

    // =========================
    // (A) Finalize-only mode
    // =========================
    if (String(body.action || "").toLowerCase() === "finalize") {
      // Actualiza sesión con extractor antes de resumir
      const extractedSession = await extractSlots(history, prevSession, finalUserText);

      // Enforce opt-in gate (no dejar que el extractor lo “invente”)
      extractedSession.optedInToRegister = optedIn;

      // Propaga stage (útil para UI)
      extractedSession.stage = stage;

      const finalPack = await buildFinalSummary(extractedSession);

      return res.status(200).json({
        text: "Listo.",
        session: extractedSession,
        final: finalPack,
      });
    }

    // =========================
    // (B) Normal reply mode
    // =========================
    const data = await callOpenAIResponses({
      model: "gpt-5-nano",
      instructions: SYSTEM_INSTRUCTIONS,
      input: [{ role: "system", content: FLOW_CONTEXT }, ...input],
      max_output_tokens: 280,
    });

    let assistantText = extractOutputText(data);

    // Arreglo de estilo si se pasa de lanza
    const hasContact = hasContactFromSession; // solo para repair gate (antes de extractor)
    if (violatesStyle(assistantText, { camStatus, allowBullets })) {
      assistantText = await repairToHouseStyle(assistantText, {
        allowBullets,
        camStatus,
        hasContact,
        optedIn,
      });
    }

    // Actualiza sesión con extractor (segunda llamada)
    const extractedSession = await extractSlots(history, prevSession, finalUserText);

    // Enforce candado opt-in (solo por lógica local)
    extractedSession.optedInToRegister = optedIn;

    // Conserva stage
    extractedSession.stage = stage;

    return res.status(200).json({
      text: String(assistantText || "Perfecto.").trim(),
      session: extractedSession,
    });
  } catch (err) {
    if (err && err.status) {
      return res.status(err.status).json({ error: "OpenAI request failed", detail: err.detail });
    }
    return res.status(500).json({ error: String(err) });
  }
}
