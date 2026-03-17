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
            content: 'Eres experto en REGO-FIX. Resume el dictado y detecta etapa: Calificación, Necesita Análisis, Propuesta, Negociación, Cerrado Ganado, Cerrado Perdido. JSON: {"draft":"...","etapa":"..."}' 
          }, { role: "user", content: `Dictado: ${textoDictado}` }],
          response_format: { type: "json_object" }
        });
        return res.status(200).json(JSON.parse(completion.choices[0].message.content));
    }

    // FASE 2: SALESFORCE + AGENDA INTELIGENTE
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
        
        let dias = (etapaDetectada === "Negociación") ? 1 : (etapaDetectada === "Propuesta" || etapaDetectada === "Necesita Análisis" ? 3 : (etapaDetectada === "Calificación" ? 5 : 0));

        const updates = [];
        updates.push(conn.sobject("Opportunity").update({ 
            Id: opp.Id, StageName: sfStage,
            Probability: sfStage === "Closed Won" ? 100 : (sfStage === "Closed Lost" ? 0 : undefined)
        }));

        let horaFinalISO = "";
        let mensajeCalendario = "";

        if (dias > 0) {
            // 1. Calcular el día objetivo
            const fechaBase = new Date();
            fechaBase.setDate(fechaBase.getDate() + dias);
            const yyyy = fechaBase.getFullYear();
            const mm = String(fechaBase.getMonth() + 1).padStart(2, '0');
            const dd = String(fechaBase.getDate()).padStart(2, '0');
            const startOfDay = `${yyyy}-${mm}-${dd}T00:00:00Z`;
            const endOfDay = `${yyyy}-${mm}-${dd}T23:59:59Z`;

            // 2. Revisar eventos existentes en Salesforce para ese día
            const eventos = await conn.query(`SELECT StartDateTime FROM Event WHERE StartDateTime >= ${startOfDay} AND StartDateTime <= ${endOfDay} ORDER BY StartDateTime ASC`);
            
            // 3. Buscar primer hueco libre desde las 10:00 AM (Central Time = +6h para UTC)
            let horaIntento = 10; 
            let minutoIntento = 0;
            let huecoEncontrado = false;

            while (!huecoEncontrado) {
                let checkTime = new Date(fechaBase);
                checkTime.setUTCHours(horaIntento + 6, minutoIntento, 0, 0);
                
                // ¿Hay algo a esta hora? (Margen de 29 min)
                const ocupado = eventos.records.some(e => {
                    const eTime = new Date(e.StartDateTime).getTime();
                    return Math.abs(eTime - checkTime.getTime()) < 25 * 60000;
                });

                if (!ocupado) {
                    horaFinalISO = checkTime.toISOString();
                    huecoEncontrado = true;
                    mensajeCalendario = `Agendado a las ${horaIntento}:${minutoIntento === 0 ? '00' : minutoIntento}`;
                } else {
                    minutoIntento += 30;
                    if (minutoIntento >= 60) { horaIntento++; minutoIntento = 0; }
                }
            }

            updates.push(conn.sobject("Event").create({
                WhatId: opp.Id,
                Subject: `Seguimiento: ${opp.Name}`,
                StartDateTime: horaFinalISO,
                DurationInMinutes: 30,
                Description: `Agendado automáticamente.\nNotas: ${resumenAprobado}`
            }));
        }

        await Promise.all(updates);

        return res.status(200).json({ 
            success: true, 
            message: `Salesforce actualizado. ${mensajeCalendario}`,
            diasParaSeguimiento: dias,
            fechaISO: horaFinalISO, // El Atajo usará esta fecha exacta
            tituloEvento: `📞 Seg. REGO-FIX: ${opp.Name}`,
            notasEvento: `Resumen: ${resumenAprobado}\n\n🔗 Abrir: https://rego-fix.lightning.force.com/lightning/r/Opportunity/${opp.Id}/view`
        });
    }
  } catch (e) {
    return res.status(200).json({ success: false, message: `Error: ${e.message}` });
  }
}
