import jsforce from 'jsforce';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  
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

    // Consultamos las oportunidades abiertas de REGO-FIX
    const result = await conn.query(`
      SELECT Id, Name, LastModifiedDate, Account.Name 
      FROM Opportunity 
      WHERE IsClosed = false 
      ORDER BY LastModifiedDate ASC 
      LIMIT 20
    `);

    const oportunidades = result.records.map(opp => {
      // Cálculo de días de inactividad
      const fechaMod = new Date(opp.LastModifiedDate);
      const hoy = new Date();
      const diferencia = hoy - fechaMod;
      const diasInactiva = Math.floor(diferencia / (1000 * 60 * 60 * 24));

      return {
        // Esto es lo que verás en la lista del iPhone
        label: `${opp.Account.Name} | ${opp.Name} (${diasInactiva} días)`,
        cliente: opp.Account.Name,
        id: opp.Id,
        link: `https://rego-fix.lightning.force.com/lightning/r/Opportunity/${opp.Id}/view`
      };
    });

    // IMPORTANTE: Devolvemos un objeto que contiene el ARRAY "oportunidades"
    return res.status(200).json({ oportunidades });

  } catch (e) {
    return res.status(200).json({ error: e.message });
  }
}
