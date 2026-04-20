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

            // 1. Transcribir dictado
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
                        content: `Eres el asistente de voz de REGO-FIX. Hoy es ${new Date().toLocaleDateString()}.
                        Tu tarea es detectar qué quiere el usuario:
                        - REGISTRAR_VISITA: Crear Tarea completada.
                        - AGENDAR_CITA: Crear Evento. (Asegúrate de extraer fecha YYYY-MM-DD y hora HH:mm).
                        - CONSULTAR_RESUMEN: El usuario pregunta "¿Qué hice último?", "¿Cuál fue la última cuenta que visité?" o "¿Qué actividades tengo?".
                        
                        Devuelve JSON: { "accion", "cliente", "fecha", "hora", "resumen" }`
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

            // --- ACCIÓN: REGISTRAR VISITA ---
            if (plan.accion === 'REGISTRAR_VISITA') {
                await conn.sobject("Task").create({
                    Subject: `Visita: ${plan.cliente}`,
                    Description: plan.resumen,
                    Status: 'Completed',
                    OwnerId: myOwnerId
                });
                finalMsg = `✅ Visita en ${plan.cliente} registrada en Salesforce.`;
            } 
            
            // --- ACCIÓN: AGENDAR CITA (Corrección de hora local) ---
            else if (plan.accion === 'AGENDAR_CITA') {
                // Eliminamos la 'Z' final para que Salesforce use la hora local de tu configuración
                const startDT = `${plan.fecha}T${plan.hora || '09:00'}:00`; 
                await conn.sobject("Event").create({
                    Subject: `Cita: ${plan.cliente}`,
                    StartDateTime: startDT,
                    DurationInMinutes: 60,
                    OwnerId: myOwnerId
                });
                finalMsg = `📅 Cita agendada con ${plan.cliente} para el ${plan.fecha} a las ${plan.hora}.`;
            }

            // --- ACCIÓN: CONSULTAR RESUMEN (Nueva función) ---
            else if (plan.accion === 'CONSULTAR_RESUMEN') {
                // Buscamos la última tarea completada para saber cuál fue la última visita
                const lastTask = await conn.query(
                    `SELECT Subject, Description, CreatedDate FROM Task 
                     WHERE OwnerId = '${myOwnerId}' AND Status = 'Completed' 
                     ORDER BY CreatedDate DESC LIMIT 1`
                );

                if (lastTask.records.length > 0) {
                    const task = lastTask.records[0];
                    finalMsg = `Tu última actividad registrada fue: "${task.Subject}". \nNotas: ${task.Description || 'Sin notas'}.`;
                } else {
                    finalMsg = "No encontré actividades recientes registradas a tu nombre.";
                }
            }

            res.status(200).json({ success: true, message: finalMsg, transcript: text });

        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    });
}
