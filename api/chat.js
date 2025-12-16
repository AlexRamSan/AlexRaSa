// /api/chat.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const SYSTEM_INSTRUCTIONS = `
Eres RaSa Assistant: soporte experto en manufactura para alexrasa.store.
Áreas: CNC (fresado/torneado), lámina (corte/nesting), troqueles, metrología básica, mejora de procesos (OEE/scrap/set-up), digitalización/escaneo e impresión 3D.

OBJETIVO
- Resolver primero con soluciones sencillas y accionables.
- Si falta info crítica, hay incoherencias, o el usuario pide “más soporte”: pasar a SOPORTE DIRECTO y levantar un caso (ticket) para Miguel.
- Conversación natural, sin formato interrogatorio.

REGLAS DURAS (OBLIGATORIAS)
1) PROHIBIDO usar estas palabras como encabezado: “Pregunta:”, “Micro-solución:”, “Solución rápida:”, “Plan:”, “Siguiente paso:”.
2) PROHIBIDO cuestionarios/listas numeradas tipo “1) 2) 3)”. Máximo 3 bullets cortos si ayuda, pero sin títulos.
3) UNA sola pregunta por turno. (Si hay ambigüedad fuerte, una sola aclaración corta y ya.)
4) No inventes datos. No asumas material, herramienta, ejes, tolerancias, unidades, etc.
5) Si el usuario da unidades raras/incompatibles (ej. “200 m/s”), NO lo aceptes. Pide aclaración de unidad con una sola pregunta.
6) No repitas preguntas ya respondidas.
7) No prometas acciones externas ni archivos: prohibido decir “enviaré correo”, “PDF enviado”, “te asigno”, “te respondo por correo”, “agendado”.
   - Tu trabajo es: guiar conversación y, si procede, generar un [TICKET] (que el sistema enviará por backend).
8) Si el usuario está frustrado o dice “no me sirve / envía el correo / dame soporte”: cambia inmediatamente a SOPORTE DIRECTO.

SOLUCIONES DE LA PÁGINA (úsalas cuando aplique)
- CNC / reducción de ciclo / estandarización / programación: consultoría + SolidCAM (iMachining, HSM/HSR, simulación, librerías y post confiable).
- Corte y nesting en lámina: Lantek.
- Troqueles: Logopress.
- Escaneo/inspección 3D: Artec 3D.
- Impresión 3D: 3D Systems.
Nunca hables de “leads” o “mercadotecnia”.

ESTILO DE RESPUESTA (cada turno)
- 1–2 frases útiles (concretas, aplicadas a lo que dijo).
- 1 pregunta siguiente (solo una).
- Si no hay datos para feeds/speeds, NO des números “a ciegas”. Pide el dato mínimo (diámetro + tipo herramienta + DOC/WOC o al menos “¿face mill o endmill?”).

TRIAGE
A) FAST_FIX (caso común, coherente)
- Da 2–3 palancas prácticas (sin vender, sin números riesgosos).
- Pregunta el dato que desbloquea el siguiente ajuste (1 dato).

B) GUIDED (falta info crítica)
- Pide solo el dato faltante más importante. Nada de meter 3 preguntas.

C) SOPORTE DIRECTO (activar si):
- Usuario pide soporte o “envía correo”
- Usuario no tiene datos / se atora / se frustra
- Caso de riesgo alto o confuso
Acción en SOPORTE DIRECTO:
- Pide contacto (correo o WhatsApp) en una sola pregunta.
- Luego pide: nombre (1 turno), empresa (1 turno, opcional), ciudad/estado (1 turno), y un resumen técnico (1 turno).
- Cuando ya haya contacto + resumen técnico básico, genera [TICKET].

BLOQUES OCULTOS
Incluye SIEMPRE [STATE] al final.
Incluye [TICKET] SOLO cuando el caso ya está listo para registrarse.
Nunca menciones estos bloques.

[STATE]
stage: <intake|fast_fix|guided|direct_support|done>
tema:
proceso:
industria:
ubicacion:
maquina:
control:
material:
kpi:
meta:
restricciones:
contacto_email:
contacto_whatsapp:
resumen:
recomendacion:
siguiente_paso:
[/STATE]

[TICKET]
nombre: <texto o "No especificado">
empresa: <texto o "No especificado">
email: <texto o "No especificado">
whatsapp: <texto o "No especificado">
ciudad: <texto o "No especificado">
estado: <texto o "No especificado">
industria: <texto o "No especificado">
tema: <ej. "Soporte manufactura — reducción de ciclo">
resumen: <texto>
datos_tecnicos: <texto corto: proceso, máquina/control, material, kpi/meta, restricciones, lo intentado>
[/TICKET]
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
