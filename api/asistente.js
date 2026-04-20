import OpenAI from "openai";
import jsforce from "jsforce";
import multiparty from "multiparty";
import fs from "fs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const config = { api: { bodyParser: false } }; // Necesario para recibir archivos de audio

export default async function handler(req, res) {
    const origin = req.headers.origin;
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    const form = new multiparty.Form();
    
    form.parse(req, async (err, fields, files) => {
        if (err) return res.status(500).json({ error: err.message });

        try {
            const ownerId = fields.ownerId[0]; // ID del vendedor
            const audioPath = files.audio[0].path;

            // 1. Transcribir Audio con Whisper
            const transcription = await openai.audio.transcriptions.create({
                file: fs.createReadStream(audioPath),
                model: "whisper-1",
                language: "es"
            });

            const text = transcription.text;

            // 2. Interpretar Intención con GPT-4o
            const aiResponse = await openai.chat.completions.create({
                model: "gpt-4o",
                messages: [
                    {
                        role: "system",
                        content: `Eres el asistente de voz de REGO-FIX. Tu objetivo es interpretar lo que el vendedor dice y convertirlo en acciones de Salesforce.
                        Hoy es ${new Date().toLocaleDateString()}.
                        
                        Acciones posibles:
                        - AGENDAR_CITA: Crear un Evento (cita/reunión). Necesitas: Fecha, Hora, Cliente.
                        - REGISTRAR_VISITA: Crear una Tarea completada (minuta). Necesitas: Cliente, Resumen.
                        - CREAR_PENDIENTE: Crear una Tarea abierta. Necesitas: Tarea, Fecha vencimiento.
                        - CONSULTAR_PENDIENTES: Leer tareas abiertas hoy.
                        
                        Devuelve estrictamente un JSON: { "accion", "cliente", "fecha", "hora", "resumen", "tarea" }`
                    },
                    { role: "user", content: text }
                ],
                response_format: { type: "json_object" }
            });

            const plan = JSON.parse(aiResponse.choices[0].message.content);

            // 3. Conectar a Salesforce
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

            let resultMessage = `Entendido: "${text}"`;

            // 4. Ejecutar en Salesforce
            if (plan.accion === 'REGISTRAR_VISITA') {
                await conn.sobject("Task").create({
                    Subject: `Visita: ${plan.cliente}`,
                    Description: plan.resumen,
                    Status: 'Completed',
                    OwnerId: ownerId,
                    Priority: 'Normal'
                });
                resultMessage = `✅ Visita registrada para ${plan.cliente}.`;
            } 
            else if (plan.accion === 'AGENDAR_CITA') {
                await conn.sobject("Event").create({
                    Subject: `Cita: ${plan.cliente}`,
                    StartDateTime: `${plan.fecha}T${plan.hora || '10:00'}:00Z`,
                    DurationInMinutes: 60,
                    OwnerId: ownerId
                });
                resultMessage = `📅 Cita agendada con ${plan.cliente} para el ${plan.fecha}.`;
            }
            else if (plan.accion === 'CONSULTAR_PENDIENTES') {
                const tasks = await conn.query(`SELECT Subject FROM Task WHERE OwnerId = '${ownerId}' AND IsClosed = false`);
                const lista = tasks.records.map(t => t.Subject).join(", ");
                resultMessage = lista ? `📋 Tus pendientes: ${lista}` : "No tienes pendientes para hoy.";
            }

            res.status(200).json({ success: true, message: resultMessage, transcript: text });

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
}
