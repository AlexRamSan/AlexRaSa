import OpenAI from "openai";
import jsforce from "jsforce";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', 'https://www.alexrasa.store');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        const { image, confirmData } = req.body;

        // --- PASO 1: EXTRAER DATOS CON IA (Solo si no vienen confirmados) ---
        let cardData = confirmData;
        
        if (!cardData) {
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: "Extrae datos de tarjetas. Devuelve JSON: {firstName, lastName, email, phone, company}. Si falta algo, usa null."
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
            cardData = JSON.parse(response.choices[0].message.content);
        }

        // --- PASO 2: CONECTAR A SALESFORCE ---
        const conn = new jsforce.Connection({ loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com' });
        await conn.login(process.env.SF_USERNAME, process.env.SF_PASSWORD + process.env.SF_TOKEN);

        // --- PASO 3: LÓGICA DE CUENTA Y CONTACTO ---
        // 1. Buscar si la cuenta ya existe
        const accountResult = await conn.query(
            `SELECT Id FROM Account WHERE Name = '${cardData.company}' LIMIT 1`
        );

        let accountId;
        let accountStatus = "existente";

        if (accountResult.totalSize > 0) {
            accountId = accountResult.records[0].Id;
        } else {
            // Si no existe, la creamos
            const newAcc = await conn.sobject("Account").create({ 
                Name: cardData.company || "Empresa Nueva (Revisar)" 
            });
            accountId = newAcc.id;
            accountStatus = "creada_nueva";
        }

        // 2. Crear el contacto
        const contact = await conn.sobject("Contact").create({
            FirstName: cardData.firstName,
            LastName: cardData.lastName || 'Sin Apellido',
            Email: cardData.email,
            Phone: cardData.phone,
            AccountId: accountId
        });

        res.status(200).json({ 
            success: true, 
            cardData, 
            accountStatus,
            contactId: contact.id 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
}
