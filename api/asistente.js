import OpenAI from "openai";
import multiparty from "multiparty";
import fs from "fs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const config = {
  api: {
    bodyParser: false, 
  },
};

// FUNCIÓN NATIVA: Consigue el Access Token directo de Salesforce sin usar JSForce
async function getSalesforceAccessToken() {
  const loginUrl = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.SF_CLIENT_ID,
    client_secret: process.env.SF_CLIENT_SECRET,
    refresh_token: process.env.SF_REFRESH_TOKEN
  });

  const response = await fetch(`${loginUrl}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString()
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Error de autenticación nativa: ${errorText}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    instanceUrl: data.instance_url
  };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido.' });
  }

  const form = new multiparty.Form();

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("Error parseando formulario:", err);
      return res.status(500).json({ success: false, error: "Error al procesar el formulario." });
    }

    try {
      let transcripcionText = "";
      const action = fields.action ? fields.action[0] : null;

      // ================================================================
      // ACCIÓN A: EXTRAER TU CATÁLOGO DE CUENTAS REALES (SOQL VÍA REST)
      // ================================================================
      if (action === 'getAllAccounts') {
        try {
          const { accessToken, instanceUrl } = await getSalesforceAccessToken();
          
          // Consulta limpia mediante la API REST nativa de Salesforce
          const query = encodeURIComponent("SELECT Id, Name, BillingCity FROM Account ORDER BY Name ASC LIMIT 200");
          const queryResponse = await fetch(`${instanceUrl}/services/data/v57.0/query?q=${query}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          });

          const queryData = await queryResponse.json();
          return res.status(200).json({ success: true, accounts: queryData.records || [] });
        } catch (sfError) {
          console.error("Fallo en API REST de Salesforce:", sfError);
          return res.status(200).json({ 
            success: true, 
            accounts: [{ Id: "error", Name: `⚠️ Conexión Bypass: ${sfError.message}`, BillingCity: "Revisar variables" }] 
          });
        }
      }

      // ================================================================
      // ACCIÓN B: REGISTRAR LA ACTIVIDAD DIRECTAMENTE EN EL CRM
      // ================================================================
      if (action === 'confirmar') {
        try {
          const payload = JSON.parse(fields.payload[0]);
          const { accessToken, instanceUrl } = await getSalesforceAccessToken();

          const taskBody = {
            WhatId: payload.accountId,
            Subject: payload.subject,
            Description: payload.description,
            Status: "Completed",
            Priority: "Normal",
            ActivityDate: payload.fecha
          };

          const insertResponse = await fetch(`${instanceUrl}/services/data/v57.0/sobjects/Task`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(taskBody)
          });

          if (!insertResponse.ok) throw new Error("No se pudo insertar la tarea en el CRM.");

          return res.status(200).json({ success: true, message: "Inyectado correctamente en Salesforce." });
        } catch (sfInsertError) {
          console.error("Error al insertar actividad:", sfInsertError);
          return res.status(500).json({ success: false, error: sfInsertError.message });
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
      
      // AUTO-ASOCIACIÓN INTELIGENTE DIRECTA EN LA API REST
      try {
        const lowTxt = transcripcionText.toLowerCase();
        let queryBusqueda = "";

        if (lowTxt.includes("bocar")) queryBusqueda = "SELECT Id, Name, BillingCity FROM Account WHERE Name LIKE '%Bocar%' LIMIT 3";
        if (lowTxt.includes("bosch")) queryBusqueda = "SELECT Id, Name, BillingCity FROM Account WHERE Name LIKE '%Bosch%' LIMIT 3";
        if (lowTxt.includes("nemak")) queryBusqueda = "SELECT Id, Name, BillingCity FROM Account WHERE Name LIKE '%Nemak%' LIMIT 3";

        if (queryBusqueda) {
          const { accessToken, instanceUrl } = await getSalesforceAccessToken();
          const searchResult = await fetch(`${instanceUrl}/services/data/v57.0/query?q=${encodeURIComponent(queryBusqueda)}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${accessToken}` }
          });
          const searchData = await searchResult.json();
          respuestaFinal.accounts = searchData.records || [];
        }
      } catch (e) {
        console.error("Error en auto-asociación nativa:", e);
      }

      return res.status(200).json(respuestaFinal);

    } catch (innerError) {
      console.error("Error general en el backend:", innerError);
      return res.status(500).json({ success: false, error: innerError.message });
    }
  });
}
