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
            // Usamos tu ID de Salesforce desde las variables de entorno de Vercel
            // Asegúrate de agregar SF_OWNER_ID en Vercel con tu ID (empieza con 005)
            const myOwnerId = process.env.SF_OWNER_ID; 
            const audioPath = files.audio[0].path;

            // 1. Transcribir el dictado con Whisper
            const transcription = await openai.audio.transcriptions.create({
                file: fs.createReadStream(audioPath),
                model: "whisper-1",
                language: "es"
            });

            const text = transcription.text;

            // 2. Interpretar con GPT-4o para mapear a Salesforce
            const aiResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: `Eres el asistente de voz de REGO-FIX para Miguel. Hoy es ${new Date().toLocaleDateString()}.
                        Tu tarea es clasificar la voz en una de estas acciones:
                        - REGISTRAR_VISITA: (Resumen de visita). Crea Tarea completada. Necesitas: cliente, resumen.
                        - AGENDAR_CITA: (Citas futuras). Crea Evento. Necesitas: cliente, fecha (YYYY-MM-DD), hora (HH:mm).
                        - CREAR_SEGUIMIENTO: (Pendientes nuevos). Crea Tarea abierta. Necesitas: tarea, fecha_vencimiento.
                        - CONSULTAR_PENDIENTES: (Ver qué hay hoy). No requiere datos extra.
                        
                        Devuelve JSON: { "accion", "cliente", "fecha", "hora", "resumen", "tarea" }`
                    },
                    { role: "user", content: text }
                ],
                response_format: { type: "json_object" }
            });

            const plan = JSON.parse(aiResponse.choices[0].message.content);

            // 3. Conexión Maestra a Salesforce
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

            // 4. Ejecución de Acciones
            if (plan.accion === 'REGISTRAR_VISITA') {
                await conn.sobject("Task").create({
                    Subject: `Resumen de Visita: ${plan.cliente}`,
                    Description: plan.resumen,
                    Status: 'Completed',
                    OwnerId: myOwnerId,
                    Priority: 'Normal'
                });
                finalMsg = `✅ Resumen de visita en ${plan.cliente} guardado correctamente.`;
            } 
            else if (plan.accion === 'AGENDAR_CITA') {
                await conn.sobject("Event").create({
                    Subject: `Cita: ${plan.cliente}`,
                    StartDateTime: `${plan.fecha}T${plan.hora || '09:00'}:00Z`,
                    DurationInMinutes: 60,
                    OwnerId: myOwnerId
                });
                finalMsg = `📅 Cita agendada con ${plan.cliente} para el día ${plan.fecha} a las ${plan.hora}.`;
            }
            else if (plan.accion === 'CREAR_SEGUIMIENTO') {
                await conn.sobject("Task").create({
                    Subject: `Seguimiento: ${plan.tarea}`,
                    ActivityDate: plan.fecha || null,
                    Status: 'Not Started',
                    OwnerId: myOwnerId
                });
                finalMsg = `🔔 Seguimiento creado: ${plan.tarea}.`;
            }
            else if (plan.accion === 'CONSULTAR_PENDIENTES') {
                const tasks = await conn.query(`SELECT Subject FROM Task WHERE OwnerId = '${myOwnerId}' AND IsClosed = false LIMIT 5`);
                const lista = tasks.records.map(t => t.Subject).join("\n• ");
                finalMsg = lista ? `📋 Tus pendientes actuales:\n• ${lista}` : "No tienes pendientes abiertos.";
            }

            res.status(200).json({ success: true, message: finalMsg, transcript: text });

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
}
