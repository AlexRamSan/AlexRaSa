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

    // Traemos Oportunidades, Cuentas y Cotizaciones sincronizadas
    const result = await conn.query(`
      SELECT Id, Name, LastModifiedDate, Account.Name, 
             (SELECT QuoteNumber FROM Quotes WHERE IsSyncing = true LIMIT 1)
      FROM Opportunity 
      WHERE IsClosed = false 
      ORDER BY LastModifiedDate ASC 
      LIMIT 15
    `);

    // Creamos la lista de "Etiquetas" (lo que verás en el iPhone)
    const listaParaMostrar = result.records.map(opp => {
      const dias = Math.floor((new Date() - new Date(opp.LastModifiedDate)) / (1000 * 60 * 60 * 24));
      const cot = opp.Quotes?.records[0]?.QuoteNumber || "Sin Cot.";
      return `${opp.Account.Name} | ${opp.Name} | ${dias}d | Q:${cot}`;
    });

    // Creamos un diccionario con la info real para usarla después
    const infoDetallada = {};
    result.records.forEach(opp => {
      const etiqueta = `${opp.Account.Name} | ${opp.Name} | ${Math.floor((new Date() - new Date(opp.LastModifiedDate)) / (1000 * 60 * 60 * 24))}d | Q:${opp.Quotes?.records[0]?.QuoteNumber || "Sin Cot."}`;
      infoDetallada[etiqueta] = {
        id: opp.Id,
        cliente: opp.Account.Name,
        link: `https://rego-fix.lightning.force.com/lightning/r/Opportunity/${opp.Id}/view`
      };
    });

    return res.status(200).json({ 
      opciones: listaParaMostrar, // Esta es la lista que verá el iPhone
      detalles: infoDetallada     // Esta es la info técnica
    });
  } catch (e) {
    return res.status(200).json({ error: e.message });
  }
}
