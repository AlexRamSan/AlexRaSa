import OpenAI from "openai";
import jsforce from "jsforce";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
    // CORS Dinámico para alexrasa.store
    const origin = req.headers.origin;
    const allowedOrigins = ['https://alexrasa.store', 'https://www.alexrasa.store'];
    if (allowedOrigins.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { image, confirmData } = req.body;

        // --- PASO 1: ESCANEO E INVESTIGACIÓN ---
        if (!confirmData && image) {
            const aiResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: `Eres un experto en inteligencia comercial. Extrae los datos de la tarjeta. 
                        Si la empresa es conocida, investiga su sitio web oficial e industria principal.
                        Devuelve estrictamente un JSON: {firstName, lastName, email, phone, company, website, industry}`
                    },
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Analiza esta tarjeta de presentación." },
                            { type: "image_url", image_url: { url: image, detail: "low" } }
                        ]
                    }
                ],
                response_format: { type: "json_object" }
            });
            return res.status(200).json({ success: true, cardData: JSON.parse(aiResponse.choices[0].message.content) });
        }

        // --- PASO 2: CONEXIÓN Y GUARDADO EN SALESFORCE ---
        if (confirmData) {
            // Autenticación usando tu método probado
            const authRes = await fetch('https://rego-fix.my.salesforce.com/services/oauth2/token', {
                method: 'POST',
                body: new URLSearchParams({
                    grant_type: 'client_credentials',
                    client_id: process.env.SF_CLIENT_ID.trim(),
                    client_secret: process.env.SF_CLIENT_SECRET.trim()
                })
            });
            const authData = await authRes.json();
            const conn = new jsforce.Connection({ instanceUrl: authData.instance_url, accessToken: authData.access_token });

            // Búsqueda de cuenta
            const safeCompanyName = confirmData.company.replace(/'/g, "\\'");
            const accountResult = await conn.query(`SELECT Id FROM Account WHERE Name = '${safeCompanyName}' LIMIT 1`);

            let accountId;
            if (accountResult.totalSize > 0) {
                accountId = accountResult.records[0].Id;
            } else {
                // Crear cuenta con datos investigados por IA
                const newAcc = await conn.sobject("Account").create({ 
                    Name: confirmData.company,
                    Website: confirmData.website || '',
                    Industry: confirmData.industry || '',
                    Description: "Creado automáticamente vía REGO-FIX AI Scanner"
                });
                accountId = newAcc.id;
            }

            // Crear contacto
            const contact = await conn.sobject("Contact").create({
                FirstName: confirmData.firstName,
                LastName: confirmData.lastName || 'Apellido',
                Email: confirmData.email,
                Phone: confirmData.phone,
                AccountId: accountId
            });

            return res.status(200).json({ success: true, contactId: contact.id });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
