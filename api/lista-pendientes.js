import jsforce from 'jsforce';
import OpenAI from 'openai';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const { method, query, body } = req;

  try {
    // --- AUTENTICACIÓN ---
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

    // --- ACCIÓN: OBTENER LISTA (GET) ---
    if (method === 'GET') {
      const result = await conn.query(`SELECT Id, Name, Account.Name, StageName FROM Opportunity WHERE IsClosed = false ORDER BY LastModifiedDate ASC LIMIT 10`);
      const oportunidades = result.records.map(opp => ({
        label: `${opp.Account.Name} - ${opp.StageName}`,
        cliente: opp.Account.Name,
        id: opp.Id,
        link: `https://rego-fix.lightning.force.com/lightning/r/Opportunity/${opp.Id}/view`
      }));
      return res.status(200).json({ oportunidades });
    }

    // --- ACCIÓN: PROCESAR ACCIONES (POST) ---
    const data = typeof body === 'string' ? JSON.parse(body) : body;
    const { textoDictado, idOpp, nombreCliente, etapaDetectada, soloAgendar, resumenAprobado } = data;

    // A. Analizar Dictado con OpenAI
    if (textoDictado && !resumenAprobado) {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ 
          role: "system", 
          content: 'Eres experto en REGO-FIX. Resume el dictado y detecta etapa: Calificación, Necesita Análisis, Propuesta, Negociación, Cerrado Ganado. JSON: {"draft":"...","etapa":"..."}' 
        }, { role: "user", content: `Dictado: ${textoDictado}` }],
        response_format: { type: "json_object" }
      });
      return res.status(200).json(JSON.parse(completion.choices[0].message.content));
    }

    // B. Lógica de Agenda Inteligente (Huecos libres)
    if (soloAgendar || resumenAprobado) {
      const mapeo = { "Negociación": 1, "Propuesta": 3, "Necesita Análisis": 3, "Calificación": 5 };
      let dias = soloAgendar ? 3 : (mapeo[etapaDetectada] || 3);

      const fechaBase = new Date();
      fechaBase.setDate(fechaBase.getDate() + dias);
      const startOfDay = `${fechaBase.toISOString().split('T')[0]}T00:00:00Z`;
      const endOfDay = `${fechaBase.toISOString().split('T')[0]}T23:59:59Z`;

      // Revisar eventos en Salesforce
      const eventos = await conn.query(`SELECT StartDateTime FROM Event WHERE StartDateTime >= ${startOfDay} AND StartDateTime <= ${endOfDay} ORDER BY StartDateTime ASC`);
      
      let horaIntento = 10; 
      let minutoIntento = 0;
      let horaFinalISO = "";
      let huecoEncontrado = false;

      while (!huecoEncontrado) {
        let checkTime = new Date(fechaBase);
        checkTime.setUTCHours(horaIntento + 6, minutoIntento, 0, 0); // +6 para CDMX
        const ocupado = eventos.records.some(e => Math.abs(new Date(e.StartDateTime).getTime() - checkTime.getTime()) < 25 * 60000);

        if (!ocupado) {
          horaFinalISO = checkTime.toISOString();
          huecoEncontrado = true;
        } else {
          minutoIntento += 30;
          if (minutoIntento >= 60) { horaIntento++; minutoIntento = 0; }
        }
      }

      await conn.sobject("Event").create({
        WhatId: idOpp,
        Subject: `📞 Seg. REGO-FIX: ${nombreCliente}`,
        StartDateTime: horaFinalISO,
        DurationInMinutes: 30,
        Description: resumenAprobado || "Seguimiento rápido"
      });

      return res.status(200).json({ 
        success: true, 
        fechaISO: horaFinalISO, 
        titulo: `📞 Seg. ${nombreCliente}`,
        notas: resumenAprobado || ""
      });
    }

  } catch (e) {
    return res.status(200).json({ success: false, error: e.message });
  }
}
