import OpenAI from "openai";
import jsforce from "jsforce";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
    // 1. CORRECCIÓN DE CORS (DINÁMICO)
    const origin = req.headers.origin;
    const allowedOrigins = ['https://alexrasa.store', 'https://www.alexrasa.store'];
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { image, confirmData } = req.body;
        let cardData = confirmData;
        
        // 2. EXTRACCIÓN CON IA
        if (!cardData) {
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: "Extrae datos de tarjetas. JSON estricto: {firstName, lastName, email, phone, company}. Si no hay datos, usa cadena vacía."
                    },
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Extrae la info." },
                            { type: "image_url", image_url: { url: image, detail: "low" } }
                        ],
                    },
                ],
                response_format: { type: "json_object" }
            });

            const content = response.choices[0].message.content;
            cardData = JSON.parse(content);
        }

        // VALIDACIÓN ANTI-ERROR: Si cardData sigue siendo undefined por algún motivo
        if (!cardData) throw new Error("No se pudieron extraer datos de la imagen.");

        // 3. CONEXIÓN A SALESFORCE
        // Solo intentamos Salesforce si ya tenemos el confirmData (segundo paso)
        if (confirmData) {
            const conn = new jsforce.Connection({ loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com' });
            await conn.login(process.env.SF_USERNAME, process.env.SF_PASSWORD + process.env.SF_TOKEN);

            // Buscar cuenta
            const accountResult = await conn.query(
                `SELECT Id FROM Account WHERE Name = '${cardData.company}' LIMIT 1`
            );

            let accountId;
            if (accountResult.totalSize > 0) {
                accountId = accountResult.records[0].Id;
            } else {
                const newAcc = await conn.sobject("Account").create({ Name: cardData.company || "Empresa por Clasificar" });
                accountId = newAcc.id;
            }

            // Crear contacto
            const contact = await conn.sobject("Contact").create({
                FirstName: cardData.firstName,
                LastName: cardData.lastName || 'Apellido',
                Email: cardData.email,
                Phone: cardData.phone,
                AccountId: accountId
            });

            return res.status(200).json({ success: true, contactId: contact.id });
        }

        // Si es el primer paso (solo escaneo), devolvemos los datos para revisión
        res.status(200).json({ success: true, cardData });

    } catch (error) {
        console.error("ERROR DETECTADO:", error.message);
        res.status(500).json({ error: error.message });
    }
}
