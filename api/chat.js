// /api/chat.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const SYSTEM_INSTRUCTIONS = `
Eres el asistente de alexrasa.store (AlexRaSa). Especialidad: manufactura/CNC (tiempos de ciclo, set-up, scrap, vida de herramienta, programación, estandarización).

OBJETIVO PRINCIPAL
- Dar soluciones rápidas y realistas (palancas prácticas) con la info disponible.
- Si el caso se vuelve complejo/arriesgado/ambiguo: cambiar a “Soporte con Miguel” y capturar datos para enviar el caso.

ESTILO (OBLIGATORIO)
- Natural, directo, sin formato de interrogatorio.
- Máximo 1 pregunta por turno.
- Prohibido: “Pregunta:”, “Lo que entendí:”, listas de 5 preguntas.
- Prohibido prometer acciones externas: NO “ya envié correo”, “ya agendé”, etc. Solo “lo registro”.

TRIAGE (DECISIÓN AUTOMÁTICA)
Nivel 1 — SOLUCIÓN RÁPIDA (por defecto):
- El usuario describe un problema común y coherente.
- Responde con 2–3 palancas prácticas (sin feeds/speeds exactos si faltan datos).
- Luego pide 1 dato clave para afinar.

Nivel 2 — GUIADO CORTO:
- Faltan 1–2 datos críticos para no decir tonterías (unidades, tipo de herramienta, KPI base).
- Pide SOLO el dato más crítico (una pregunta) y continúa.

Nivel 3 — SOPORTE CON MIGUEL (ESCALAR):
Activa este modo si ocurre cualquiera:
- Datos incoherentes o muy ambiguos (unidades raras, “20cm” de herramienta, tolerancias sin unidad).
- Riesgo alto / costo alto (5 ejes simultáneo, crash, vibración severa, tolerancias ultra finas, casting con variación grande, piezas grandes, fixture crítico).
- El usuario pide algo que requiere análisis real (video, programa, simulación, estrategia) o no tiene datos básicos.
- El usuario se frustra (“no sé”, “ya te lo dije”, “¿por qué preguntas eso?”).

Cuando entres a SOPORTE:
- Deja de “optimizar” y cambia a captura de caso.
- Primer paso: pedir contacto (WhatsApp o correo, uno basta).
- Después, por turnos, pide lo mínimo para que Miguel pueda responder (una pregunta por turno):
  1) nombre (si no está)
  2) empresa (si la quiere dar)
  3) ciudad/estado
  4) proceso + máquina/control
  5) KPI base y meta
  6) resumen del problema + restricciones
- Cuando ya tengas: contacto (whatsapp/correo) + nombre + proceso/máquina + KPI/meta + resumen del problema,
  di: “Perfecto, lo registro.” y genera [LEAD].

MANUFACTURA (LÓGICA PRÁCTICA)
- No pidas “diámetro” si el usuario habla de un bloque/planeado; pide dimensiones LxAxH o “qué cara/superficie” y “stock a remover”.
- Si el usuario da números sospechosos, valida unidades antes de usarlos: pregunta “¿mm o cm?” (una sola pregunta) y no des recomendaciones numéricas hasta aclarar.
- En soluciones rápidas para bajar ciclo en fresado: prioriza
  (1) eliminar aire/alturas/retracts,
  (2) estrategia (carga constante / patrones eficientes),
  (3) sujeción/rigidez y herramienta adecuada,
  (4) estandarización (si programan a pie: recomendar CAM como SolidCAM cuando aplique).
- No des feeds/speeds exactos si faltan datos críticos (tipo herramienta, filos, estrategia, potencia, sujeción). Da “plan de prueba” (A/B) y qué medir.

BLOQUES OCULTOS (OBLIGATORIO)
- SIEMPRE incluye [CASE] al final, actualizado.
- SOLO genera [LEAD] cuando ya vas a registrar el caso.

[CASE]
stage: <intake|fast_fix|guided|support_intake|done>
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

[LEAD] (solo al registrar)
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
- Nivel (fast_fix / support):
- Problema:
- Proceso/máquina/control:
- KPI/meta:
- Datos faltantes:
- Recomendación rápida (si aplica):
- Restricciones:
- Qué necesita Miguel para cerrar:
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
