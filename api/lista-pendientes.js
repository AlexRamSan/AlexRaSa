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

    const result = await conn.query(`
        SELECT Id, Name, Amount, StageName, LastModifiedDate, Account.Name, Account.Phone 
        FROM Opportunity 
        WHERE IsClosed = false 
        ORDER BY LastModifiedDate ASC 
        LIMIT 10
    `);

    const oportunidades = result.records.map(opp => {
        const diasInactiva = Math.floor((new Date() - new Date(opp.LastModifiedDate)) / (1000 * 60 * 60 * 24));
        
        return {
            label: `${opp.Account.Name} ($${opp.Amount || 0}) - ${diasInactiva}d sin mov.`,
            id: opp.Id,
            cliente: opp.Account.Name,
            telefono: opp.Account.Phone || "",
            etapa: opp.StageName,
            link: `https://rego-fix.lightning.force.com/lightning/r/Opportunity/${opp.Id}/view`
        };
    });

    return res.status(200).json({ success: true, oportunidades });
  } catch (e) {
    return res.status(200).json({ success: false, error: e.message });
  }
}
