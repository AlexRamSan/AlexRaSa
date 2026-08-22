// Ruta del archivo: api/recommend.js

export default async function handler(req, res) {
  // 1. Validar método POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Solo se acepta POST.' });
  }

  const { prompt } = req.body || {};

  // 2. Validar prompt
  if (!prompt) {
    return res.status(400).json({ error: 'Falta el prompt en la petición.' });
  }

  // 3. Validar API Key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("FALTA API KEY: No se encontró OPENAI_API_KEY en las variables de entorno de Vercel.");
    return res.status(500).json({ error: 'Error de configuración: Falta la API Key en el servidor.' });
  }

  // REGLAS MAESTRAS DE REGO-FIX
  const REGO_FIX_EXPERT_RULES = `
    Eres el Ingeniero de Aplicaciones Senior de REGO-FIX.
    Tu objetivo es analizar técnicamente el mecanizado y recomendar la mejor configuración de sujeción (portaherramientas + boquilla) y los argumentos de retorno de inversión.

    REGLAS DE CATÁLOGO ESTRICTAS:
    1. REGLA MICRO-MECANIZADO (MR):
       - Si Ø < 3mm o < 1/8" -> Sistema: "micRun (MR)" (MR11 o MR16). Runout TIR ≤ 0.003mm a 3xD.
    2. REGLA ANTI PULL-OUT (secuRgrip - SG):
       - OBLIGATORIO si es Desbaste Pesado / HPC / Trocoidal en materiales difíciles (Titanio, Inconel, Aceros Inoxidables o Templados) Y Ø ≥ 10mm (o ≥ 3/8").
       - Restricciones de Husillo: HSK-A 63 soporta PG 15-SG, PG 25-SG y PG 32-SG. CAT 40 y BT 40 soportan a partir de PG 25-SG y PG 32-SG.
       - Nomenclatura: "powRgrip PG [Tamaño]-SG secuRgrip + Boquilla PG [Tamaño]-SG de [Ø]".
    3. REGLA POWRGRIP ESTÁNDAR (PG):
       - Casos de fresado de alta velocidad, eliminación de vibración y vida de herramienta.
       - Tamaños: PG 10 (hasta 6mm / 1/4"), PG 15 (hasta 12mm / 1/2"), PG 25 (hasta 20mm / 3/4"), PG 32 (hasta 25.4mm / 1"), PG 48 (hasta 40mm).
    4. REGLA MECANIZADO GENERAL (ER):
       - ER16 o ER32 solo si la aplicación es taladrado convencional o de bajo requerimiento.
    5. REGLA DE UNIDADES:
       - Si el diámetro equivale a una fracción estándar en pulgadas (ej. 6.35mm = 1/4", 12.7mm = 1/2", 3.175mm = 1/8", 19.05mm = 3/4"), escribe siempre la fracción en pulgadas. Conserva milímetros únicamente si el caso es netamente métrico (ej. 6mm, 10mm, 12mm).
    6. REGLA DE IDIOMA:
       - Redacta la recomendación y argumentos en el idioma especificado en el prompt (Español, Português o English).
    
    FORMATO: Responde ESTRICTAMENTE en el formato JSON solicitado sin texto adicional fuera del JSON.
  `;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: REGO_FIX_EXPERT_RULES
          },
          {
            role: "user",
            content: prompt
          }
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
    console.error("Error interno del servidor (Vercel):", error);
    return res.status(500).json({ error: 'Hubo un fallo de red o servidor al intentar conectar con la IA.' });
  }
}
