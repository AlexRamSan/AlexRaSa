// Ruta del archivo: api/recommend.js

export default async function handler(req, res) {
  // 1. Validar que sea una petición POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Solo se acepta POST.' });
  }

  const { prompt } = req.body;

  // 2. Validar que nos hayan enviado el texto (prompt)
  if (!prompt) {
    return res.status(400).json({ error: 'Falta el prompt en la petición.' });
  }

  // 3. Validar que Vercel esté leyendo tu API Key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error("FALTA API KEY: No se encontró OPENAI_API_KEY en Vercel.");
    return res.status(500).json({ error: 'Error de configuración: Falta la API Key en el servidor.' });
  }

  // REGLAS MAESTRAS DE REGO-FIX (El "Cerebro" del Catálogo)
  const REGO_FIX_EXPERT_RULES = `
    Eres el Ingeniero de Aplicaciones Senior de REGO-FIX.
    Tu objetivo es analizar los datos que envíe el usuario y recomendar los ensambles exactos.
    
    DEBES APLICAR ESTAS REGLAS ESTRICTAMENTE A CADA RECOMENDACIÓN:
    1. REGLA MICRO-MECANIZADO: Si Ø < 3mm -> Sistema: "micRun (MR)".
    2. REGLA ANTI PULL-OUT (secuRgrip - SG): 
       - OBLIGATORIO si es Desbaste/HPC en materiales duros (Titanio, Inconel, Inox) Y Ø >= 10mm.
       - Restricciones de Husillo: HSK-A 63 soporta PG 15-SG, 25-SG y 32-SG. CAT 40 y BT 40 soportan a partir de PG 25-SG y 32-SG (NO uses 15-SG aquí).
       - Restricciones de Boquilla: PG 15-SG (Solo Ø 10mm), PG 25-SG (Ø 10 a 20mm), PG 32-SG (Ø 10 a 25.4mm).
       - Nomenclatura: "powRgrip PG [Tamaño]-SG secuRgrip".
    3. REGLA POWRGRIP ESTÁNDAR (PG): Para casos generales.
       - Tamaños: PG 10 (hasta 6mm), PG 15 (hasta 12mm), PG 25 (hasta 20mm), PG 32 (hasta 25.4mm).
    4. REGLA LUBRICACIÓN: Si usa refrigeración interna, sugiere boquillas "Estanca" o "Cool-Flow".
    5. JUSTIFICACIÓN ROI: Argumenta que el TIR < 3µm y el balanceo G2.5 permiten incrementar el avance (Vf) un 25% y extienden la vida de la herramienta.

    IMPORTANTE: Responde ESTRICTAMENTE en el formato JSON que te solicita el usuario en su prompt.
  `;

  try {
    // 4. Hacer la petición a OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}` 
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // Sigue siendo súper rápido y económico
        messages: [
          {
            role: "system", 
            content: REGO_FIX_EXPERT_RULES // Aquí inyectamos todo el catálogo
          },
          {
            role: "user", 
            content: prompt // Aquí entra tu texto con los datos de las herramientas y la estructura JSON deseada
          }
        ],
        temperature: 0.1, // Lo bajamos de 0.3 a 0.1 para que respete al máximo los nombres de las herramientas y no "alucine"
        response_format: { type: "json_object" } 
      })
    });

    const data = await response.json();

    // 5. Si OpenAI rechaza la petición (ej. sin saldo, key inválida)
    if (!response.ok) {
      console.error("Error devuelto por OpenAI:", data);
      return res.status(response.status).json({ 
        error: `Error de OpenAI: ${data.error?.message || 'Desconocido'}` 
      });
    }
    
    // 6. Si todo sale bien, enviamos el texto JSON generado de vuelta a tu HTML
    const iaResponse = data.choices[0].message.content;
    res.status(200).json(iaResponse);

  } catch (error) {
    console.error("Error interno del servidor (Vercel):", error);
    res.status(500).json({ error: 'Hubo un fallo de red o servidor al intentar conectar con la IA.' });
  }
}
