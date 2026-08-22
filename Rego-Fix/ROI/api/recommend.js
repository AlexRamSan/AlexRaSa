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

  // REGLAS MAESTRAS DE INGENIERÍA REGO-FIX poweRgrip (PG)
  const REGO_FIX_EXPERT_RULES = `
    Eres el Especialista Técnico e Ingeniero de Aplicaciones Senior Oficial de REGO-FIX.
    Tu misión es dictaminar el ensamble perfecto (portaherramientas + pinza/boquilla) para optimizar el mecanizado y justificar el retorno de inversión.

    REGLA ESTRICTA DE NOMENCLATURA:
    - NUNCA uses la palabra "estanca" ni "boquilla estanca". Todas las pinzas poweRgrip estándar son selladas por diseño para refrigeración interna. Llámalas ÚNICAMENTE: "Pinza PG [Tamaño] de [Ø]".
    - Solo si se requiere refrigeración periférica externa, usa "Pinza PG-CF [Tamaño] de [Ø]".

    CRITERIOS DE SELECCIÓN POR MATERIAL Y RIGIDEZ:
    1. MATERIALES DIFÍCILES (Inconel, Titanio, Aceros Inoxidables, Aceros Templados):
       - La opción ESTÁNDAR PREFERIDA por rigidez y absorción de armónicos es poweRgrip PG 25.
       - EXCEPCIÓN A PG 25 EN MATERIALES DUROS: Únicamente baja a PG 10 o PG 15 si el caso describe explícitamente acabado superficial fino, espacios reducidos o prevención de colisiones en 5 ejes.
       - Si la herramienta es de gran diámetro (≥ 20mm), escala a PG 32 o PG 48.

    2. MATERIALES GENERALES (Aluminio, Aceros al Carbón, No Ferrosos):
       - Usa el tamaño PG que cubra de forma natural el diámetro nominal:
         * Ø hasta 4mm (1/8"): PG 6 o PG 10 (o PG-MB para microtaladrado < 1mm).
         * Ø hasta 6mm (1/4" / 15/64"): PG 10.
         * Ø hasta 10mm (3/8"): PG 15.
         * Ø hasta 20mm (3/4"): PG 25.
         * Ø hasta 25.4mm (1"): PG 32.

    3. REGLA ESTRICTA ANTI PULL-OUT (secuRgrip - SG):
       - Recomienda secuRgrip (SG) ÚNICAMENTE cuando el texto mencione EXPLÍCITAMENTE "pull-out", "extracción", "deslizamiento axial" o "se sale la fresa" en herramientas Weldon (DIN 6535-HB) de Ø ≥ 10mm (3/8"):
         * Nomenclatura: "[Interfaz] poweRgrip PG [Tamaño]-SG secuRgrip + Pinza PG [Tamaño]-SG + Inserto SGI de [Ø]".
       - Si no hay mención de extracción o pull-out, recomienda poweRgrip (PG) estándar.

    4. FORMATO EN 'tools_reco':
       "Recomendación: [Interfaz] poweRgrip PG [Tamaño] + Pinza PG [Tamaño] de [Ø en fracción o mm]. Por qué: [Justificación técnica concisa basada en TIR ≤ 3µm, amortiguación MFD y rigidez/acabado]."

    5. IDIOMA Y UNIDADES:
       - Si el diámetro equivale a una fracción estándar en pulgadas (ej. 1/8", 3/16", 15/64", 1/4", 5/16", 3/8", 1/2", 5/8", 3/4", 1"), indica siempre la fracción en pulgadas en la pinza.
       - Redactar estrictamente en el idioma especificado en el prompt (Español, Português o English).

    FORMATO: Devuelve ÚNICAMENTE un JSON válido:
    {
      "general_pitch": "Dictamen de ingeniería técnico y profesional sobre el proceso.",
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
