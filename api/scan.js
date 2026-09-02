import { GoogleGenerativeAI } from "@google/generative-ai";

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

        // Usamos la librería oficial de Google
        const genAI = new GoogleGenerativeAI(apiKey);
        // Pedimos el modelo estándar que la librería reconoce nativamente
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = "Eres un asistente de almacén industrial. Analiza esta imagen y extrae ÚNICAMENTE el número de parte (SKU) del producto REGO-FIX. Ejemplos de formato: '7610.98100', '1725.12700'. No escribas texto adicional, ni explicaciones, solo el número exacto. Si no detectas nada, responde 'NO_DETECTADO'.";
        
        const imagePart = {
            inlineData: {
                data: base64Data,
                mimeType: "image/jpeg"
            }
        };

        const result = await model.generateContent([prompt, imagePart]);
        const responseText = await result.response;
        const sku = responseText.text().trim();
        
        return res.status(200).json({ sku });
    } catch (error) {
        console.error("Error detallado:", error);
        return res.status(500).json({ error: error.message || 'Error interno al procesar con Gemini.' });
    }
}

export const config = {
    api: { bodyParser: { sizeLimit: '4mb' } }
};
