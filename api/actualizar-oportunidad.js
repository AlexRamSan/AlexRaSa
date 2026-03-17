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

    if (textoDictado && !resumenAprobado) {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [{ 
            role: "system", 
            content: 'Eres experto en REGO-FIX. Resume el dictado y detecta etapa: Calificación, Necesita Análisis, Propuesta, Negociación, Cerrado Ganado, Cerrado Perdido. JSON: {"draft":"...","etapa":"..."}' 
          }, { role: "user", content: `Dictado: ${textoDictado}` }],
          response_format: { type: "json_object" }
        });
        return res.status(200).json(JSON.parse(completion.choices[0].message.content));
    }

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
        if (result.records.length === 0) return res.status(200).json({ success: false, message: "No se halló oportunidad." });
        
        const opp = result.records[0];
        const mapeo = { "Calificación": "Qualification", "Necesita Análisis": "Needs Analysis", "Propuesta": "Proposal", "Negociación": "Negotiation", "Cerrado Ganado": "Closed Won", "Cerrado Perdido": "Closed Lost" };
        const sfStage = mapeo[etapaDetectada] || etapaDetectada;
        
        let dias = 0;
        if (etapaDetectada === "Negociación") dias = 1;
        else if (etapaDetectada === "Propuesta" || etapaDetectada === "Necesita Análisis") dias = 3;
        else if (etapaDetectada === "Calificación") dias = 5;

        const updates = [];

        // 1. Actualizar Etapa y Probabilidad
        updates.push(conn.sobject("Opportunity").update({ 
            Id: opp.Id, 
            StageName: sfStage,
            Probability: sfStage === "Closed Won" ? 100 : (sfStage === "Closed Lost" ? 0 : undefined)
        }));

        // 2. CREAR EVENTO EN EL CALENDARIO DE SALESFORCE (Sincronización manual automática)
        if (dias > 0) {
            const fechaSujeto = new Date();
            fechaSujeto.setDate(fechaSujeto.getDate() + dias);
            fechaSujeto.setHours(10, 0, 0); // 10:00 AM

            updates.push(conn.sobject("Event").create({
                WhatId: opp.Id,
                Subject: `Seguimiento: ${opp.Name}`,
                StartDateTime: fechaSujeto.toISOString(),
                DurationInMinutes: 30,
                Description: `Agendado vía iPhone.\nResumen: ${resumenAprobado}`
            }));
        }

        await Promise.all(updates);

        return res.status(200).json({ 
            success: true, 
            message: `Salesforce actualizado (Calendario incluido).`,
            diasParaSeguimiento: dias,
            tituloEvento: `📞 Seg. REGO-FIX: ${opp.Name}`,
            notasEvento: `Resumen: ${resumenAprobado}\n\n🔗 Abrir: https://rego-fix.lightning.force.com/lightning/r/Opportunity/${opp.Id}/view`
        });
    }
  } catch (e) {
    return res.status(200).json({ success: false, message: `Error: ${e.message}` });
  }
}
