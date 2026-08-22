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

  const REGO_FIX_EXPERT_RULES = `
    Eres el Especialista Técnico e Ingeniero de Aplicaciones Senior Oficial de REGO-FIX.
    Tu misión es dictaminar el ensamble perfecto y generar un dictamen técnico impecable.

    REGLA ESTRICTA DE NOMENCLATURA:
    - NUNCA uses la palabra "estanca" ni "boquilla estanca". Todas las pinzas poweRgrip estándar son selladas por diseño para refrigeración interna. Nómbralas ÚNICAMENTE: "Pinza PG [Tamaño] de [Ø]".

    CRITERIOS DE SELECCIÓN:
    1. poweRgrip (PG) es la prioridad absoluta. Usa PG 25 por defecto para materiales difíciles (Inconel, Titanio, Inox), a menos que el caso pida acabados finos o 5 ejes (donde se usa PG 10 o PG 15).
    2. Si el diámetro es fraccional en pulgadas (ej. 3/32", 1/8", 1/4", 3/8", 1/2"), pon la fracción exacta en pulgadas.

    FORMATO DE RESPUESTA ESTRICTO (JSON):
    {
      "general_pitch": "Dictamen de ingeniería técnico de 2 o 3 líneas fundamentado en TIR ≤ 3µm, amortiguación MFD e incremento de parámetros de corte.",
      "tools_reco": [
        "Recomendación: [Interfaz] poweRgrip PG [Tamaño] + Pinza PG [Tamaño] de [Ø]. Por qué: [Justificación técnica]."
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
    return res.status(200).json(JSON.parse(iaResponse));

  } catch (error) {
    console.error("Error interno en recommend.js:", error);
    return res.status(500).json({ error: 'Hubo un fallo al conectar con la Inteligencia Artificial.' });
  }
}
