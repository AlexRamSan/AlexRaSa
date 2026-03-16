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
            content: `Eres un asistente de ventas para REGO-FIX. 
            TAREA: Resume el dictado de forma técnica.
            REGLA DE ORO: NO inventes seguimientos. SOLO incluye próximos pasos SI el usuario los menciona (ej. "llamar el martes", "enviar muestras").
            ETAPAS: Calificación, Necesita Análisis, Propuesta, Negociación, Cerrado Ganado, Cerrado Perdido, MANTENER.
            Formato JSON: {"draft": "resumen aquí", "etapa": "etapa aquí"}` 
          },
          { role: "user", content: `Cliente: ${nombreCliente}. Dictado: ${textoDictado}` }],
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

        const result = await conn.query(`SELECT Id, (SELECT Id FROM Opportunities WHERE IsClosed = false ORDER BY CreatedDate DESC LIMIT 1) FROM Account WHERE Name LIKE '%${nombreCliente}%' LIMIT 1`);
        
        if (!result.records[0] || !result.records[0].Opportunities) return res.status(404).json({ error: "No hay oportunidad abierta" });
        const oppId = result.records[0].Opportunities.records[0].Id;

        const tasks = [conn.sobject("Task").create({ 
            WhatId: oppId, 
            Subject: `Seguimiento Cotización - ${new Date().toLocaleDateString('es-MX')}`, 
            Description: resumenAprobado, 
            Status: 'Completed' 
        })];
        
        if (etapaDetectada && etapaDetectada !== "MANTENER") {
            tasks.push(conn.sobject("Opportunity").update({ Id: oppId, StageName: etapaDetectada }));
            
            // Sincronizar con Quote si es cierre
            if (etapaDetectada.includes("Cerrado")) {
                const quote = await conn.sobject("Quote").find({ OpportunityId: oppId }).limit(1);
                if (quote.length > 0) {
                    const qStat = etapaDetectada === "Cerrado Ganado" ? "Aceptado" : "Denegado";
                    tasks.push(conn.sobject("Quote").update({ Id: quote[0].Id, Status: qStat }));
                }
            }
        }

        await Promise.all(tasks);
        return res.status(200).json({ success: true, message: "Actualizado con éxito." });
    }
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
