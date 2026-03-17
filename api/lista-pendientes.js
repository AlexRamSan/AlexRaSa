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

    // Traemos las 5 oportunidades abiertas con más tiempo sin tocarse
    const result = await conn.query(`
        SELECT Id, Name, Amount, StageName, LastModifiedDate, Account.Name, CloseDate 
        FROM Opportunity 
        WHERE IsClosed = false 
        ORDER BY LastModifiedDate ASC 
        LIMIT 5
    `);

    const oportunidades = result.records.map(opp => {
        const diasInactiva = Math.floor((new Date() - new Date(opp.LastModifiedDate)) / (1000 * 60 * 60 * 24));
        
        // Lógica Pro: Sugerencia inteligente
        let sugerencia = "Podrías llamar para dar seguimiento.";
        if (diasInactiva > 7) sugerencia = "Esta cuenta está muy fría. Te sugiero agendar una visita presencial urgente.";
        if (opp.StageName === "Proposal" && diasInactiva > 3) sugerencia = "Ya enviamos propuesta y no han respondido. Llama para confirmar recepción técnica.";

        return {
            resumenVoz: `Oportunidad de ${opp.Account.Name} por ${opp.Amount || 'monto no definido'}. Etapa: ${opp.StageName}. Lleva ${diasInactiva} días sin movimiento. ${sugerencia}`,
            id: opp.Id,
            cliente: opp.Account.Name,
            link: `https://rego-fix.lightning.force.com/lightning/r/Opportunity/${opp.Id}/view`
        };
    });

    return res.status(200).json({ success: true, oportunidades });
  } catch (e) {
    return res.status(200).json({ success: false, error: e.message });
  }
}
