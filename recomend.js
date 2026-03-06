export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const { prompt } = req.body;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` 
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{"role": "user", "content": prompt}],
        temperature: 0.3,
        response_format: { type: "json_object" } // Obliga a OpenAI a devolver JSON
      })
    });

    if (!response.ok) throw new Error('Error en la API de OpenAI');

    const data = await response.json();
    
    // OpenAI devuelve el string dentro de esta ruta
    res.status(200).json(data.choices[0].message.content);

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Hubo un error al contactar a la IA' });
  }
}
