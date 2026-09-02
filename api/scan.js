const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Permite a Vercel recibir fotos grandes
export const config = {
    api: { bodyParser: { sizeLimit: '10mb' } }
};

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    try {
        const { imageBase64 } = req.body;
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `Eres un asistente de almacén industrial. Analiza esta imagen y extrae ÚNICAMENTE el número de parte (SKU) del producto REGO-FIX. Ejemplos de formato: '7610.98100', '1725.12700'. No escribas texto adicional, ni explicaciones, solo el número exacto. Si no detectas nada, responde 'NO_DETECTADO'.`;
        
        const imagePart = {
            inlineData: {
                data: imageBase64.split(',')[1],
                mimeType: "image/jpeg"
            }
        };

        const result = await model.generateContent([prompt, imagePart]);
        const sku = result.response.text().trim();
        return res.status(200).json({ sku });
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Error procesando la imagen' });
    }
};
