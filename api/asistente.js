import OpenAI from "openai";
import multiparty from "multiparty";
import fs from "fs";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const config = {
  api: { bodyParser: false },
};

// La conexión definitiva basada en tu Refresh Token
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
    throw new Error(`Error de Refresh Token: ${errorText}`);
  }
  const data = await response.json();
  return { accessToken: data.access_token, instanceUrl: data.instance_url };
}

export default async function handler(req, res) {
  // 🚨 LA TRAMPA PARA EL IPAD: Convierte tu URL en un extractor de Tokens 🚨
  if (req.method === 'GET') {
    const url = new URL(req.url, `https://${req.headers.host}`);
    const code = url.searchParams.get("code");

    if (code) {
      try {
        const response = await fetch("https://login.salesforce.com/services/oauth2/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "authorization_code",
            client_id: process.env.SF_CLIENT_ID,
            client_secret: process.env.SF_CLIENT_SECRET,
            redirect_uri: "https://login.salesforce.com/services/oauth2/success",
            code: code
          })
        });
        const data = await response.json();
        
        res.setHeader('Content-Type', 'text/html');
        return res.status(200).send(`
          <html lang="es">
            <body style="font-family: sans-serif; padding: 40px; text-align: center; background-color: #f4f4f5;">
              <h2 style="color: #333;">¡Misión Cumplida, Miguel! 🎉</h2>
              <p>Aquí está tu Refresh Token Permanente:</p>
              <div style="background: white; padding: 20px; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); font-size: 20px; word-break: break-all; margin: 20px 0; border: 2px solid #0070d2;">
                <strong>${data.refresh_token || "⚠️ Error: " + JSON.stringify(data)}</strong>
              </div>
              <p style="color: #666;">Copia el código en negritas, mételo a tus variables de Vercel como <b>SF_REFRESH_TOKEN</b> y haz tu último Redeploy.</p>
            </body>
          </html>
        `);
      } catch (e) {
        return res.status(500).send(`Error interno: ${e.message}`);
      }
    }
    return res.status(200).send("La puerta trasera está lista. Solo falta que le envíes el ?code= en la URL.");
  }

  // ================================================================
  // EL RESTO DEL CÓDIGO NORMAL DE TU ASISTENTE COMERCIAL (POST)
  // ================================================================
  res.setHeader('Content-Type', 'application/json');
  const form = new multiparty.Form();

  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ success: false, error: "Error al procesar el formulario." });

    try {
      let transcripcionText = "";
      const action = fields.action ? fields.action[0] : null;

      if (action === 'getAllAccounts') {
        try {
          const { accessToken, instanceUrl } = await getSalesforceAccessToken();
          const query = encodeURIComponent("SELECT Id, Name, BillingCity FROM Account ORDER BY Name ASC LIMIT 200");
          const queryResponse = await fetch(`${instanceUrl}/services/data/v57.0/query?q=${query}`, {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
          });
          const queryData = await queryResponse.json();
          return res.status(200).json({ success: true, accounts: queryData.records || [] });
        } catch (sfError) {
          return res.status(200).json({ success: true, accounts: [{ Id: "error", Name: `⚠️ Error: ${sfError.message}`, BillingCity: "Validar credenciales" }] });
        }
      }

      if (action === 'confirmar') {
        const payload = JSON.parse(fields.payload[0]);
        const { accessToken, instanceUrl } = await getSalesforceAccessToken();
        const taskBody = { WhatId: payload.accountId, Subject: payload.subject, Description: payload.description, Status: "Completed", Priority: "Normal", ActivityDate: payload.fecha };
        await fetch(`${instanceUrl}/services/data/v57.0/sobjects/Task`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(taskBody)
        });
        return res.status(200).json({ success: true, message: "Inyectado correctamente en Salesforce." });
      }

      const audioFile = files.audio ? files.audio[0] : null;
      const textoManual = fields.texto ? fields.texto[0] : null;

      if (audioFile && audioFile.path) {
        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(audioFile.path), model: "whisper-1", language: "es"
        });
        transcripcionText = transcription.text;
      } else if (textoManual) {
        transcripcionText = textoManual;
      } else {
        return res.status(400).json({ success: false, error: "No se detectó audio ni texto." });
      }

      const promptAuditoria = `
        Eres el asistente inteligente de Miguel para REGO-FIX.
        Tu meta es tomar sus minutas y estructurar el JSON.
        Dictado actual: "${transcripcionText}"
        Responde en formato JSON.
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
      return res.status(200).json(respuestaFinal);

    } catch (innerError) {
      return res.status(500).json({ success: false, error: innerError.message });
    }
  });
}
