import OpenAI from "openai";
import jsforce from "jsforce";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
    // CORS Dinámico para evitar el error de "www"
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
        
        // --- PASO 1: OCR CON IA ---
        if (!cardData && image) {
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: "Extrae datos de tarjetas. JSON: {firstName, lastName, email, phone, company}. Usa cadenas vacías si no hay datos."
                    },
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Extrae la info de esta imagen." },
                            { type: "image_url", image_url: { url: image, detail: "low" } }
                        ],
                    },
                ],
                response_format: { type: "json_object" }
            });
            const result = JSON.parse(response.choices[0].message.content);
            return res.status(200).json({ success: true, cardData: result });
        }

        // --- PASO 2: CONEXIÓN OAUTH2 A SALESFORCE ---
        if (confirmData) {
            const conn = new jsforce.Connection({
                oauth2: {
                    loginUrl: 'https://login.salesforce.com', // Cambia a test.salesforce.com si es Sandbox
                    clientId: process.env.SF_CLIENT_ID,
                    clientSecret: process.env.SF_CLIENT_SECRET,
                    redirectUri: 'https://alexrasa.store' // Debe estar en tu Connected App
                }
            });

            // Login usando Password + Token (Método Web Server flow compatible)
            await conn.login(
                process.env.SF_USERNAME, 
                process.env.SF_PASSWORD + process.env.SF_TOKEN
            );

            // Búsqueda de Cuenta con escape de caracteres (Evita errores de lectura)
            const companyName = cardData.company ? cardData.company.trim() : "Empresa Desconocida";
            const safeCompanyName = companyName.replace(/'/g, "\\'");
            
            const accountResult = await conn.query(
                `SELECT Id FROM Account WHERE Name = '${safeCompanyName}' LIMIT 1`
            );

            let accountId;
            if (accountResult.totalSize > 0) {
                accountId = accountResult.records[0].Id;
            } else {
                const newAcc = await conn.sobject("Account").create({ Name: companyName });
                accountId = newAcc.id;
            }

            // Creación de Contacto
            const contact = await conn.sobject("Contact").create({
                FirstName: cardData.firstName || '',
                LastName: cardData.lastName || 'Apellido', // Obligatorio en Salesforce
                Email: cardData.email || '',
                Phone: cardData.phone || '',
                AccountId: accountId
            });

            return res.status(200).json({ success: true, contactId: contact.id });
        }

    } catch (error) {
        console.error("Error en proceso:", error.message);
        res.status(500).json({ error: error.message });
    }
}
