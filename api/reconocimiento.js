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
        const { image, confirmData, action } = req.body;

        const connectSF = async () => {
            const authRes = await fetch('https://rego-fix.my.salesforce.com/services/oauth2/token', {
                method: 'POST',
                body: new URLSearchParams({
                    grant_type: 'client_credentials',
                    client_id: process.env.SF_CLIENT_ID.trim(),
                    client_secret: process.env.SF_CLIENT_SECRET.trim()
                })
            });
            const authData = await authRes.json();
            if (!authData.access_token) throw new Error("Fallo de autenticación en Salesforce.");
            return new jsforce.Connection({ instanceUrl: authData.instance_url, accessToken: authData.access_token });
        };

        if (action === 'getAccounts') {
            const conn = await connectSF();
            const accounts = await conn.query(`SELECT Id, Name FROM Account ORDER BY Name ASC LIMIT 1500`);
            return res.status(200).json({ success: true, accounts: accounts.records });
        }

        if (!confirmData && image) {
            const aiResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: `Eres un experto en inteligencia comercial. Extrae e investiga los datos de la tarjeta.
                        MUY IMPORTANTE: Investiga, deduce o busca en tu base de conocimientos el RFC corporativo (Registro Federal de Contribuyentes para México) o CNPJ de la empresa detectada.
                        Devuelve estrictamente un JSON con las siguientes propiedades. Si no logras conseguir algún dato, usa "":
                        { "firstName", "lastName", "title", "email", "phone", "mobilePhone", "company", "website", "industry", "type", "rfc", "machines", "productInterest", "companyPhone", "street", "city", "state", "country", "description" }`
                    },
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Analiza e investiga los datos de esta tarjeta. Asegúrate de investigar y proponer el RFC de la empresa." },
                            { type: "image_url", image_url: { url: image, detail: "high" } }
                        ]
                    }
                ],
                response_format: { type: "json_object" }
            });
            return res.status(200).json({ success: true, cardData: JSON.parse(aiResponse.choices[0].message.content) });
        }

        if (confirmData) {
            const conn = await connectSF();
            let accountId = confirmData.accountId;

            if (!accountId) {
                const accountPayload = { 
                    Name: confirmData.company || 'Empresa Sin Nombre',
                    Type: confirmData.type || '',
                    RFC__c: confirmData.rfc || '', 
                    Numero_de_maquinas__c: confirmData.machines || null,
                    Producto_de_interes__c: confirmData.productInterest || '',
                    Website: confirmData.website || '',
                    Industry: confirmData.industry || '',
                    Phone: confirmData.companyPhone || '',
                    BillingStreet: confirmData.street || '',
                    BillingCity: confirmData.city || '',
                    BillingState: confirmData.state || '',
                    BillingCountry: confirmData.country || '',
                    Description: confirmData.description || 'Generado automáticamente vía Scanner'
                };

                const newAcc = await conn.sobject("Account").create(accountPayload);
                accountId = newAcc.id;
            }

            let contactId;
            let statusMessage = "";
            const safeEmail = confirmData.email ? confirmData.email.trim() : null;
            const safeFirstName = confirmData.firstName ? confirmData.firstName.replace(/'/g, "\\'") : '';
            const safeLastName = confirmData.lastName ? confirmData.lastName.replace(/'/g, "\\'") : 'Desconocido';

            let contactResult;
            if (safeEmail) {
                contactResult = await conn.query(`SELECT Id FROM Contact WHERE Email = '${safeEmail}' LIMIT 1`);
            } else {
                contactResult = await conn.query(`SELECT Id FROM Contact WHERE FirstName = '${safeFirstName}' AND LastName = '${safeLastName}' AND AccountId = '${accountId}' LIMIT 1`);
            }

            if (contactResult && contactResult.totalSize > 0) {
                contactId = contactResult.records[0].Id;
                await conn.sobject("Contact").update({
                    Id: contactId,
                    Title: confirmData.title || '',
                    Phone: confirmData.phone || '',
                    MobilePhone: confirmData.mobilePhone || '',
                    AccountId: accountId 
                });
                statusMessage = "Contacto actualizado (ya existía).";
            } else {
                const contact = await conn.sobject("Contact").create({
                    FirstName: confirmData.firstName || '',
                    LastName: confirmData.lastName || 'Desconocido',
                    Title: confirmData.title || '',
                    Email: confirmData.email || '',
                    Phone: confirmData.phone || '',
                    MobilePhone: confirmData.mobilePhone || '',
                    AccountId: accountId
                });
                contactId = contact.id;
                statusMessage = "Nuevo contacto creado exitosamente.";
            }

            return res.status(200).json({ success: true, contactId: contactId, message: statusMessage });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
