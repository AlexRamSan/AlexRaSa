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

    // Traemos lo que necesitas: Cuenta, Oportunidad y Fecha de modificación
    const result = await conn.query(`
      SELECT Id, Name, LastModifiedDate, Account.Name 
      FROM Opportunity 
      WHERE IsClosed = false 
      ORDER BY LastModifiedDate ASC 
      LIMIT 20
    `);

    const oportunidades = result.records.map(opp => {
      const dias = Math.floor((new Date() - new Date(opp.LastModifiedDate)) / (1000 * 60 * 60 * 24));
      
      return {
        // Esta etiqueta es la que verás en la lista
        label: `${opp.Account.Name} | ${opp.Name} (${dias} días)`,
        cliente: opp.Account.Name,
        id: opp.Id,
        link: `https://rego-fix.lightning.force.com/lightning/r/Opportunity/${opp.Id}/view`
      };
    });

    return res.status(200).json({ oportunidades });

  } catch (e) {
    return res.status(200).json({ error: e.message });
  }
}
