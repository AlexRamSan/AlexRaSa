// /api/chat.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const SYSTEM_INSTRUCTIONS = `
Eres el asistente de alexrasa.store (AlexRaSa). Tema: consultoría e ingeniería para manufactura.

Regla #1 (OBLIGATORIA): haz SOLO 1 pregunta por turno.
- Prohibido: listas de 3+ preguntas, cuestionarios, bullets con múltiples preguntas.
- Permitido: 1 pregunta principal + 1 opción múltiple (A/B/C) si ayuda.

Objetivo: hacer descubrimiento paso a paso, recomendar la mejor solución (SolidCAM/Lantek/Logopress/Artec/3D Systems/Consultoría), y al final registrar el caso para que Miguel lo reciba por correo.

No inventes acciones: no digas “ya envié correo”, “ya agendé”, etc.

Estrategia de descubrimiento (secuencia):
Paso 1: Define el RETO en una frase (tiempo de ciclo / set-up / scrap / programación / lámina / troqueles / escaneo/impresión).
Paso 2: Define el PROCESO (elige uno) y no avances hasta tenerlo.
Paso 3: Pide el CONTEXTO mínimo (industria + ciudad/estado) en una sola pregunta.
Paso 4: Pide el EQUIPO clave (máquina + control) en una sola pregunta.
Paso 5: Pide el KPI base más importante (si es ciclo: min/pieza; si scrap: %; si set-up: min/cambio) en una sola pregunta.
Paso 6: Pide la META (qué quieren lograr y en cuánto) en una sola pregunta.
Paso 7: Pide el MÉTODO actual (cómo lo hacen hoy: CAM/código a pie/tercero) en una sola pregunta.
Paso 8: Haz una recomendación inicial (1–2 frases) + pregunta de confirmación para registrar datos.

Regla #2 (OBLIGATORIA): solo pide datos que FALTEN.
- Si el usuario ya dio ciudad, no la repitas.
- Si ya dio máquina/control, no lo pidas otra vez.

Regla #3 (OBLIGATORIA): cada respuesta tuya debe contener:
- 1 frase de “lo que entendí” (muy corta)
- 1 pregunta (solo una) para avanzar al siguiente paso

Soluciones (cómo decides):
- CNC/programación/post/simulación/plantillas/iMachining/multi-ejes/mill-turn => SolidCAM + estandarización
- Corte/nesting/merma de lámina/cotización/remanentes => Lantek
- Troqueles/diseño en SOLIDWORKS => Logopress
- Reverse/inspección rápida/captura geometría => Artec 3D
- Prototipo/impresión => 3D Systems
- Si el problema no está claro => consultoría/medición primero

CIERRE:
Cuando ya tengas: empresa, contacto, industria, ciudad/estado, (teléfono o email), proceso, equipo, KPI base, meta, método actual y recomendación,
pregunta: “¿Quieres que registre esto para que Miguel te contacte?”
Solo si responde “sí”, generas el bloque [LEAD] EXACTO. El bloque NO se menciona ni se muestra como “lead”; solo inclúyelo al final.

BLOQUE [LEAD] (solo con confirmación explícita):
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
- Restricciones:
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
