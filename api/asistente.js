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
            // VALIDACIÓN: Si no hay ID, detenemos el proceso con un mensaje claro
            const myOwnerId = process.env.SF_OWNER_ID; 
            if (!myOwnerId || myOwnerId === "undefined") {
                throw new Error("Configuración incompleta: Falta la variable SF_OWNER_ID en Vercel.");
            }

            const audioPath = files.audio[0].path;

            // 1. Transcribir con Whisper
            const transcription = await openai.audio.transcriptions.create({
                file: fs.createReadStream(audioPath),
                model: "whisper-1",
                language: "es"
            });

            const text = transcription.text;

            // 2. Interpretar con GPT-4o
            const aiResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: `Eres el asistente de voz de REGO-FIX para Miguel. Hoy es ${new Date().toLocaleDateString()}.
                        Acciones:
                        - REGISTRAR_VISITA: Crea Tarea completada. Necesitas: cliente, resumen.
                        - AGENDAR_CITA: Crea Evento. Necesitas: cliente, fecha (YYYY-MM-DD), hora (HH:mm).
                        - CREAR_SEGUIMIENTO: Crea Tarea abierta. Necesitas: tarea, fecha_vencimiento.
                        - CONSULTAR_PENDIENTES: Leer tareas. No requiere datos.
                        Devuelve JSON: { "accion", "cliente", "fecha", "hora", "resumen", "tarea" }`
                    },
                    { role: "user", content: text }
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

            let finalMsg = `Procesado: "${text}"`;

            // 4. Ejecución (Consulta corregida)
            if (plan.accion === 'REGISTRAR_VISITA') {
                await conn.sobject("Task").create({
                    Subject: `Resumen Visita: ${plan.cliente}`,
                    Description: plan.resumen,
                    Status: 'Completed',
                    OwnerId: myOwnerId
                });
                finalMsg = `✅ Visita en ${plan.cliente} registrada.`;
            } 
            else if (plan.accion === 'AGENDAR_CITA') {
                await conn.sobject("Event").create({
                    Subject: `Cita: ${plan.cliente}`,
                    StartDateTime: `${plan.fecha}T${plan.hora || '09:00'}:00Z`,
                    DurationInMinutes: 60,
                    OwnerId: myOwnerId
                });
                finalMsg = `📅 Cita con ${plan.cliente} agendada para el ${plan.fecha}.`;
            }
            else if (plan.accion === 'CONSULTAR_PENDIENTES') {
                // CONSULTA CORREGIDA: Agregamos IsClosed = false
                const tasks = await conn.query(`SELECT Subject FROM Task WHERE OwnerId = '${myOwnerId}' AND IsClosed = false LIMIT 5`);
                const lista = tasks.records.map(t => t.Subject).join("\n• ");
                finalMsg = lista ? `📋 Pendientes hoy:\n• ${lista}` : "No hay pendientes abiertos.";
            }

            res.status(200).json({ success: true, message: finalMsg, transcript: text });

        } catch (error) {
            console.error("Error en Asistente:", error.message);
            res.status(500).json({ error: error.message });
        }
    });
}
