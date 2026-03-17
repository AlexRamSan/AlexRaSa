import jsforce from 'jsforce';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const { method, query, body } = req;

  try {
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

    // ACCIÓN: SEGUIMIENTO RÁPIDO (Se activa tras la llamada)
    if (query.accion === 'seguimiento_rapido' && method === 'POST') {
      let data = body;
      if (typeof data === 'string') data = JSON.parse(data);
      
      const { idOpp, nombreOpp } = data;

      // Calculamos 3 días a las 10:00 AM (GMT-6)
      const fechaSeg = new Date();
      fechaSeg.setDate(fechaSeg.getDate() + 3);
      fechaSeg.setUTCHours(10 + 6, 0, 0, 0); 

      await conn.sobject("Event").create({
        WhatId: idOpp,
        Subject: `📞 Seguimiento: ${nombreOpp}`,
        StartDateTime: fechaSeg.toISOString(),
        DurationInMinutes: 20,
        Description: "Seguimiento automático creado después de realizar llamada desde el iPhone."
      });

      return res.status(200).json({ 
        success: true, 
        fechaISO: fechaSeg.toISOString(),
        titulo: `📞 Seg. ${nombreOpp}`
      });
    }

    // ACCIÓN: OBTENER LISTA (Por defecto)
    const result = await conn.query(`
      SELECT Id, Name, Amount, StageName, LastModifiedDate, Account.Name, Account.Phone 
      FROM Opportunity 
      WHERE IsClosed = false 
      ORDER BY LastModifiedDate ASC 
      LIMIT 10
    `);

    const oportunidades = result.records.map(opp => ({
      label: `${opp.Account.Name} ($${opp.Amount || 0}) - ${opp.StageName}`,
      id: opp.Id,
      cliente: opp.Account.Name,
      telefono: opp.Account.Phone || "",
      link: `https://rego-fix.lightning.force.com/lightning/r/Opportunity/${opp.Id}/view`
    }));

    return res.status(200).json({ success: true, oportunidades });

  } catch (e) {
    return res.status(500).json({ success: false, error: e.message });
  }
}
