import jsforce from 'jsforce';
import OpenAI from 'openai';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) {} }
  const { textoDictado, nombreCliente, resumenAprobado, etapaDetectada } = body;

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // FASE 1: RESUMEN SENCILLO PARA EL IPHONE
    if (textoDictado && !resumenAprobado) {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ 
            role: "system", 
            content: 'Eres un asistente técnico. Resume el dictado en puntos clave. También detecta la etapa (Calificación, Necesita Análisis, Propuesta, Negociación, Cerrado Ganado, Cerrado Perdido o MANTENER). Responde SOLO en JSON con este formato: {"draft": "resumen aquí", "etapa": "etapa aquí"}' 
          }],
          response_format: { type: "json_object" }
        });
        return res.status(200).json(JSON.parse(completion.choices[0].message.content));
    }

    // FASE 2: GUARDAR EN SALESFORCE
    if (resumenAprobado) {
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

        // Buscar cuenta y oportunidad abierta
        const result = await conn.query(`SELECT Id, (SELECT Id FROM Opportunities WHERE IsClosed = false ORDER BY CreatedDate DESC LIMIT 1) FROM Account WHERE Name LIKE '%${nombreCliente}%' LIMIT 1`);
        
        if (!result.records[0] || !result.records[0].Opportunities) return res.status(404).json({ error: "No se halló registro" });
        const oppId = result.records[0].Opportunities.records[0].Id;

        // Actualizar Salesforce
        const tasks = [conn.sobject("Task").create({ WhatId: oppId, Subject: `Seguimiento - ${new Date().toLocaleDateString()}`, Description: resumenAprobado, Status: 'Completed' })];
        if (etapaDetectada && etapaDetectada !== "MANTENER") {
            tasks.push(conn.sobject("Opportunity").update({ Id: oppId, StageName: etapaDetectada }));
        }

        await Promise.all(tasks);
        return res.status(200).json({ success: true, message: "¡Listo! Salesforce actualizado." });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
