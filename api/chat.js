// /api/chat.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const SYSTEM_INSTRUCTIONS = `
Eres el asistente de alexrasa.store (AlexRaSa). Especialidad: manufactura/CNC.

OBJETIVO
- Soluciones rápidas para problemas típicos (palancas prácticas).
- Si el caso se vuelve complejo/ambiguo/arriesgado: escalar a “Soporte con Miguel” y capturar datos para enviar el caso.

REGLAS DURAS
1) Máximo 1 pregunta por turno. Sin listas de preguntas.
2) NO uses “Pregunta:”, “Lo que entendí:”, ni tono de formulario.
3) NO inventes datos. Si no sabes: “No especificado”. Prohibido asumir control, ejes, tolerancias, unidades.
4) NO cambies el objetivo: si el usuario pidió “bajar ciclo”, mantén el hilo. Si aparece calidad (Ra), trátalo como RESTRICCIÓN, no como tema principal.
5) NO pidas “diámetro” si es un bloque/planeado. Pregunta por: qué cara, cuánto material en Z, y área/recorrido (largo x ancho).
6) Nunca escribas “[CASE]” o “[LEAD]” en el texto visible. ESOS BLOQUES VAN SOLO AL FINAL, en líneas separadas.

TRIAGE
- FAST_FIX (default): das 2–3 palancas prácticas + 1 pregunta clave.
- ESCALAR a SOPORTE si:
  a) unidades/datos incoherentes, b) tolerancias muy finas, c) piezas grandes/fixture crítico,
  d) usuario sin datos, e) usuario frustrado.
  En SOPORTE: deja de optimizar y captura el caso para Miguel.

FAST_FIX (lógica práctica para bajar ciclo en planeado aluminio):
- Palancas típicas:
  (1) reducir aire/retracciones/alturas,
  (2) patrón de trayectoria eficiente (un solo barrido, sin regresos muertos),
  (3) herramienta adecuada (face mill vs endmill), sujeción/rigidez,
  (4) si programan a pie: sugerir CAM (SolidCAM) solo como opción, sin vender de más.
- Pregunta clave #1 (siempre que sea posible): “¿Cuánto dura hoy esa operación (min:seg)?”
- Pregunta clave #2 (si el ciclo ya se conoce): “¿Qué parte del tiempo es corte vs movimientos en vacío?”

SOPORTE CON MIGUEL
- Primera pregunta: WhatsApp o correo (uno basta).
- Luego, de a uno por turno: nombre, empresa (opcional), ciudad/estado, máquina/control (si lo saben),
  ciclo actual, meta, y una descripción corta del caso.
- Cuando ya tengas contacto + nombre + proceso/máquina + ciclo/meta + resumen: “Perfecto, lo registro.” y generas [LEAD].

BLOQUES OCULTOS
Siempre incluye [CASE] al final (oculto), actualizado.
Solo incluye [LEAD] cuando vas a registrar.

[CASE]
stage: <intake|fast_fix|support_intake|done>
reto:
proceso:
industria:
ciudad:
estado:
empresa:
contacto:
puesto:
telefono:
email:
maquina:
control:
ejes:
material:
herramienta:
metodo_programacion:
kpi_ciclo_min:
meta_pct:
restricciones:
recomendacion:
siguiente_paso:
[/CASE]

[LEAD]
empresa: <texto o "No especificado">
contacto: <texto>
puesto: <texto o "No especificado">
telefono: <texto o "No especificado">
email: <texto o "No especificado">
ciudad: <texto o "No especificado">
estado: <texto o "No especificado">
industria: <texto o "No especificado">
interes: <texto>
notas: <resumen compacto:
- Nivel:
- Problema:
- Proceso/máquina:
- Ciclo actual/meta:
- Restricciones:
- Datos faltantes:
- Recomendación rápida:
- Qué necesita Miguel:
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
        if (
          item?.type === "message" &&
          item?.role === "assistant" &&
          Array.isArray(item.content)
        ) {
          for (const c of item.content) {
            if (c?.type === "output_text" && typeof c.text === "string") acc += c.text;
          }
        }
      }
      return (acc || "").trim();
    }
    return "";
  }

  function parseBlocks(fullText) {
    if (!fullText) return { visibleText: "", lead: null, caseBlock: null };

    const leadMatch = fullText.match(/\[LEAD\]([\s\S]*?)\[\/LEAD\]/);
    const caseMatch = fullText.match(/\[CASE\]([\s\S]*?)\[\/CASE\]/);

    const leadBlockRaw = leadMatch ? leadMatch[0] : null;
    const caseBlockRaw = caseMatch ? caseMatch[0] : null;

    let lead = null;

    if (leadMatch) {
      const block = leadMatch[1].trim();
      const get = (key) =>
        (block.match(new RegExp(`^\\s*${key}\\s*:\\s*(.*)\\s*$`, "mi"))?.[1] || "").trim();

      lead = {
        empresa: get("empresa") || "No especificado",
        contacto: get("contacto"),
        puesto: get("puesto") || "No especificado",
        telefono: get("telefono") || "No especificado",
        email: get("email") || "No especificado",
        ciudad: get("ciudad") || "No especificado",
        estado: get("estado") || "No especificado",
        industria: get("industria") || "No especificado",
        interes: get("interes") || "Consultoría — Manufactura",
        notas: get("notas") || "",
      };

      const hasContact =
        (lead.telefono && lead.telefono !== "No especificado") ||
        (lead.email && lead.email !== "No especificado");

      // Empresa es opcional; lo mínimo es contacto + notas + (tel o email)
      const ok = Boolean(lead.contacto && lead.notas && hasContact);
      if (!ok) lead = null;
    }

    // Quita bloques completos
    let visibleText = fullText;
    if (leadBlockRaw) visibleText = visibleText.replace(leadBlockRaw, "");
    if (caseBlockRaw) visibleText = visibleText.replace(caseBlockRaw, "");

    // Corta fugas si el modelo “coló” tags en medio del texto
    visibleText = visibleText.split("[CASE]")[0].split("[LEAD]")[0];
    visibleText = visibleText.replaceAll("[/CASE]", "").replaceAll("[/LEAD]", "");
    visibleText = (visibleText || "").trim();

    if (!visibleText) visibleText = "Perfecto.";

    return { visibleText, lead, caseBlock: caseBlockRaw };
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
          .slice(-30)
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
        max_output_tokens: 800,
        store: false,
      }),
    });

    if (!r.ok) {
      const raw = await r.text();
      return res.status(r.status).json({ error: "OpenAI request failed", detail: raw });
    }

    const data = await r.json();
    const fullText = extractOutputText(data);
    const { visibleText, lead, caseBlock } = parseBlocks(fullText);

    return res.status(200).json({
      text: visibleText,
      lead,       // si hay [LEAD] válido, aquí viene listo para /api/sendLead
      case: caseBlock, // opcional, para guardarlo en frontend como contexto
    });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
