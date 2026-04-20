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
        if (err) {
            console.error("Error parseando el form:", err);
            return res.status(500).json({ success: false, error: "Error al leer los datos enviados" });
        }

        try {
            const myOwnerId = process.env.SF_OWNER_ID;
            console.log("Iniciando proceso para Owner:", myOwnerId);

            // --- ACCIÓN: CONFIRMAR Y GUARDAR ---
            if (fields.action && fields.action[0] === 'confirmar') {
                console.log("Acción: Confirmar registro");
                const payload = JSON.parse(fields.payload[0]);
                
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
                return res.status(200).json({ success: true, message: "Guardado con éxito" });
            }

            // --- ACCIÓN: PROCESAR AUDIO ---
            if (!files.audio) throw new Error("No se recibió el archivo de audio");
            
            console.log("Enviando a Whisper...");
            const transcription = await openai.audio.transcriptions.create({
                file: fs.createReadStream(files.audio[0].path),
                model: "whisper-1",
                language: "es"
            });
            console.log("Transcripción lista:", transcription.text);

            console.log("Enviando a GPT-4o...");
            const aiResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: "Extrae intención (comentario, visita, cita) y empresa_busqueda. Devuelve JSON."
                    },
                    { role: "user", content: transcription.text }
                ],
                response_format: { type: "json_object" }
            });

            const plan = JSON.parse(aiResponse.choices[0].message.content);
            console.log("Plan de IA:", plan);

            console.log("Buscando en Salesforce...");
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

            const searchResults = await conn.query(
                `SELECT Id, Name, BillingCity FROM Account WHERE Name LIKE '%${plan.empresa_busqueda}%' LIMIT 5`
            );
            console.log("Resultados encontrados:", searchResults.totalSize);

            res.status(200).json({ 
                success: true, 
                transcript: transcription.text,
                plan: plan,
                accounts: searchResults.records,
                needSelection: searchResults.records.length > 0
            });

        } catch (error) {
            console.error("ERROR EN EL BACKEND:", error.message);
            res.status(500).json({ success: false, error: error.message });
        }
    });
}
