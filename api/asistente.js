import OpenAI from "openai";
import jsforce from "jsforce";
import multiparty from "multiparty";
import fs from "fs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
    const origin = req.headers.origin;
    const allowedOrigins = ['https://alexrasa.store', 'https://www.alexrasa.store'];
    if (allowedOrigins.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const form = new multiparty.Form();
    
    form.parse(req, async (err, fields, files) => {
        if (err && !fields.action) return res.status(500).json({ error: "Error al procesar solicitud" });

        try {
            const myOwnerId = process.env.SF_OWNER_ID;

            // --- PASO 2: CONFIRMACIÓN FINAL (Guardar en Salesforce) ---
            if (fields.action && fields.action[0] === 'confirmar') {
                const { accountId, subject, description, taskType, fecha, hora } = JSON.parse(fields.payload[0]);
                
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

                if (taskType === 'EVENTO') {
                    await conn.sobject("Event").create({
                        Subject: subject,
                        Description: description,
                        StartDateTime: `${fecha}T${hora || '09:00'}:00`,
                        DurationInMinutes: 60,
                        WhatId: accountId,
                        OwnerId: myOwnerId
                    });
                } else {
                    await conn.sobject("Task").create({
                        Subject: subject,
                        Description: description,
                        Status: 'Completed',
                        WhatId: accountId,
                        OwnerId: myOwnerId
                    });
                }
                return res.status(200).json({ success: true, message: "✅ ¡Registro completado con éxito!" });
            }

            // --- PASO 1: PROCESAMIENTO DE VOZ Y BÚSQUEDA ---
            const audioPath = files.audio[0].path;
            const transcription = await openai.audio.transcriptions.create({
                file: fs.createReadStream(audioPath),
                model: "whisper-1",
                language: "es"
            });

            const userText = transcription.text;

            const aiResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: `Eres el Asistente de REGO-FIX. Analiza el dictado. 
                        Detecta si es un comentario, visita, cita o consulta.
                        Devuelve JSON: { "intent", "empresa_busqueda", "asunto", "detalles", "fecha", "hora" }`
                    },
                    { role: "user", content: userText }
                ],
                response_format: { type: "json_object" }
            });

            const plan = JSON.parse(aiResponse.choices[0].message.content);

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

            // Buscar cuentas candidatas
            const searchResults = await conn.query(
                `SELECT Id, Name, BillingCity FROM Account WHERE Name LIKE '%${plan.empresa_busqueda}%' LIMIT 5`
            );

            res.status(200).json({ 
                success: true, 
                transcript: userText,
                plan: plan,
                accounts: searchResults.records, // Mandamos la lista de cuentas encontradas
                needSelection: searchResults.records.length > 0
            });

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
}
