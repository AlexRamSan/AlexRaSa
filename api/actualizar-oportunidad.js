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

    // FASE 1: ANALIZAR DICTADO
    if (textoDictado && !resumenAprobado) {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ 
            role: "system", 
            content: 'Eres experto en REGO-FIX. Resume el dictado y detecta etapa: Calificación, Necesita Análisis, Propuesta, Negociación, Cerrado Ganado, Cerrado Perdido o MANTENER. JSON: {"draft":"...","etapa":"..."}' 
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

        const result = await conn.query(`SELECT Id, Name FROM Opportunity WHERE Account.Name LIKE '%${nombreCliente.trim()}%' AND IsClosed = false ORDER BY CreatedDate DESC LIMIT 1`);
        
        if (result.records.length === 0) return res.status(200).json({ success: false, message: "No se halló oportunidad abierta." });
        const oppId = result.records[0].Id;
        const updates = [];

        // 1. Tarea de historial
        updates.push(conn.sobject("Task").create({ WhatId: oppId, Subject: `Seguimiento - ${new Date().toLocaleDateString()}`, Description: resumenAprobado, Status: 'Completed' }));

        // 2. Mapeo a Nombres de API según tu imagen
        if (etapaDetectada && etapaDetectada !== "MANTENER") {
            let sfStage = "";
            let sfQuoteStatus = "";

            // Diccionario de traducción según tu configuración de Salesforce
            const mapeoEtapas = {
                "Calificación": "Qualification",
                "Necesita Análisis": "Needs Analysis",
                "Propuesta": "Proposal",
                "Negociación": "Negotiation",
                "Cerrado Ganado": "Closed Won",
                "Cerrado Perdido": "Closed Lost"
            };

            sfStage = mapeoEtapas[etapaDetectada] || etapaDetectada;

            let oppUpdate = { Id: oppId, StageName: sfStage };
            
            if (sfStage === "Closed Won") {
                oppUpdate.Probability = 100;
                oppUpdate.ForecastCategoryName = "Closed";
                sfQuoteStatus = "Accepted";
            } else if (sfStage === "Closed Lost") {
                oppUpdate.Probability = 0;
                sfQuoteStatus = "Denied";
            }

            updates.push(conn.sobject("Opportunity").update(oppUpdate));

            // 3. Actualizar Cotización (Quote)
            const quotes = await conn.sobject("Quote").find({ OpportunityId: oppId }).limit(1);
            if (quotes.length > 0 && sfQuoteStatus) {
                updates.push(conn.sobject("Quote").update({ Id: quotes[0].Id, Status: sfQuoteStatus }));
            }
        }

        await Promise.all(updates);
        return res.status(200).json({ success: true, message: `¡Sincronización exitosa! Oportunidad actualizada a ${etapaDetectada}.` });
    }
  } catch (e) {
    return res.status(200).json({ success: false, message: `Error: ${e.message}` });
  }
}
