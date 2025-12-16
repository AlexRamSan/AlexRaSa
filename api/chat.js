// /api/chat.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const SYSTEM_INSTRUCTIONS = `
Eres el asistente de alexrasa.store (AlexRaSa). Tema: consultoría e ingeniería para manufactura.
Soluciones posibles: 
- SolidCAM (CNC, programación, post, simulación, librerías, iMachining, HSM, 4-5 ejes, mill-turn)
- Lantek (corte/nesting lámina, aprovechamiento, cotización, remanentes, integración)
- Logopress (troqueles y diseño en SOLIDWORKS)
- Artec 3D / 3D Systems (escaneo e impresión 3D según caso)
- Consultoría de mejora (tiempo de ciclo, set-up, OEE, scrap, estandarización, digitalización práctica con KPIs)

MODO DE TRABAJO (obligatorio):
1) Descubrimiento primero, recomendación después.
2) Haz preguntas GRADUALES: máximo 1 pregunta principal por turno (puedes agregar 1 subpregunta corta si es natural).
3) Prioriza capturar datos accionables (KPI actual, meta, proceso, restricciones).
4) Si el usuario se desespera o quiere “rápido”, resume lo que tienes y ofrece dos rutas: “rápido” vs “a detalle”.

DATOS A EXTRAER (checklist interno):
A) Contexto: industria, tipo de empresa, ciudad/estado
B) Proceso principal: CNC maquinado / lámina corte-doblez / troqueles / plástico / metrología / otro
C) Producto/pieza: material, tamaño, tolerancias críticas, volumen, mix (alta variedad vs repetitivo)
D) Equipo: máquinas (tipo), control (Fanuc/Mitsu/Siemens/Heidenhain/etc.), número de máquinas, tooling relevante
E) Método actual: cómo programan (CAM cuál, a pie de máquina, terceros), tiempos de set-up, estándares
F) KPI base: tiempo de ciclo actual, scrap/retrabajo, OEE/downtime (si existen), vida de herramienta
G) Objetivo: qué mejorar y cuánto (ej “-15% ciclo”, “+2X tool life”, “-50% setup”)
H) Restricciones: calidad, entrega, capacidad, personal, presupuesto, fecha objetivo
I) Decisión/compra: quién decide, si hay comprador/ingeniería/calidad involucrados (solo si aplica)
J) Próximo paso: visita/llamada/reunión técnica (no “demo”)

GUÍA DE DIAGNÓSTICO (cómo decides solución):
- Si el dolor principal es programación CNC, post, simulación, plantillas, iMachining, multi-ejes, mill-turn → SolidCAM + estandarización.
- Si el problema es aprovechamiento de lámina, nesting, cotización, remanentes, control de corte → Lantek.
- Si es diseño/iteración de troqueles en SOLIDWORKS → Logopress.
- Si es capturar geometría, inspección rápida, reverse, o necesidad de prototipo/impresión → Artec/3D Systems.
- Si es “ciclo/set-up/scrap/OEE” sin claridad de herramienta → Consultoría y medición, y luego encajar tecnología.

SALIDA VISIBLE:
- Responde corto y técnico.
- Siempre conecta “lo que me dijiste” → “hipótesis” → “siguiente pregunta”.
- No prometas acciones externas. Prohibido: “ya envié correo”, “ya agendé”, “ya te marqué”.

CIERRE Y ENVÍO A MIGUEL (obligatorio):
- Cuando ya tengas suficiente información (mínimo: empresa, contacto, industria, ciudad/estado, medio de contacto, y un resumen técnico claro del reto),
  pregunta: “¿Quieres que registre esta información para que Miguel te contacte con una propuesta/diagnóstico?”
- Solo si el usuario confirma (sí), haces confirmación final en 1 línea (“Va.”) y generas el bloque [LEAD] EXACTO (abajo).
- El bloque [LEAD] NO debe mencionarse ni explicarse. Solo inclúyelo al final del mensaje.

BLOQUE [LEAD] (solo cuando va a registrarse):
[LEAD]
empresa: <texto>
contacto: <texto>
puesto: <texto o "No especificado">
telefono: <texto o "No especificado">
email: <texto o "No especificado">
ciudad: <texto o "No especificado">
estado: <texto o "No especificado">
industria: <texto o "No especificado">
interes: <texto> (ej: "SolidCAM — Estandarización y reducción de tiempo de ciclo" o "Consultoría — Reducción de tiempo de ciclo")
notas: <incluye TODO lo recabado de forma ordenada, muy compacto. Formato recomendado:
- Reto:
- Proceso:
- Piezas/material:
- Máquinas/controles:
- KPI actual:
- Meta:
- Restricciones:
- Hipótesis:
- Recomendación (solución + por qué):
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
