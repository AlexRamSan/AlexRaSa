import OpenAI from "openai";
import multiparty from "multiparty";
import fs from "fs";
import jsforce from "jsforce";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const config = {
  api: {
    bodyParser: false, 
  },
};

// Conexión simplificada y directa a Salesforce mediante Refresh Token
async function getSalesforceConnection() {
  const conn = new jsforce.Connection({
    loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
    clientId: process.env.SF_CLIENT_ID,
    clientSecret: process.env.SF_CLIENT_SECRET
    // Eliminamos redirectUri para evitar el conflicto de mismatch
  });

  await conn.authorize({
    refresh_token: process.env.SF_REFRESH_TOKEN
  });

  return conn;
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido. Usa POST.' });
  }

  const form = new multiparty.Form();

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("Error parseando con multiparty:", err);
      return res.status(500).json({ success: false, error: "Error al procesar el formulario." });
    }

    try {
      let transcripcionText = "";
      const action = fields.action ? fields.action[0] : null;

      // ================================================================
      // ACCIÓN A: OBTENER TODAS LAS CUENTAS REALES DESDE SALESFORCE
      // ================================================================
      if (action === 'getAllAccounts') {
        try {
          const conn = await getSalesforceConnection();
          const result = await conn.query("SELECT Id, Name, BillingCity FROM Account ORDER BY Name ASC LIMIT 200");
          return res.status(200).json({ success: true, accounts: result.records });
        } catch (sfQueryError) {
          console.error("Error de consulta en Salesforce:", sfQueryError);
          return res.status(200).json({ 
            success: true, 
            accounts: [{ Id: "error", Name: `⚠️ Error de CRM: ${sfQueryError.message}`, BillingCity: "Revisar Vercel" }] 
          });
        }
      }

      // ================================================================
      // ACCIÓN B: CONFIRMAR E INYECTAR LA TAREA EN EL CLIENTE SELECCIONADO
      // ================================================================
      if (action === 'confirmar') {
        try {
          const payload = JSON.parse(fields.payload[0]);
          const conn = await getSalesforceConnection();

          await conn.sobject("Task").create({
            WhatId: payload.accountId,
            Subject: payload.subject,
            Description: payload.description,
            Status: "Completed",
            Priority: "Normal",
            ActivityDate: payload.fecha
          });

          return res.status(200).json({ success: true, message: "Inyectado correctamente en Salesforce." });
        } catch (sfInsertError) {
          console.error("Error al insertar actividad:", sfInsertError);
          return res.status(500).json({ success: false, error: `Error al guardar en Salesforce: ${sfInsertError.message}` });
        }
      }

      // ================================================================
      // ACCIÓN C: PROCESAR ENTRADA COMERCIAL (VOZ O BOTÓN MANUAL)
      // ================================================================
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
        return res.status(400).json({ success: false, error: "No se detectó audio ni texto válido." });
      }

      // AUDITORÍA DE GERENCIA CON GPT-4o
      const promptAuditoria = `
        Eres el asistente inteligente de Miguel para REGO-FIX México (RFMX).
        Tu meta es tomar sus minutas, pero actuar como auditor de los requerimientos de la gerencia.
        
        Puntos clave del reporte semanal:
        - Resultados del mes / Forecast.
        - Profit / Margen y Descuentos aplicados.
        - Actividad (Visitas, Oportunidades y Demos en piso de fábrica).
        - Cobranza (Cartera o acuerdos de pago).

        Dictado actual: "${transcripcionText}"

        Si falta información crucial del estatus de la planta o de la cobranza, genera una pregunta proactiva en el campo 'detalles' pidiéndole completar la información antes de guardar en Salesforce.

        Responde exclusivamente con este formato JSON:
        {
          "success": true,
          "transcript": "${transcripcionText}",
          "accounts": [], 
          "plan": {
            "intent": "REGISTRO_ACTIVIDAD",
            "asunto": "Reporte de Campo Estructurado",
            "detalles": "Escribe aquí la pregunta inteligente si faltan datos comerciales importantes, o el resumen limpio para Salesforce si la información está completa.",
            "fecha": "2026-05-19",
            "hora": "12:00"
          }
        }
      `;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Analista comercial de precisión industrial." },
          { role: "user", content: promptAuditoria }
        ],
        temperature: 0.2
      });

      let respuestaFinal = JSON.parse(completion.choices[0].message.content);
      
      // Auto-asociación inteligente basada en consultas en caliente
      try {
        const conn = await getSalesforceConnection();
        const lowTxt = transcripcionText.toLowerCase();
        let queryBusqueda = "";

        if (lowTxt.includes("bocar")) queryBusqueda = "SELECT Id, Name, BillingCity FROM Account WHERE Name LIKE '%Bocar%' LIMIT 3";
        if (lowTxt.includes("bosch")) queryBusqueda = "SELECT Id, Name, BillingCity FROM Account WHERE Name LIKE '%Bosch%' LIMIT 3";
        if (lowTxt.includes("nemak")) queryBusqueda = "SELECT Id, Name, BillingCity FROM Account WHERE Name LIKE '%Nemak%' LIMIT 3";

        if (queryBusqueda) {
          const searchResult = await conn.query(queryBusqueda);
          respuestaFinal.accounts = searchResult.records;
        }
      } catch (e) {
        console.error("Error en auto-asociación", e);
      }

      return res.status(200).json(respuestaFinal);

    } catch (innerError) {
      console.error("Error general en el backend:", innerError);
      return res.status(500).json({ success: false, error: innerError.message });
    }
  });
}
