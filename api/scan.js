export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido.' });
    }

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: "Falta la variable GEMINI_API_KEY en Vercel." });
        }

        const { imageBase64 } = req.body;
        if (!imageBase64) {
             return res.status(400).json({ error: "No se recibió ninguna imagen." });
        }

        const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        
        const payload = {
            contents: [
                {
                    parts: [
                        { text: "Eres un asistente de almacén industrial. Analiza esta imagen y extrae ÚNICAMENTE el número de parte (SKU) del producto REGO-FIX. Ejemplos de formato: '7610.98100', '1725.12700'. No escribas texto adicional, ni explicaciones, solo el número exacto. Si no detectas nada, responde 'NO_DETECTADO'." },
                        {
                            inline_data: {
                                mime_type: "image/jpeg",
                                data: base64Data
                            }
                        }
                    ]
                }
            ]
        };

        const apiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        const data = await apiResponse.json();

        if (!apiResponse.ok) {
            throw new Error(data.error?.message || 'Error en la respuesta de Google Gemini.');
        }

        const sku = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || 'NO_DETECTADO';
        
        return res.status(200).json({ sku });
    } catch (error) {
        console.error("Error detallado:", error);
        return res.status(500).json({ error: error.message || 'Error interno al procesar la imagen.' });
    }
}

export const config = {
    api: { bodyParser: { sizeLimit: '4mb' } }
};
