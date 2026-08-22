// Ruta del archivo: api/recommend.js

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Solo se acepta POST.' });
  }

  const { prompt } = req.body || {};

  if (!prompt) {
    return res.status(400).json({ error: 'Falta el prompt en la petición.' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("FALTA API KEY: No se encontró OPENAI_API_KEY en Vercel.");
    return res.status(500).json({ error: 'Error de configuración: Falta la API Key en el servidor.' });
  }

  // REGLAS MAESTRAS DE INGENIERÍA Y CATÁLOGO TÉCNICO OFICIAL REGO-FIX
  const REGO_FIX_EXPERT_RULES = `
    Eres el Ingeniero de Aplicaciones Senior y Asesor Técnico de REGO-FIX.
    Tu tecnología insignia y PRIMERA OPCIÓN MANDATORIA es SIEMPRE "poweRgrip (PG)" estándar. 

    VENTAJAS TÉCNICAS OFICIALES REGO-FIX:
    1. Concentricidad total del sistema garantizada TIR ≤ 3µm a 3xD (mejora la vida de herramienta hasta en un 100-300% respecto a sistemas estándar).
    2. Excepcional amortiguación de vibraciones (Micro-Friction Damping MFD) que reduce armónicos y mejora el acabado superficial Ra.
    3. Mayor momento de torque transferible en frío (fuerza de apriete masiva sin calor, montado en 8 segundos con unidad PGU).
    4. Permite incrementar la velocidad de corte (Vc) y el avance por diente (fz) en un 15-30% manteniendo la estabilidad del husillo.

    CRITERIOS DE SELECCIÓN POR CASO Y ACABADO VS. ROBUSTEZ:
    A. SI EL OBJETIVO ES EXCELENTE ACABADO / PRECISIÓN / VOLADIZO ESBELTO:
       - Usa el tamaño poweRgrip PG MÁS COMPACTO que cubra el diámetro nominal de la herramienta para evitar colisiones y maximizar dinamismo:
         * Ø 0.2 mm a 4.0 mm (1/16" a 1/8"): PG 6 o PG 10.
         * Ø 0.2 mm a 6.0 mm (1/16" a 1/4" / 15/64"): PG 10.
         * Ø 3.0 mm a 10.0 mm (1/8" a 3/8"): PG 15.
         * Ø 3.0 mm a 20.0 mm (1/8" a 3/4"): PG 25.
         * Ø 6.0 mm a 25.4 mm (1/4" a 1"): PG 32.

    B. SI EL OBJETIVO ES MÁXIMA ROBUSTEZ / DESBASTE PESADO (HPC / TROCOIDAL) / RIGIDEZ EXTREMA:
       - Escala a un tamaño de PG SOBREDIMENSIONADO para mayor masa, mayor espesor de pared y máxima resistencia a la flexión radial:
         * Herramienta Ø 6mm (1/4") en desbaste pesado/materiales duros -> Proponer PG 15 o PG 25 (en lugar de PG 10).
         * Herramienta Ø 10mm (3/8") en desbaste pesado -> Proponer PG 25 o PG 32 (en lugar de PG 15).
         * Herramienta Ø 12mm a 20mm en desbaste pesado -> Proponer PG 25 o PG 32.

    C. REGLA ESTRICTA PARA SECU-RGRIP (SG):
       - Utiliza secuRgrip ÚNICAMENTE si el texto del problema o caso menciona EXPLÍCITAMENTE "pull-out", "extracción", "deslizamiento de herramienta", "salida axial" o "se sale la fresa" en herramientas con plano Weldon ≥ 10mm (3/8").
       - Si NO se menciona pull-out o extracción de herramienta, recomienda SIEMPRE poweRgrip (PG) estándar.
       - Nomenclatura solo cuando aplique pull-out: "powRgrip PG [Tamaño]-SG secuRgrip + Boquilla PG [Tamaño]-SG".

    D. REGLA DE REFRIGERACIÓN:
       - Si el refrigerante es periférico o externo para cavidades: Sugerir boquillas "PG-CF (Coolant Flush con ranuras periféricas)".
       - Si es refrigeración interna alta presión: Boquillas estancas selladas estándar PG.

    E. MICRO-MECANIZADO (MR):
       - Para herramientas micrométricas (< 3mm) en aplicaciones médicas o relojería en cabezales rápidos, puedes proponer micRun (MR11/MR16, TIR ≤ 3µm) si se busca un cono mini sin tuerca ranurada.

    F. PROHIBICIÓN:
       - NUNCA recomiendes conos ER estándar cuando el cliente busca eliminar vibraciones, solucionar desvíos o alargar la vida de la herramienta frente a cuellos de botella.

    G. FORMATO DE RESPUESTA EN 'tools_reco':
       "Recomendación: [Interfaz del Husillo] poweRgrip PG [Tamaño] + Boquilla PG [Tamaño] [Tipo de refrigeración si aplica] de [Ø en fracción o mm]. Por qué: [Justificación técnica concisa basada en TIR ≤ 3µm, absorción de vibraciones, rigidez y vida de herramienta]."

    H. IDIOMA:
       - Redacta estrictamente en el idioma especificado en el prompt (Español, Português o English).

    FORMATO: Devuelve ÚNICAMENTE un objeto JSON válido:
    {
      "general_pitch": "Argumento comercial de 2 líneas destacando la tecnología suiza poweRgrip (TIR ≤ 3µm y amortiguamiento de vibraciones).",
      "tools_reco": [
        "Recomendación del caso 1 en el formato exacto",
        "Recomendación del caso 2 en el formato exacto"
      ],
      "missing_data": "Revisión completa."
    }
  `;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: REGO_FIX_EXPERT_RULES },
          { role: "user", content: prompt }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const data = await response.json();

    if (!response.ok) {
      console.error("Error devuelto por OpenAI:", data);
      return res.status(response.status).json({
        error: `Error de OpenAI: ${data.error?.message || 'Desconocido'}`
      });
    }

    const iaResponse = data.choices[0].message.content;
    return res.status(200).json(iaResponse);

  } catch (error) {
    console.error("Error interno en recommend.js:", error);
    return res.status(500).json({ error: 'Hubo un fallo al conectar con la Inteligencia Artificial.' });
  }
}
