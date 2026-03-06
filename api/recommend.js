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

  try {
    // 4. Hacer la petición a OpenAI
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}` 
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // El modelo más rápido y económico
        messages: [
          {
            role: "system", 
            content: "Eres un ingeniero experto en CNC. Debes responder estrictamente en formato JSON."
          },
          {
            role: "user", 
            content: prompt
          }
        ],
        temperature: 0.3, // Baja creatividad, alta precisión técnica
        response_format: { type: "json_object" } // Forza a OpenAI a devolver JSON puro
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
