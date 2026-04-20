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
        if (err) return res.status(500).json({ error: "Error al procesar audio" });

        try {
            const myOwnerId = process.env.SF_OWNER_ID; 
            if (!myOwnerId) throw new Error("Falta la variable SF_OWNER_ID en Vercel.");

            const audioPath = files.audio[0].path;

            // 1. Transcribir Audio
            const transcription = await openai.audio.transcriptions.create({
                file: fs.createReadStream(audioPath),
                model: "whisper-1",
                language: "es"
            });

            const userText = transcription.text;

            // 2. Analizar Intención y extraer parámetros
            const aiResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: `Eres el Asistente Ejecutivo de REGO-FIX para Miguel. Hoy es ${new Date().toLocaleDateString()}.
                        Tu objetivo es mapear el lenguaje natural del usuario a acciones de Salesforce.
                        
                        ACCIONES DISPONIBLES:
                        - CONSULTAR_OPORTUNIDADES: Listar oportunidades abiertas.
                        - CONSULTAR_PENDIENTES: Listar tareas/seguimientos no cerrados.
                        - AGREGAR_COMENTARIO_CUENTA: Crear una tarea de tipo nota en una cuenta específica.
                        - REGISTRAR_ACTIVIDAD: Crear tarea completada (visita, llamada).
                        - AGENDAR_CITA: Crear un Evento en el calendario.
                        
                        Devuelve un JSON con esta estructura:
                        { 
                          "accion": "NOMBRE_ACCION", 
                          "cliente_busqueda": "Nombre de la empresa si aplica", 
                          "datos": { "asunto", "descripcion", "fecha", "hora" } 
                        }`
                    },
                    { role: "user", content: userText }
                ],
                response_format: { type: "json_object" }
            });

            const plan = JSON.parse(aiResponse.choices[0].message.content);

            // 3. Conexión a Salesforce
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

            let responseMessage = "";

            // --- LÓGICA DE EJECUCIÓN POR ACCIÓN ---

            switch (plan.accion) {
                case 'CONSULTAR_OPORTUNIDADES':
                    const opps = await conn.query(`SELECT Name, Amount, StageName FROM Opportunity WHERE OwnerId = '${myOwnerId}' AND IsClosed = false LIMIT 5`);
                    responseMessage = opps.records.length > 0 
                        ? "Tus oportunidades abiertas:\n" + opps.records.map(o => `• ${o.Name}: $${o.Amount || 0} (${o.StageName})`).join("\n")
                        : "No tienes oportunidades abiertas actualmente.";
                    break;

                case 'CONSULTAR_PENDIENTES':
                    const tasks = await conn.query(`SELECT Subject, ActivityDate FROM Task WHERE OwnerId = '${myOwnerId}' AND IsClosed = false ORDER BY ActivityDate ASC LIMIT 5`);
                    responseMessage = tasks.records.length > 0 
                        ? "Tus pendientes:\n" + tasks.records.map(t => `• ${t.Subject} (Vence: ${t.ActivityDate || 'Sin fecha'})`).join("\n")
                        : "No tienes tareas pendientes.";
                    break;

                case 'AGREGAR_COMENTARIO_CUENTA':
                case 'REGISTRAR_ACTIVIDAD':
                    // Primero buscamos el ID de la cuenta por nombre
                    const accSearch = await conn.query(`SELECT Id, Name FROM Account WHERE Name LIKE '%${plan.cliente_busqueda}%' LIMIT 1`);
                    const accId = accSearch.records.length > 0 ? accSearch.records[0].Id : null;
                    const accName = accSearch.records.length > 0 ? accSearch.records[0].Name : plan.cliente_busqueda;

                    await conn.sobject("Task").create({
                        Subject: plan.accion === 'AGREGAR_COMENTARIO_CUENTA' ? `Comentario: ${plan.datos.asunto || 'Nota'}` : `Actividad: ${plan.datos.asunto}`,
                        Description: plan.datos.descripcion || userText,
                        Status: 'Completed',
                        WhatId: accId,
                        OwnerId: myOwnerId
                    });
                    responseMessage = `✅ He guardado el registro en la cuenta de ${accName}.`;
                    break;

                case 'AGENDAR_CITA':
                    await conn.sobject("Event").create({
                        Subject: `Cita: ${plan.cliente_busqueda}`,
                        StartDateTime: `${plan.datos.fecha}T${plan.datos.hora || '09:00'}:00`,
                        DurationInMinutes: 60,
                        OwnerId: myOwnerId
                    });
                    responseMessage = `📅 Cita agendada para el ${plan.datos.fecha} a las ${plan.datos.hora}.`;
                    break;

                default:
                    responseMessage = "Entendido, pero no estoy seguro de qué acción realizar en Salesforce. ¿Podrías ser más específico?";
            }

            res.status(200).json({ success: true, message: responseMessage, transcript: userText });

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
}
