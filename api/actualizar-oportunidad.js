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
          messages: [{ role: "system", content: 'Resume el dictado técnico para REGO-FIX. Detecta etapa EXACTA: Calificación, Necesita Análisis, Propuesta, Negociación, Cerrado Ganado, Cerrado Perdido o MANTENER. JSON: {"draft":"...","etapa":"..."}' }],
          response_format: { type: "json_object" }
        });
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

        // Búsqueda del cliente y su oportunidad
        const result = await conn.query(`SELECT Id, (SELECT Id, Name, StageName FROM Opportunities WHERE IsClosed = false ORDER BY CreatedDate DESC LIMIT 1) FROM Account WHERE Name LIKE '%${nombreCliente.trim()}%' LIMIT 1`);
        
        if (!result.records[0] || !result.records[0].Opportunities) {
            return res.status(200).json({ success: false, message: "No se encontró cliente u oportunidad abierta." });
        }
        
        const oppId = result.records[0].Opportunities.records[0].Id;
        const updates = [];

        // Registro de la tarea
        updates.push(conn.sobject("Task").create({
            WhatId: oppId,
            Subject: `Seguimiento - ${new Date().toLocaleDateString('es-MX')}`,
            Description: resumenAprobado,
            Status: 'Completed'
        }));

        // Lógica de Etapa "Blindada"
        if (etapaDetectada && etapaDetectada !== "MANTENER") {
            // Solo actualizamos si la etapa es una de las válidas de tu Salesforce
            const etapasValidas = ["Calificación", "Necesita Análisis", "Propuesta", "Negociación", "Cerrado Ganado", "Cerrado Perdido"];
            if (etapasValidas.includes(etapaDetectada)) {
                updates.push(conn.sobject("Opportunity").update({ Id: oppId, StageName: etapaDetectada }));
                
                // Si es cierre, intentamos cerrar la cotización también
                if (etapaDetectada.includes("Cerrado")) {
                    const quote = await conn.sobject("Quote").find({ OpportunityId: oppId }).limit(1);
                    if (quote.length > 0) {
                        const qStat = etapaDetectada === "Cerrado Ganado" ? "Aceptado" : "Denegado";
                        updates.push(conn.sobject("Quote").update({ Id: quote[0].Id, Status: qStat }));
                    }
                }
            }
        }

        await Promise.all(updates);
        return res.status(200).json({ success: true, message: `¡Proceso completado! Oportunidad actualizada en Salesforce.` });
    }
  } catch (e) {
    return res.status(200).json({ success: false, message: `Error: ${e.message}` });
  }
}
