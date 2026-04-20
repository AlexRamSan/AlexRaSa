import OpenAI from "openai";
import jsforce from "jsforce";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
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

        // PASO 1: ANALIZAR CON IA (Si solo llega la imagen)
        if (!confirmData && image) {
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: "Extrae datos de tarjetas. JSON: {firstName, lastName, email, phone, company}."
                    },
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Extrae la información." },
                            { type: "image_url", image_url: { url: image, detail: "low" } }
                        ],
                    },
                ],
                response_format: { type: "json_object" }
            });
            return res.status(200).json({ success: true, cardData: JSON.parse(response.choices[0].message.content) });
        }

        // PASO 2: GUARDAR EN SALESFORCE (Usando tu método de Client Credentials)
        if (confirmData) {
            // 1. Obtener Token igual que en tu app de Oportunidades
            const authRes = await fetch('https://rego-fix.my.salesforce.com/services/oauth2/token', {
                method: 'POST',
                body: new URLSearchParams({
                    grant_type: 'client_credentials',
                    client_id: process.env.SF_CLIENT_ID.trim(),
                    client_secret: process.env.SF_CLIENT_SECRET.trim()
                })
            });
            
            const authData = await authRes.json();
            
            if (!authData.access_token) {
                throw new Error("Error de acceso a Salesforce: " + (authData.error_description || "Token no generado"));
            }

            const conn = new jsforce.Connection({ 
                instanceUrl: authData.instance_url, 
                accessToken: authData.access_token 
            });

            // 2. Lógica de Cuenta (Búsqueda o Creación)
            const companyName = confirmData.company ? confirmData.company.trim() : "Empresa Desconocida";
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

            // 3. Crear Contacto vinculado
            const contact = await conn.sobject("Contact").create({
                FirstName: confirmData.firstName || '',
                LastName: confirmData.lastName || 'Apellido', // Requerido por SF
                Email: confirmData.email || '',
                Phone: confirmData.phone || '',
                AccountId: accountId
            });

            return res.status(200).json({ success: true, contactId: contact.id });
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
}
