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

    // ====================================================================
    // FASE 1: ANALIZAR DICTADO (BORRADOR + DETECCIÓN DE ETAPA)
    // ====================================================================
    if (textoDictado && !resumenAprobado) {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ 
            role: "system", 
            content: 'Eres un experto consultor de REGO-FIX. Resume el dictado técnico en viñetas cortas. Detecta la etapa: Calificación, Necesita Análisis, Propuesta, Negociación, Cerrado Ganado, Cerrado Perdido o MANTENER. Responde SOLO en JSON con llaves "draft" y "etapa".' 
          },
          { role: "user", content: `Cliente: ${nombreCliente}. Dictado: ${textoDictado}` }],
          response_format: { type: "json_object" }
        });
        const respuestaIA = JSON.parse(completion.choices[0].message.content);
        return res.status(200).json(respuestaIA);
    }

    // ====================================================================
    // FASE 2: GUARDAR EN SALESFORCE (ACTUALIZACIÓN INTEGRAL)
    // ====================================================================
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

        // Buscamos la Oportunidad abierta más reciente de la cuenta
        const result = await conn.query(`SELECT Id, Name FROM Opportunity WHERE Account.Name LIKE '%${nombreCliente.trim()}%' AND IsClosed = false ORDER BY CreatedDate DESC LIMIT 1`);
        
        if (result.records.length === 0) {
            return res.status(200).json({ success: false, message: "No se encontró oportunidad abierta para este cliente." });
        }
        
        const oppId = result.records[0].Id;
        const oppName = result.records[0].Name;
        const updates = [];

        // 1. Crear Tarea de Historial
        updates.push(conn.sobject("Task").create({
            WhatId: oppId,
            Subject: `Seguimiento de Cotización - ${new Date().toLocaleDateString('es-MX')}`,
            Description: resumenAprobado,
            Status: 'Completed'
        }));

        // 2. Lógica de Sincronización Oportunidad + Cotización
        if (etapaDetectada && etapaDetectada !== "MANTENER") {
            let oppUpdate = { Id: oppId, StageName: etapaDetectada };

            // Forzar cierre técnico en la Oportunidad
            if (etapaDetectada === "Cerrado Ganado") {
                oppUpdate.Probability = 100;
                oppUpdate.ForecastCategoryName = "Closed";
            } else if (etapaDetectada === "Cerrado Perdido") {
                oppUpdate.Probability = 0;
            }

            updates.push(conn.sobject("Opportunity").update(oppUpdate));

            // Buscar CUALQUIER cotización vinculada para cerrarla también
            const quoteResult = await conn.sobject("Quote").find({ OpportunityId: oppId }).limit(1);
            if (quoteResult.length > 0) {
                let qStatus = "";
                if (etapaDetectada === "Cerrado Ganado") qStatus = "Aceptado";
                if (etapaDetectada === "Cerrado Perdido") qStatus = "Denegado";
                
                if (qStatus) {
                    updates.push(conn.sobject("Quote").update({ 
                        Id: quoteResult[0].Id, 
                        Status: qStatus 
                    }));
                }
            }
        }

        await Promise.all(updates);
        return res.status(200).json({ 
            success: true, 
            message: `Actualizado: ${oppName} ${etapaDetectada !== 'MANTENER' ? ' -> ' + etapaDetectada : ''}` 
        });
    }

    return res.status(400).json({ error: "Petición incompleta" });

  } catch (e) {
    return res.status(500).json({ success: false, message: `Error: ${e.message}` });
  }
}
