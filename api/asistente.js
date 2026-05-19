import OpenAI from "openai";
import jsforce from "jsforce";
import multiparty from "multiparty";
import fs from "fs";

// Inicializar OpenAI
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Configuración para permitir archivos (Audios) en Vercel
export const config = { api: { bodyParser: false } };

// Tu ID fijo para asignar las tareas directamente a tu usuario
const myOwnerId = "005WQ00000C6Kl7YAF"; 

// --- FUNCIÓN DE AUTENTICACIÓN (EL MÉTODO QUE SÍ FUNCIONA) ---
async function connectSF() {
  const authRes = await fetch('https://rego-fix.my.salesforce.com/services/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.SF_CLIENT_ID.trim(),
      client_secret: process.env.SF_CLIENT_SECRET.trim()
    })
  });

  if (!authRes.ok) {
    const errText = await authRes.text();
    throw new Error(`Fallo de autenticación Client Credentials: ${errText}`);
  }

  const authData = await authRes.json();
  return new jsforce.Connection({ 
    instanceUrl: authData.instance_url, 
    accessToken: authData.access_token 
  });
}

export default async function handler(req, res) {
  // Configuración de CORS
  const origin = req.headers.origin;
  res.setHeader('Access-Control-Allow-Origin', origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const form = new multiparty.Form();

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ success: false, error: "Error de lectura de formulario" });

    try {
      const action = fields.action ? fields.action[0] : null;

      // ================================================================
      // ACCIÓN A: OBTENER TODAS LAS CUENTAS 
      // ================================================================
      if (action === 'getAllAccounts') {
        const conn = await connectSF();
        const allAccs = await conn.query(`SELECT Id, Name, BillingCity FROM Account WHERE OwnerId = '${myOwnerId}' ORDER BY Name ASC LIMIT 200`);
        return res.status(200).json({ success: true, accounts: allAccs.records || [] });
      }

      // ================================================================
      // ACCIÓN B: CONFIRMAR Y GUARDAR ACTIVIDAD EN SALESFORCE
      // ================================================================
      if (action === 'confirmar') {
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
        return res.status(200).json({ success: true, message: "Inyectado correctamente en Salesforce." });
      }

      // ================================================================
      // ACCIÓN C: PROCESAR VOZ O TEXTO MANUAL CON IA
      // ================================================================
      let transcripcionText = "";
      const audioFile = files.audio ? files.audio[0] : null;
      const textoManual = fields.texto ? fields.texto[0] : null;

      if (audioFile && audioFile.path) {
        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(audioFile.path),
          model: "whisper-1",
          language: "es"
        });
        transcripcionText = transcription.text;
      } else if (textoManual) {
        transcripcionText = textoManual;
      } else {
        return res.status(400).json({ success: false, error: "No se recibió audio ni texto válido." });
      }

      // Prompt estructurado para auditoría comercial
      const promptAuditoria = `
        Eres el Asistente Full de REGO-FIX. Hoy es ${new Date().toLocaleDateString()}.
        Tu meta es tomar las minutas de Miguel y estructurarlas.
        
        Puntos clave: Resultados, Profit, Actividad, Cobranza.
        Dictado actual: "${transcripcionText}"

        Extrae la intención y la empresa. Para 'empresa_busqueda', usa solo la palabra clave principal (ej: de "Bocar Lerma" extrae "Bocar").

        Responde exclusivamente con este formato JSON:
        {
          "success": true,
          "plan": {
            "intent": "REGISTRO_ACTIVIDAD",
            "empresa_busqueda": "Palabra Clave",
            "asunto": "Reporte de Campo",
            "detalles": "Resumen limpio de la minuta...",
            "fecha": "2026-05-19",
            "hora": "12:00"
          }
        }
      `;

      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "Analista comercial de precisión industrial." },
          { role: "user", content: promptAuditoria }
        ],
        response_format: { type: "json_object" }
      });

      const aiResult = JSON.parse(aiResponse.choices[0].message.content);
      const plan = aiResult.plan || aiResult;

      // Autenticamos para buscar la empresa que la IA detectó
      const conn = await connectSF();
      let searchResults = { records: [] };

      if (plan.empresa_busqueda && plan.empresa_busqueda !== "") {
        searchResults = await conn.query(`SELECT Id, Name, BillingCity FROM Account WHERE Name LIKE '%${plan.empresa_busqueda}%' LIMIT 5`);
      }

      return res.status(200).json({ 
        success: true, 
        transcript: transcripcionText,
        plan: plan,
        accounts: searchResults.records,
        needSelection: searchResults.records.length > 0
      });

    } catch (error) {
      console.error("Error en ejecución del backend:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });
}
