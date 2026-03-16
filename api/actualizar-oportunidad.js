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

    // FASE 1: ANALIZAR (Aquí es donde se te está trabando el iPhone)
    if (textoDictado && !resumenAprobado) {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: 'Eres un experto en REGO-FIX. Resume el dictado y detecta la etapa: Calificación, Necesita Análisis, Propuesta, Negociación, Cerrado Ganado, Cerrado Perdido o MANTENER. Responde en JSON con llaves "draft" y "etapa".' }],
          response_format: { type: "json_object" }
        });
        
        // Enviamos el JSON puro y directo
        return res.status(200).send(completion.choices[0].message.content);
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

        // Búsqueda SOSL (la más rápida en Salesforce)
        const search = await conn.search(`FIND {${nombreCliente.trim()}*} IN NAME FIELDS RETURNING Account (Id, (SELECT Id FROM Opportunities WHERE IsClosed = false ORDER BY CreatedDate DESC LIMIT 1))`);

        if (!search.searchRecords[0] || !search.searchRecords[0].Opportunities) {
            return res.status(404).json({ error: "No hay cliente u opp abierta" });
        }

        const oppId = search.searchRecords[0].Opportunities.records[0].Id;

        // Tarea y Etapa en un solo golpe
        const p = [conn.sobject("Task").create({ WhatId: oppId, Subject: `Seguimiento Cotización - ${new Date().toLocaleDateString('es-MX')}`, Description: resumenAprobado, Status: 'Completed' })];
        
        if (etapaDetectada && etapaDetectada !== "MANTENER") {
            p.push(conn.sobject("Opportunity").update({ Id: oppId, StageName: etapaDetectada }));
        }

        await Promise.all(p);
        return res.status(200).json({ success: true, message: "¡Actualizado!" });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
