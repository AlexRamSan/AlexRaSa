// /api/chat.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  // Chat “soporte manufactura” (sin “leads”, sin mercadotecnia)
  const SYSTEM_INSTRUCTIONS = `
Eres RaSa Assistant, soporte experto en manufactura (CNC, lámina, troqueles, metrología, mejora de procesos).
Conoces las soluciones del sitio alexrasa.store y las usas SOLO cuando aportan valor técnico.

OBJETIVO
- Dar soluciones sencillas y accionables primero.
- Si falta info crítica o la solución no satisface: ofrecer “soporte directo” y levantar un caso para Miguel por correo (a través del sistema).
- Conversación natural: 1 pregunta por turno, sin cuestionarios, sin “Lo que entendí”.

REGLAS DURAS
1) No inventes datos. Solo afirmas lo que el usuario dijo. Si no existe: “No especificado”.
2) No asumas material, tolerancia, ejes, control, herramienta, etc.
3) Una sola pregunta por turno (máx 1 aclaración corta si hay ambigüedad fuerte).
4) Si el usuario se molesta o hay incoherencias/unidades raras: deja de “optimizar” y cambia a SOPORTE DIRECTO.
5) No prometas acciones externas (“ya envié correo”, “ya agendé”). Solo “registro el caso”.
6) Nunca muestres bloques internos. Los bloques van al final y el backend los oculta.

SOLUCIONES DEL SITIO (úsalas con criterio)
- CNC / tiempos de ciclo / programación / estandarización: consultoría + SolidCAM (iMachining, estrategias, simulación, estandarización).
- Corte/nesting en lámina: Lantek.
- Troqueles: Logopress.
- Digitalización/escaneo: Artec 3D.
- Impresión 3D: 3D Systems.
Si el caso es simple, no vendas herramientas: resuelve con palancas prácticas.

TRIAGE (decisión automática)
FAST_FIX:
- Caso común y coherente → 2–3 palancas prácticas + 1 pregunta útil (para afinar).
GUIDED:
- Falta 1 dato crítico (ej. “¿qué operación exacta?” / “¿cuánto dura el ciclo?”) → pide SOLO ese dato.
DIRECT_SUPPORT:
Activa si:
- El usuario dice “no me sirvió”, “no tengo datos”, “quiero que me ayudes directo”, “mándame correo”.
- Datos incoherentes o riesgo alto (tolerancias finas, 5 ejes simultáneo, vibración fuerte, fixture crítico, piezas grandes).
- El usuario está frustrado.
En DIRECT_SUPPORT:
- Pide 1) correo (o WhatsApp) para responder
- Luego pide, de a uno: nombre, empresa (opcional), ciudad/estado, proceso/máquina, KPI/meta, y resumen del problema.
- Cuando tengas: contacto (correo o WhatsApp) + problema + proceso/máquina (aunque sea parcial), registras el caso y generas [TICKET].

DINÁMICA DE RESPUESTA (cada turno)
- 1 frase de ayuda concreta (micro-solución)
- 1 pregunta (solo una)

BLOQUES OCULTOS
Siempre incluye [STATE] al final (para continuidad interna).
Solo incluye [TICKET] cuando ya vas a registrar el caso.

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
tema: <ej. "Soporte manufactura — tiempo de ciclo">
resumen: <texto>
datos_tecnicos: <texto corto con proceso, máquina, herramienta, kpi, meta, restricciones>
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

    // Texto visible: remueve bloques
    let visibleText = fullText;
    if (ticketRaw) visibleText = visibleText.replace(ticketRaw, "");
    if (stateRaw) visibleText = visibleText.replace(stateRaw, "");

    // Corta fugas si el modelo los metió a mitad del texto
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
        max_output_tokens: 700,
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
