import OpenAI from "openai";
import jsforce from "jsforce";
import multiparty from "multiparty";
import fs from "fs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
export const config = { api: { bodyParser: false } };

const myOwnerId = "005WQ00000C6Kl7YAF"; 

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

  if (!authRes.ok) throw new Error(`Fallo de autenticación: ${await authRes.text()}`);
  const authData = await authRes.json();
  return new jsforce.Connection({ instanceUrl: authData.instance_url, accessToken: authData.access_token });
}

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
      const action = fields.action ? fields.action[0] : null;

      // ==========================================
      // ACCIÓN: OBTENER TODAS LAS CUENTAS (Manual)
      // ==========================================
      if (action === 'getAllAccounts') {
        try {
          const conn = await connectSF();
          const allAccs = await conn.query(`SELECT Id, Name, BillingCity FROM Account ORDER BY Name ASC LIMIT 200`);
          return res.status(200).json({ success: true, accounts: allAccs.records || [] });
        } catch (error) {
          return res.status(500).json({ success: false, error: error.message });
        }
      }

      // ==========================================
      // CONFIRMACIÓN Y ESCRITURA EN SALESFORCE
      // ==========================================
      if (action === 'confirmar') {
        const payload = JSON.parse(fields.payload[0]);
        const conn = await connectSF();

        // CERRAR OPORTUNIDAD + ORDEN DE COMPRA
        if (payload.taskType === 'CERRAR_COTIZACION') {
          await conn.sobject("Opportunity").update({ Id: payload.opportunityId, StageName: 'Closed Won' });
          const ordenDeCompra = files.documento ? files.documento[0] : null;
          
          if (ordenDeCompra && ordenDeCompra.path) {
            const base64Data = fs.readFileSync(ordenDeCompra.path, { encoding: 'base64' });
            await conn.sobject("ContentVersion").create({
              Title: ordenDeCompra.originalFilename || 'Orden_de_Compra',
              PathOnClient: ordenDeCompra.originalFilename || 'Orden_de_Compra.pdf',
              VersionData: base64Data,
              FirstPublishLocationId: payload.opportunityId
            });
            return res.status(200).json({ success: true, message: "Cotización ganada y Orden de Compra adjuntada 🎯📁" });
          }
          return res.status(200).json({ success: true, message: "Cotización ganada en Salesforce 🎯 (Sin archivo)" });
        }

        // AGENDAR EVENTO A FUTURO
        if (payload.taskType === 'EVENTO' || payload.taskType === 'AGENDAR_VISITA') {
          await conn.sobject("Event").create({
            Subject: payload.subject, Description: payload.description,
            StartDateTime: `${payload.fecha}T${payload.hora || '09:00'}:00`,
            DurationInMinutes: 60, WhatId: payload.accountId, OwnerId: myOwnerId
          });
          return res.status(200).json({ success: true, message: "Visita agendada correctamente." });
        }

        // MINUTA ESTÁNDAR (VISITA/DEMO/COBRANZA)
        await conn.sobject("Task").create({
          Subject: payload.subject, Description: payload.description,
          Status: 'Completed', WhatId: payload.accountId, OwnerId: myOwnerId
        });
        return res.status(200).json({ success: true, message: "Minuta inyectada correctamente." });
      }

      // ==========================================
      // PROCESAMIENTO DE VOZ Y DECISIÓN IA
      // ==========================================
      let transcripcionText = "";
      if (files.audio && files.audio[0].path) {
        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(files.audio[0].path), model: "whisper-1", language: "es"
        });
        transcripcionText = transcription.text;
      } else if (fields.texto) {
        transcripcionText = fields.texto[0];
      } else {
        return res.status(400).json({ success: false, error: "Sin audio o texto." });
      }

      const promptAuditoria = `
        Eres el Asistente Comercial Inteligente de REGO-FIX.
        Analiza el texto y clasifica el 'intent':
        1. REGISTRAR_ACTIVIDAD (Demo, Visita, Cobranza que ya pasó)
        2. AGENDAR_VISITA (Planes a futuro)
        3. CONSULTAR_OPORTUNIDADES (Si pide "reales", pon filtro_real: true)
        4. CERRAR_COTIZACION (Ganar negocio)
        5. CONSULTAR_PENDIENTES (Tareas propias no completadas)
        6. CONSULTAR_TAREAS_JEFE (Tareas creadas por gerencia para ti)

        Reglas: 'empresa_busqueda' solo palabra clave. 'asunto' usa "[CATEGORÍA] - Título".
        Dictado: "${transcripcionText}"

        JSON Requerido: { "intent", "empresa_busqueda", "asunto", "detalles", "fecha", "hora", "filtro_real": boolean }
      `;

      const aiResponse = await openai.chat.completions.create({
        model: "gpt-4o", response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Analista de ventas industriales." },
          { role: "user", content: promptAuditoria }
        ]
      });

      const plan = JSON.parse(aiResponse.choices[0].message.content);
      const conn = await connectSF();

      if (plan.intent === 'CONSULTAR_OPORTUNIDADES') {
        let queryStr = `SELECT Id, Name, Amount, StageName FROM Opportunity WHERE OwnerId = '${myOwnerId}' AND IsClosed = false`;
        if (plan.filtro_real) queryStr += ` AND StageName IN ('Value Proposition', 'Proposal/Price Quote', 'Negotiation/Review')`;
        const opps = await conn.query(`${queryStr} ORDER BY Amount DESC LIMIT 5`);
        return res.status(200).json({ success: true, intent: plan.intent, data: opps.records, message: plan.filtro_real ? "Tus oportunidades reales:" : "Tus oportunidades abiertas:" });
      }

      if (plan.intent === 'CONSULTAR_PENDIENTES') {
        const tasks = await conn.query(`SELECT Id, Subject, ActivityDate FROM Task WHERE OwnerId = '${myOwnerId}' AND Status != 'Completed' ORDER BY ActivityDate ASC LIMIT 5`);
        return res.status(200).json({ success: true, intent: plan.intent, data: tasks.records, message: "Tus pendientes:" });
      }

      if (plan.intent === 'CONSULTAR_TAREAS_JEFE') {
        const bossTasks = await conn.query(`SELECT Id, Subject, CreatedBy.Name, ActivityDate FROM Task WHERE OwnerId = '${myOwnerId}' AND Status != 'Completed' AND CreatedById != '${myOwnerId}' LIMIT 5`);
        return res.status(200).json({ success: true, intent: plan.intent, data: bossTasks.records, message: "Actividades de gerencia:" });
      }

      if (plan.intent === 'CERRAR_COTIZACION') {
        const targetOpps = await conn.query(`SELECT Id, Name, Amount FROM Opportunity WHERE OwnerId = '${myOwnerId}' AND IsClosed = false AND Name LIKE '%${plan.empresa_busqueda}%' LIMIT 3`);
        return res.status(200).json({ success: true, intent: plan.intent, plan: plan, records: targetOpps.records, needConfirmation: targetOpps.records.length > 0 });
      }

      // Flujo de Escritura PREDETERMINADO (Actividad / Evento)
      let searchResults = { records: [] };
      if (plan.empresa_busqueda) {
        searchResults = await conn.query(`SELECT Id, Name, BillingCity FROM Account WHERE Name LIKE '%${plan.empresa_busqueda}%' LIMIT 5`);
      }
      return res.status(200).json({ success: true, intent: plan.intent, plan: plan, records: searchResults.records, needConfirmation: searchResults.records.length > 0 });

    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  });
}
