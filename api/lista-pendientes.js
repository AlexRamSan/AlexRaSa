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

    // Sacamos las ventas abiertas
    const result = await conn.query(`SELECT Id, Account.Name, Name FROM Opportunity WHERE IsClosed = false LIMIT 10`);
    
    // Mandamos el JSON crudo, la IA se encargará de entenderlo
    return res.status(200).json({ oportunidades: result.records });
  } catch (e) {
    return res.status(200).json({ error: e.message });
  }
}
