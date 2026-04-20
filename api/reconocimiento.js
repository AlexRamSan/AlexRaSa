import OpenAI from "openai";
import jsforce from "jsforce";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
    // Manejo de CORS dinámico para alexrasa.store con y sin WWW
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
        
        // --- PASO 1: ANALIZAR IMAGEN (Si es la primera llamada) ---
        if (!cardData && image) {
            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: "Extrae datos de tarjetas de presentación. Devuelve un JSON con: firstName, lastName, email, phone, company. Si falta un dato, usa cadena vacía."
                    },
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Extrae la información de esta imagen." },
                            { type: "image_url", image_url: { url: image, detail: "low" } }
                        ],
                    },
                ],
                response_format: { type: "json_object" }
            });
            return res.status(200).json({ success: true, cardData: JSON.parse(response.choices[0].message.content) });
        }

        // --- PASO 2: GUARDAR EN SALESFORCE (Si ya confirmaste los datos) ---
        if (confirmData) {
            const conn = new jsforce.Connection({
                oauth2: {
                    loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
                    clientId: process.env.SF_CLIENT_ID,
                    clientSecret: process.env.SF_CLIENT_SECRET,
                    redirectUri: 'https://alex-ra-sa.vercel.app/_callback' // Debe coincidir con tu Connected App
                }
            });

            // Login usando Password + Security Token (el que tienes en Vercel)
            await conn.login(
                process.env.SF_USERNAME, 
                process.env.SF_PASSWORD + process.env.SF_TOKEN
            );

            // Buscar o Crear Cuenta
            const companyName = cardData.company || "Empresa por Clasificar";
            const accountResult = await conn.query(
                `SELECT Id FROM Account WHERE Name = '${companyName.replace(/'/g, "\\'")}' LIMIT 1`
            );

            let accountId;
            if (accountResult.totalSize > 0) {
                accountId = accountResult.records[0].Id;
            } else {
                const newAcc = await conn.sobject("Account").create({ Name: companyName });
                accountId = newAcc.id;
            }

            // Crear Contacto
            const contact = await conn.sobject("Contact").create({
                FirstName: cardData.firstName,
                LastName: cardData.lastName || 'Apellido',
                Email: cardData.email,
                Phone: cardData.phone,
                AccountId: accountId
            });

            return res.status(200).json({ success: true, contactId: contact.id });
        }

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: error.message });
    }
}
