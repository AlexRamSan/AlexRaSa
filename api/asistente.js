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
        if (err) return res.status(500).json({ success: false, error: "Error de lectura" });

        try {
            // ID DIRECTO DE MIGUEL (Sin errores de variable)
            const myOwnerId = "005WQ00000C6Kl7YAF"; 

            // --- ACCIÓN 2: CONFIRMAR Y GUARDAR ---
            if (fields.action && fields.action[0] === 'confirmar') {
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
                return res.status(200).json({ success: true, message: "Sincronizado" });
            }

            // --- ACCIÓN 1: PROCESAR VOZ ---
            if (!files.audio) throw new Error("No se recibió audio");

            // Whisper: Traducir voz a texto
            const transcription = await openai.audio.transcriptions.create({
                file: fs.createReadStream(files.audio[0].path),
                model: "whisper-1",
                language: "es"
            });

            // GPT-4o: Entender qué quieres hacer
            const aiResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: `Eres el Asistente Full de REGO-FIX. Hoy es ${new Date().toLocaleDateString()}.
                        Acciones: CONSULTAR_OPORTUNIDADES, CONSULTAR_RESUMEN, AGENDAR_CITA, REGISTRAR_ACTIVIDAD.
                        Para 'empresa_busqueda', extrae solo el nombre principal (ej: de "Nurlein México" extrae "Nurlein").
                        JSON: { "intent", "empresa_busqueda", "asunto", "detalles", "fecha", "hora" }`
                    },
                    { role: "user", content: transcription.text }
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

            // Consultas directas (Oportunidades y Resumen)
            if (plan.intent === 'CONSULTAR_OPORTUNIDADES') {
                const opps = await conn.query(`SELECT Name, Amount FROM Opportunity WHERE OwnerId = '${myOwnerId}' AND IsClosed = false LIMIT 3`);
                const msg = opps.records.length > 0 ? "Oportunidades: " + opps.records.map(o => `${o.Name} ($${o.Amount || 0})`).join(", ") : "No tienes oportunidades abiertas.";
                return res.status(200).json({ success: true, message: msg, transcript: transcription.text });
            }

            if (plan.intent === 'CONSULTAR_RESUMEN') {
                const lastTask = await conn.query(`SELECT Subject FROM Task WHERE OwnerId = '${myOwnerId}' AND Status = 'Completed' ORDER BY CreatedDate DESC LIMIT 1`);
                const msg = lastTask.records.length > 0 ? `Tu última actividad fue: ${lastTask.records[0].Subject}` : "Sin registros recientes.";
                return res.status(200).json({ success: true, message: msg, transcript: transcription.text });
            }

            // Búsqueda de empresa para registros
            const accounts = await conn.query(`SELECT Id, Name, BillingCity FROM Account WHERE Name LIKE '%${plan.empresa_busqueda}%' LIMIT 5`);

            res.status(200).json({ 
                success: true, 
                transcript: transcription.text,
                plan: plan,
                accounts: accounts.records,
                needSelection: accounts.records.length > 0
            });

        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });
}
