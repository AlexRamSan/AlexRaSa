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

    // FASE 1: ANALIZAR DICTADO (Prioridad absoluta al usuario)
    if (textoDictado && !resumenAprobado) {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ 
            role: "system", 
            content: `Eres un transcriptor técnico para REGO-FIX. 
            REGLAS DE ORO:
            1. Si el usuario menciona una etapa (ej. "Cerrado Ganado", "Negociación"), USA ESA ETAPA obligatoriamente.
            2. NO inventes seguimientos, visitas ni propuestas si el usuario dice que el proceso ya terminó o se aceptó.
            3. Si el usuario dice que se aceptó la propuesta, la etapa DEBE SER "Cerrado Ganado".
            4. Resumen: Máximo 3 viñetas cortas de lo que el usuario DIJO.
            Etapas válidas: Calificación, Necesita Análisis, Propuesta, Negociación, Cerrado Ganado, Cerrado Perdido.
            Responde SOLO en JSON: {"draft": "resumen", "etapa": "Etapa Exacta"}` 
          },
          { role: "user", content: `Cliente: ${nombreCliente}. Dictado: ${textoDictado}` }],
          response_format: { type: "json_object" }
        });
        return res.status(200).json(JSON.parse(completion.choices[0].message.content));
    }

    // FASE 2: GUARDAR EN SALESFORCE (Mapeo técnico Bilingüe)
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

        // Buscamos la Oportunidad y la Cotización sincronizada
        const result = await conn.query(`SELECT Id, Name, (SELECT Id FROM Quotes WHERE IsSyncing = true LIMIT 1) 
                       FROM Opportunity 
                       WHERE Account.Name LIKE '%${nombreCliente.trim()}%' AND IsClosed = false 
                       ORDER BY CreatedDate DESC LIMIT 1`);
        
        if (result.records.length === 0) return res.status(200).json({ success: false, message: "No se halló oportunidad abierta." });
        
        const opp = result.records[0];
        const updates = [];

        // 1. Tarea
        updates.push(conn.sobject("Task").create({ WhatId: opp.Id, Subject: `Seguimiento - ${new Date().toLocaleDateString()}`, Description: resumenAprobado, Status: 'Completed' }));

        // 2. Mapeo de nombres API (Basado en tus imágenes)
        if (etapaDetectada && etapaDetectada !== "MANTENER") {
            const mapeo = {
                "Calificación": "Qualification",
                "Necesita Análisis": "Needs Analysis",
                "Propuesta": "Proposal",
                "Negociación": "Negotiation",
                "Cerrado Ganado": "Closed Won",
                "Cerrado Perdido": "Closed Lost"
            };

            const sfStage = mapeo[etapaDetectada] || etapaDetectada;
            let oppUpdate = { Id: opp.Id, StageName: sfStage };

            if (sfStage === "Closed Won") {
                oppUpdate.Probability = 100;
                oppUpdate.ForecastCategoryName = "Closed";
            } else if (sfStage === "Closed Lost") {
                oppUpdate.Probability = 0;
            }

            updates.push(conn.sobject("Opportunity").update(oppUpdate));

            // 3. ACTUALIZAR COTIZACIÓN (Forzado con nombres API: Accepted/Denied)
            if (opp.Quotes && opp.Quotes.records.length > 0) {
                const quoteId = opp.Quotes.records[0].Id;
                let qStatus = (sfStage === "Closed Won") ? "Accepted" : (sfStage === "Closed Lost" ? "Denied" : null);
                if (qStatus) updates.push(conn.sobject("Quote").update({ Id: quoteId, Status: qStatus }));
            }
        }

        await Promise.all(updates);
        return res.status(200).json({ success: true, message: `Éxito: ${opp.Name} actualizado a ${etapaDetectada}` });
    }
  } catch (e) {
    return res.status(200).json({ success: false, message: `Error: ${e.message}` });
  }
}
