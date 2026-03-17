import jsforce from 'jsforce';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const { method, query, body } = req;

  try {
    // 1. Autenticación con Salesforce (REGO-FIX)
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

    // --- LÓGICA 1: AGENDAR SEGUIMIENTO RÁPIDO ---
    if (query.accion === 'seguimiento_rapido') {
      let data = body;
      if (typeof data === 'string') data = JSON.parse(data);
      
      const { idOpp, nombreOpp } = data;

      // Calculamos 3 días a partir de hoy a las 10:00 AM (GMT-6 para Querétaro)
      const fechaSeg = new Date();
      fechaSeg.setDate(fechaSeg.getDate() + 3);
      fechaSeg.setUTCHours(10 + 6, 0, 0, 0); 

      // Opcional: Crear el registro en Salesforce para que quede el historial
      await conn.sobject("Event").create({
        WhatId: idOpp,
        Subject: `📞 Seguimiento: ${nombreOpp}`,
        StartDateTime: fechaSeg.toISOString(),
        DurationInMinutes: 20,
        Description: "Evento generado automáticamente desde el Atajo en la Jeep Renegade."
      });

      // RESPUESTA CRUCIAL PARA EL IPHONE
      return res.status(200).json({ 
        success: true, 
        fechaISO: fechaSeg.toISOString(),
        titulo: `📞 Seg. ${nombreOpp || 'Cliente'}` 
      });
    }

    // --- LÓGICA 2: OBTENER LISTA DE OPORTUNIDADES ---
    const result = await conn.query(`
      SELECT Id, Name, Amount, StageName, LastModifiedDate, Account.Name 
      FROM Opportunity 
      WHERE IsClosed = false 
      ORDER BY LastModifiedDate ASC 
      LIMIT 10
    `);

    const oportunidades = result.records.map(opp => ({
      label: `${opp.Account.Name} ($${opp.Amount || 0}) - ${opp.StageName}`,
      id: opp.Id,
      cliente: opp.Account.Name,
      link: `https://rego-fix.lightning.force.com/lightning/r/Opportunity/${opp.Id}/view`
    }));

    return res.status(200).json({ success: true, oportunidades });

  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, error: e.message });
  }
}
