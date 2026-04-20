import OpenAI from "openai";
import jsforce from "jsforce";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
    const origin = req.headers.origin;
    const allowedOrigins = ['https://alexrasa.store', 'https://www.alexrasa.store'];
    if (allowedOrigins.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { image, confirmData } = req.body;

        // --- PASO 1: ESCANEO E INVESTIGACIÓN INICIAL ---
        if (!confirmData && image) {
            const aiResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: `Eres un asistente de ventas experto. Extrae datos de la tarjeta. 
                        Además, si identificas la empresa, investiga o deduce: sitio web, industria y una breve descripción.
                        Devuelve JSON: {firstName, lastName, email, phone, company, website, industry, description}`
                    },
                    {
                        role: "user",
                        content: [{ type: "text", text: "Extrae e investiga la info de esta tarjeta." }, { type: "image_url", image_url: { url: image, detail: "low" } }]
                    }
                ],
                response_format: { type: "json_object" }
            });
            
            const cardData = JSON.parse(aiResponse.choices[0].message.content);
            return res.status(200).json({ success: true, cardData });
        }

        // --- PASO 2: GUARDADO EN SALESFORCE ---
        if (confirmData) {
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

            const safeCompanyName = confirmData.company.replace(/'/g, "\\'");
            const accountResult = await conn.query(`SELECT Id FROM Account WHERE Name = '${safeCompanyName}' LIMIT 1`);

            let accountId;
            let statusNote = "";

            if (accountResult.totalSize > 0) {
                accountId = accountResult.records[0].Id;
                statusNote = "Cuenta existente vinculada.";
            } else {
                // CREAR CUENTA CON INFO INVESTIGADA
                const newAcc = await conn.sobject("Account").create({ 
                    Name: confirmData.company,
                    Website: confirmData.website || '',
                    Industry: confirmData.industry || '',
                    Description: confirmData.description || 'Creado vía Scanner AI'
                });
                accountId = newAcc.id;
                statusNote = "Nueva cuenta creada con info de IA.";
            }

            const contact = await conn.sobject("Contact").create({
                FirstName: confirmData.firstName,
                LastName: confirmData.lastName || 'Apellido',
                Email: confirmData.email,
                Phone: confirmData.phone,
                AccountId: accountId
            });

            return res.status(200).json({ success: true, statusNote, contactId: contact.id });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
