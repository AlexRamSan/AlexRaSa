import jsforce from 'jsforce';
import OpenAI from 'openai';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) {} }

  const { textoDictado, nombreCliente, resumenAprobado, etapaDetectada } = body;

  if (!nombreCliente) return res.status(400).json({ error: 'Falta el nombre del cliente.' });

  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // FASE 1: ANALIZAR DICTADO
    if (textoDictado && !resumenAprobado) {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `Eres un experto en ventas de REGO-FIX. Analiza el dictado sobre una cotización.
              1. Resume de forma técnica y profesional (sin firmas ni saludos).
              2. Detecta la ETAPA de la oportunidad: "Calificación", "Necesita Análisis", "Propuesta", "Negociación", "Cerrado Ganado", "Cerrado Perdido".
              Si no se menciona cambio, usa "MANTENER".
              Responde en JSON: {"resumen": "...", "etapa": "..."}`
            },
            { role: "user", content: `Cliente: ${nombreCliente}. Dictado: ${textoDictado}` }
          ],
          response_format: { type: "json_object" }
        });

        const result = JSON.parse(completion.choices[0].message.content);
        return res.status(200).json({ success: true, draft: result.resumen, etapa: result.etapa });
    }

    // FASE 2: GUARDAR EN SALESFORCE
    if (resumenAprobado) {
        const tokenUrl = 'https://rego-fix.my.salesforce.com/services/oauth2/token';
        const params = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: process.env.SF_CLIENT_ID.trim(),
            client_secret: process.env.SF_CLIENT_SECRET.trim()
        });

        const authRes = await fetch(tokenUrl, { method: 'POST', body: params });
        const authData = await authRes.json();
        const conn = new jsforce.Connection({ instanceUrl: authData.instance_url, accessToken: authData.access_token });

        // Búsqueda de Cliente
        let account = await conn.sobject("Account").find({ Name: { $like: `%${nombreCliente.trim()}%` } }).limit(1);
        if (account.length === 0) return res.status(404).json({ error: "Cliente no encontrado" });

        // Buscar Oportunidad abierta
        const opp = await conn.sobject("Opportunity")
            .find({ AccountId: account[0].Id, IsClosed: false })
            .sort({ CreatedDate: -1 }).limit(1);

        if (opp.length === 0) return res.status(404).json({ error: "No hay oportunidades abiertas" });

        const oppId = opp[0].Id;
        let logEtapa = "";

        // Actualizar Oportunidad y Cotización vinculada
        if (etapaDetectada && etapaDetectada !== "MANTENER") {
            await conn.sobject("Opportunity").update({ Id: oppId, StageName: etapaDetectada });
            logEtapa = ` | Etapa: ${etapaDetectada}`;

            const quote = await conn.sobject("Quote").find({ OpportunityId: oppId }).limit(1);
            if (quote.length > 0) {
                let quoteStatus = (etapaDetectada === "Cerrado Ganado") ? "Aceptado" : (etapaDetectada === "Cerrado Perdido") ? "Denegado" : null;
                if (quoteStatus) {
                    await conn.sobject("Quote").update({ Id: quote[0].Id, Status: quoteStatus });
                    logEtapa += ` | Cotización: ${quoteStatus}`;
                }
            }
        }

        // Crear Tarea de seguimiento
        await conn.sobject("Task").create({
            WhatId: oppId,
            Subject: `Seguimiento Cotización - ${new Date().toLocaleDateString('es-MX')}`,
            Description: resumenAprobado,
            Status: 'Completed'
        });

        return res.status(200).json({ success: true, message: `Actualizado: ${opp[0].Name}${logEtapa}` });
    }
  } catch (e) { return res.status(500).json({ error: e.message }); }
}
