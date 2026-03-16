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

    // FASE 1: ANALIZAR DICTADO (BORRADOR + ETAPA)
    if (textoDictado && !resumenAprobado) {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ 
            role: "system", 
            content: 'Eres un experto en REGO-FIX. Resume el dictado técnico de forma concisa (viñetas) y detecta la etapa: Calificación, Necesita Análisis, Propuesta, Negociación, Cerrado Ganado, Cerrado Perdido o MANTENER. Responde SOLO en JSON con llaves "draft" y "etapa".' 
          },
          { role: "user", content: `Cliente: ${nombreCliente}. Dictado: ${textoDictado}` }],
          response_format: { type: "json_object" }
        });
        const respuestaIA = JSON.parse(completion.choices[0].message.content);
        return res.status(200).json(respuestaIA);
    }

    // FASE 2: GUARDAR EN SALESFORCE (ACTUALIZACIÓN SINCRO)
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

        // Query rápida para obtener Account y la Opportunity abierta
        const result = await conn.query(`SELECT Id, (SELECT Id, Name FROM Opportunities WHERE IsClosed = false ORDER BY CreatedDate DESC LIMIT 1) FROM Account WHERE Name LIKE '%${nombreCliente.trim()}%' LIMIT 1`);
        
        if (!result.records[0] || !result.records[0].Opportunities) {
            return res.status(404).json({ error: "No se encontró cliente u oportunidad abierta." });
        }
        
        const oppId = result.records[0].Opportunities.records[0].Id;
        const oppName = result.records[0].Opportunities.records[0].Name;

        const updates = [];
        
        // A. Crear Tarea de seguimiento
        updates.push(conn.sobject("Task").create({
            WhatId: oppId,
            Subject: `Seguimiento Cotización - ${new Date().toLocaleDateString('es-MX')}`,
            Description: resumenAprobado,
            Status: 'Completed'
        }));

        // B. Actualizar Etapa de Oportunidad y Estado de Cotización si aplica
        if (etapaDetectada && etapaDetectada !== "MANTENER") {
            updates.push(conn.sobject("Opportunity").update({ Id: oppId, StageName: etapaDetectada }));
            
            if (etapaDetectada.includes("Cerrado")) {
                const quoteStatus = etapaDetectada === "Cerrado Ganado" ? "Aceptado" : "Denegado";
                const quote = await conn.sobject("Quote").find({ OpportunityId: oppId }).limit(1);
                if (quote.length > 0) {
                    updates.push(conn.sobject("Quote").update({ Id: quote[0].Id, Status: quoteStatus }));
                }
            }
        }

        await Promise.all(updates);
        return res.status(200).json({ success: true, message: `¡Éxito! Oportunidad ${oppName} actualizada.` });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
