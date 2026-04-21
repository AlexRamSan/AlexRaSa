import OpenAI from "openai";
import jsforce from "jsforce";
import multiparty from "multiparty";
import fs from "fs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
    const origin = req.headers.origin;
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const form = new multiparty.Form();
    
    form.parse(req, async (err, fields, files) => {
        if (err) return res.status(500).json({ success: false, error: "Error de formulario" });

        try {
            // ID FIJO PARA EVITAR EL ERROR 'UNDEFINED'
            const myOwnerId = "005WQ00000C6Kl7YAF"; 

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
                return new jsforce.Connection({ instanceUrl: authData.instance_url, accessToken: authData.access_token });
            };

            // --- ACCIÓN: OBTENER TODAS LAS CUENTAS (Para el menú manual) ---
            if (fields.action && fields.action[0] === 'getAllAccounts') {
                const conn = await connectSF();
                const allAccs = await conn.query(`SELECT Id, Name, BillingCity FROM Account WHERE OwnerId = '${myOwnerId}' ORDER BY Name ASC LIMIT 200`);
                return res.status(200).json({ success: true, accounts: allAccs.records });
            }

            // --- ACCIÓN: CONFIRMAR Y GUARDAR ---
            if (fields.action && fields.action[0] === 'confirmar') {
                const payload = JSON.parse(fields.payload[0]);
                const conn = await connectSF();

                if (payload.taskType === 'EVENTO') {
                    await conn.sobject("Event").create({
                        Subject: payload.subject,
                        Description: payload.description,
                        StartDateTime: `${payload.fecha}T${payload.hora || '09:00'}:00`,
                        DurationInMinutes: 60,
                        WhatId: payload.accountId,
                        OwnerId: myOwnerId
                    });
                } else {
                    await conn.sobject("Task").create({
                        Subject: payload.subject,
                        Description: payload.description,
                        Status: 'Completed',
                        WhatId: payload.accountId,
                        OwnerId: myOwnerId
                    });
                }
                return res.status(200).json({ success: true, message: "Sincronizado" });
            }

            // --- ACCIÓN: PROCESAR VOZ (WHISPER + GPT) ---
            if (!files.audio) throw new Error("Audio no recibido");

            const transcription = await openai.audio.transcriptions.create({
                file: fs.createReadStream(files.audio[0].path),
                model: "whisper-1",
                language: "es"
            });

            const aiResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: `Eres el Asistente REGO-FIX. Hoy es ${new Date().toLocaleDateString()}.
                        Extrae intención y empresa. Para 'empresa_busqueda', usa solo la palabra clave.
                        JSON: { "intent", "empresa_busqueda", "asunto", "detalles", "fecha", "hora" }`
                    },
                    { role: "user", content: transcription.text }
                ],
                response_format: { type: "json_object" }
            });

            const plan = JSON.parse(aiResponse.choices[0].message.content);
            const conn = await connectSF();

            // Búsqueda automática
            const searchResults = await conn.query(
                `SELECT Id, Name, BillingCity FROM Account WHERE Name LIKE '%${plan.empresa_busqueda}%' LIMIT 5`
            );

            res.status(200).json({ 
                success: true, 
                transcript: transcription.text,
                plan: plan,
                accounts: searchResults.records,
                needManualSelection: searchResults.records.length === 0
            });

        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });
}
