import jsforce from 'jsforce';
import OpenAI from 'openai';

export default async function handler(req, res) {
  // Encabezado para que el iPhone siempre sepa que recibe un Diccionario (JSON)
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
            content: 'Eres un experto en REGO-FIX. Analiza el dictado y devuelve un JSON con llaves "draft" (resumen técnico corto) y "etapa" (Calificación, Necesita Análisis, Propuesta, Negociación, Cerrado Ganado, Cerrado Perdido o MANTENER).' 
          }],
          response_format: { type: "json_object" }
        });
        
        const respuestaIA = JSON.parse(completion.choices[0].message.content);
        return res.status(200).json({
            success: true,
            draft: respuestaIA.draft,
            etapa: respuestaIA.etapa
        });
    }

    // ====================================================================
    // FASE 2: GUARDAR EN SALESFORCE (ACTUALIZACIÓN SÍNCRONA)
    // ====================================================================
    if (resumenAprobado) {
        // 1. Conexión Express a Salesforce
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

        // 2. Buscar Cliente y su Oportunidad abierta más reciente
        const query = `SELECT Id, Name, (SELECT Id, Name FROM Opportunities WHERE IsClosed = false ORDER BY CreatedDate DESC LIMIT 1) 
                       FROM Account WHERE Name LIKE '%${nombreCliente.trim()}%' LIMIT 1`;
        const result = await conn.query(query);

        if (result.records.length === 0) return res.status(404).json({ error: "Cliente no encontrado" });
        const account = result.records[0];
        if (!account.Opportunities || account.Opportunities.records.length === 0) {
            return res.status(404).json({ error: "No hay oportunidades abiertas para este cliente." });
        }
        
        const oppId = account.Opportunities.records[0].Id;
        const oppName = account.Opportunities.records[0].Name;

        // 3. Preparar actualizaciones en paralelo para evitar "Timeout" (trabe)
        const updates = [];
        
        // A. Crear la Tarea de seguimiento
        updates.push(conn.sobject("Task").create({
            WhatId: oppId,
            Subject: `Seguimiento Cotización - ${new Date().toLocaleDateString('es-MX')}`,
            Description: resumenAprobado,
            Status: 'Completed',
            Priority: 'Normal'
        }));

        // B. Si hay cambio de etapa, actualizar Oportunidad y Cotización (Quote)
        if (etapaDetectada && etapaDetectada !== "MANTENER") {
            updates.push(conn.sobject("Opportunity").update({ Id: oppId, StageName: etapaDetectada }));
            
            // Buscar si existe una Cotización (Quote) vinculada para cerrarla también
            const quote = await conn.sobject("Quote").find({ OpportunityId: oppId }).limit(1);
            if (quote.length > 0) {
                let qStatus = null;
                if (etapaDetectada === "Cerrado Ganado") qStatus = "Aceptado";
                if (etapaDetectada === "Cerrado Perdido") qStatus = "Denegado";
                
                if (qStatus) {
                    updates.push(conn.sobject("Quote").update({ Id: quote[0].Id, Status: qStatus }));
                }
            }
        }

        // Ejecutar todas las tareas de Salesforce al mismo tiempo
        await Promise.all(updates);

        return res.status(200).json({ 
            success: true, 
            message: `Actualizado: ${oppName}${etapaDetectada !== 'MANTENER' ? ' -> ' + etapaDetectada : ''}` 
        });
    }

    return res.status(400).json({ error: "Petición incompleta" });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, error: e.message });
  }
}
