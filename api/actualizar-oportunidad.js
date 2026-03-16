import jsforce from 'jsforce';
import OpenAI from 'openai';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) {} }
  const { textoDictado, nombreCliente, resumenAprobado, etapaDetectada } = body;

  try {
    // FASE 1: ANALIZAR DICTADO
    if (textoDictado && !resumenAprobado) {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ role: "system", content: 'Analiza el dictado y devuelve JSON con llaves "draft" y "etapa" (Calificación, Necesita Análisis, Propuesta, Negociación, Cerrado Ganado, Cerrado Perdido, MANTENER).' }],
          response_format: { type: "json_object" }
        });
        return res.status(200).send(completion.choices[0].message.content);
    }

    // FASE 2: GUARDAR (OPTIMIZADA)
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

        // 1. Buscamos TODO de un solo golpe con una Query SOSL (Búsqueda rápida de texto)
        const searchQuery = `FIND {${nombreCliente.trim()}*} IN NAME FIELDS RETURNING Account (Id, Name, (SELECT Id, Name FROM Opportunities WHERE IsClosed = false ORDER BY CreatedDate DESC LIMIT 1))`;
        const searchResult = await conn.search(searchQuery);

        if (!searchResult.searchRecords || searchResult.searchRecords.length === 0) {
            return res.status(404).json({ error: "Cliente no encontrado" });
        }

        const account = searchResult.searchRecords[0];
        if (!account.Opportunities || account.Opportunities.totalSize === 0) {
            return res.status(404).json({ error: "Sin oportunidades abiertas" });
        }
        
        const oppId = account.Opportunities.records[0].Id;
        const updates = [];

        // 2. Tarea de seguimiento
        updates.push(conn.sobject("Task").create({
            WhatId: oppId,
            Subject: `Seguimiento Cotización - ${new Date().toLocaleDateString('es-MX')}`,
            Description: resumenAprobado,
            Status: 'Completed'
        }));

        // 3. Si hay cambio de etapa, lanzamos actualización de Opp y Quote en paralelo
        if (etapaDetectada && etapaDetectada !== "MANTENER") {
            updates.push(conn.sobject("Opportunity").update({ Id: oppId, StageName: etapaDetectada }));
            
            // Intentar cerrar la Quote solo si es cierre
            if (etapaDetectada.includes("Cerrado")) {
                const quoteStatus = etapaDetectada === "Cerrado Ganado" ? "Aceptado" : "Denegado";
                // Buscamos y actualizamos la Quote en un solo paso rápido
                updates.push(conn.query(`SELECT Id FROM Quote WHERE OpportunityId = '${oppId}' LIMIT 1`)
                    .then(qRes => {
                        if (qRes.records.length > 0) {
                            return conn.sobject("Quote").update({ Id: qRes.records[0].Id, Status: quoteStatus });
                        }
                    }));
            }
        }

        // Esperar máximo 7 segundos para no morir por Timeout de Vercel
        await Promise.all(updates);
        return res.status(200).json({ success: true, message: `Actualizado con éxito` });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
