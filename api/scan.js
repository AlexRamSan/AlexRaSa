const { GoogleGenerativeAI } = require('@google/generative-ai');

async function handler(req, res) {
    // 1. Permitir conexiones desde cualquier origen (CORS)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Responder rápido a la petición de chequeo (preflight)
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Método no permitido. Debe ser POST.' });
    }

    try {
        // 2. Verificamos que la llave de Gemini exista en Vercel
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.status(500).json({ error: "Falta la llave GEMINI_API_KEY en las variables de Vercel." });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        
        // 3. Verificamos que la imagen haya llegado
        const { imageBase64 } = req.body;
        if (!imageBase64) {
             return res.status(400).json({ error: "El servidor no recibió ninguna imagen." });
        }

        // 4. Limpiamos la cadena base64 (quitamos el encabezado data:image/jpeg;base64,)
        const base64Data = imageBase64.includes(',') ? imageBase64.split(',')[1] : imageBase64;

        // 5. Configurar el modelo y la petición a Gemini
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = "Eres un asistente de almacén industrial. Analiza esta imagen y extrae ÚNICAMENTE el número de parte (SKU) del producto REGO-FIX. Ejemplos de formato: '7610.98100', '1725.12700'. No escribas texto adicional, ni explicaciones, solo el número exacto. Si no detectas nada, responde 'NO_DETECTADO'.";
        
        const imagePart = {
            inlineData: {
                data: base64Data,
                mimeType: "image/jpeg"
            }
        };

        // 6. Enviar a Gemini y esperar respuesta
        const result = await model.generateContent([prompt, imagePart]);
        const sku = result.response.text().trim();
        
        return res.status(200).json({ sku });
    } catch (error) {
        console.error("Error interno detallado:", error);
        // ENVIAMOS EL MENSAJE EXACTO PARA DEPURAR
        return res.status(500).json({ error: error.message || 'Fallo desconocido al procesar con Gemini.' });
    }
}

// Configuración de Vercel para permitir fotos de hasta 4MB
handler.config = {
    api: { bodyParser: { sizeLimit: '4mb' } }
};

module.exports = handler;
