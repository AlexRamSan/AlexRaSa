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
            content: 'Eres un experto en REGO-FIX. Resume el dictado técnico. Detecta la etapa EXACTA de estas opciones: Calificación, Necesita Análisis, Propuesta, Negociación, Cerrado Ganado, Cerrado Perdido. Si no hay cambio, usa MANTENER. JSON: {"draft":"...","etapa":"..."}' 
          }, { role: "user", content: `Dictado: ${textoDictado}` }],
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

        // Buscamos la Oportunidad y la Cotización que esté SINCRONIZANDO (IsSyncing)
        const query = `SELECT Id, Name, (SELECT Id FROM Quotes WHERE IsSyncing = true LIMIT 1) 
                       FROM Opportunity 
                       WHERE Account.Name LIKE '%${nombreCliente.trim()}%' AND IsClosed = false 
                       ORDER BY CreatedDate DESC LIMIT 1`;
        const result = await conn.query(query);

        if (result.records.length === 0) {
            return res.status(200).json({ success: false, message: "No se encontró oportunidad abierta para este cliente." });
        }

        const opp = result.records[0];
        const updates = [];

        // 1. Crear la Tarea de historial (Siempre se crea)
        updates.push(conn.sobject("Task").create({
            WhatId: opp.Id,
            Subject: `Seguimiento de Cotización - ${new Date().toLocaleDateString('es-MX')}`,
            Description: resumenAprobado,
            Status: 'Completed'
        }));

        // 2. Lógica Maestra de Etapas
        if (etapaDetectada && etapaDetectada !== "MANTENER") {
            // Actualizar la Oportunidad con el nombre exacto de tu barra azul
            updates.push(conn.sobject("Opportunity").update({ 
                Id: opp.Id, 
                StageName: etapaDetectada.trim() 
            }));

            // Si hay una cotización sincronizando y es un cierre, la actualizamos
            if (opp.Quotes && opp.Quotes.records.length > 0) {
                const quoteId = opp.Quotes.records[0].Id;
                let statusQuote = "";
                
                if (etapaDetectada === "Cerrado Ganado") statusQuote = "Aceptado";
                if (etapaDetectada === "Cerrado Perdido") statusQuote = "Denegado";
                
                if (statusQuote) {
                    updates.push(conn.sobject("Quote").update({ 
                        Id: quoteId, 
                        Status: statusQuote 
                    }));
                }
            }
        }

        await Promise.all(updates);
        return res.status(200).json({ 
            success: true, 
            message: `¡Éxito! Oportunidad ${opp.Name} actualizada a ${etapaDetectada}.` 
        });
    }
  } catch (e) {
    return res.status(200).json({ success: false, message: `Error técnico: ${e.message}` });
  }
}
