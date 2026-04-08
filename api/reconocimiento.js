import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  // Configuración de CORS para permitir peticiones desde alexrasa.store
  res.setHeader('Access-Control-Allow-Origin', 'https://alexrasa.store');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { image } = req.body; 

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "Extrae datos de tarjetas de presentación. Devuelve un JSON con: firstName, lastName, email, phone."
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Extrae la información de esta imagen." },
            { type: "image_url", image_url: { url: image } }
          ],
        },
      ],
      response_format: { type: "json_object" }
    });

    res.status(200).json(JSON.parse(response.choices[0].message.content));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
