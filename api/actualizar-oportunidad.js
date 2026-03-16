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

    if (textoDictado && !resumenAprobado) {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: 'Resume el dictado para REGO-FIX y detecta la etapa. JSON: {"draft":"...","etapa":"..."}' }],
          response_format: { type: "json_object" }
        });
        return res.status(200).json(JSON.parse(completion.choices[0].message.content));
    }

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

        const result = await conn.query(`SELECT Id, Name FROM Opportunity WHERE Account.Name LIKE '%${nombreCliente.trim()}%' AND IsClosed = false ORDER BY CreatedDate DESC LIMIT 1`);
        if (result.records.length === 0) return res.status(200).json({ success: false, message: "No se halló oportunidad." });
        
        const oppId = result.records[0].Id;
        const updates = [];

        // 1. Tarea
        updates.push(conn.sobject("Task").create({ WhatId: oppId, Subject: `Seguimiento - ${new Date().toLocaleDateString()}`, Description: resumenAprobado, Status: 'Completed' }));

        // 2. Mapeo de Etapas (Traducción técnico-comercial)
        if (etapaDetectada && etapaDetectada !== "MANTENER") {
            let sfStage = etapaDetectada;
            let sfQuoteStatus = "";

            // TRADUCTOR PARA SALESFORCE
            if (etapaDetectada === "Cerrado Ganado") { 
                sfStage = "Closed Won"; // Nombre API típico
                sfQuoteStatus = "Accepted"; 
            } else if (etapaDetectada === "Cerrado Perdido") { 
                sfStage = "Closed Lost"; // Nombre API típico
                sfQuoteStatus = "Denied"; 
            }

            updates.push(conn.sobject("Opportunity").update({ 
                Id: oppId, 
                StageName: sfStage,
                Probability: sfStage === "Closed Won" ? 100 : (sfStage === "Closed Lost" ? 0 : undefined)
            }));

            // 3. Actualizar Quote
            const quotes = await conn.sobject("Quote").find({ OpportunityId: oppId }).limit(1);
            if (quotes.length > 0 && sfQuoteStatus) {
                updates.push(conn.sobject("Quote").update({ Id: quotes[0].Id, Status: sfQuoteStatus }));
            }
        }

        await Promise.all(updates);
        return res.status(200).json({ success: true, message: "¡Sincronización total completada!" });
    }
  } catch (e) {
    return res.status(200).json({ success: false, message: `Error: ${e.message}` });
  }
}
