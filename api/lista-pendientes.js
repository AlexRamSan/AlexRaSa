import jsforce from 'jsforce';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  const { query, body } = req;

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

    if (query.accion === 'seguimiento_rapido') {
      const data = typeof body === 'string' ? JSON.parse(body) : body;
      const idOpp = data.idOpp || '';
      const nombreOpp = data.nombreOpp || 'Cliente';

      const fechaSeg = new Date();
      fechaSeg.setDate(fechaSeg.getDate() + 3);
      fechaSeg.setUTCHours(10 + 6, 0, 0, 0); // 10:00 AM CDMX

      // Solo creamos el evento en Salesforce, el Atajo hará el resto
      await conn.sobject("Event").create({
        WhatId: idOpp,
        Subject: `Seguimiento: ${nombreOpp}`,
        StartDateTime: fechaSeg.toISOString(),
        DurationInMinutes: 20
      });

      return res.status(200).json({ 
        success: true, 
        fechaISO: fechaSeg.toISOString() 
      });
    }

    const result = await conn.query(`SELECT Id, Name, Account.Name FROM Opportunity WHERE IsClosed = false LIMIT 10`);
    const oportunidades = result.records.map(opp => ({
      label: `${opp.Account.Name} - ${opp.Name}`,
      id: opp.Id,
      cliente: opp.Account.Name,
      link: `https://rego-fix.lightning.force.com/lightning/r/Opportunity/${opp.Id}/view`
    }));

    return res.status(200).json({ success: true, oportunidades });

  } catch (e) {
    return res.status(200).json({ success: false, error: e.message });
  }
}
