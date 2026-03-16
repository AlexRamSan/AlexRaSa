import jsforce from 'jsforce';
import { OpenAI } from 'openai';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Usa POST' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) {} }
  const { textoVisita, nombreCliente } = body;

  try {
    // 1. Resumen con OpenAI
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-4", 
      messages: [
        { role: "system", content: "Eres un experto en herramientas de corte y sistemas powRgrip y ER. Resume esta visita de manera técnica y profesional." },
        { role: "user", content: `Cliente: ${nombreCliente}. Reporte de visita: ${textoVisita}` }
      ],
    });
    const resumenIA = completion.choices[0].message.content;

    // 2. Autenticación "Modo Dios" (Client Credentials)
    const tokenUrl = 'https://rego-fix.my.salesforce.com/services/oauth2/token';
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', process.env.SF_CLIENT_ID.trim());
    params.append('client_secret', process.env.SF_CLIENT_SECRET.trim());

    const authResponse = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params
    });

    const authData = await authResponse.json();

    if (!authData.access_token) {
      return res.status(401).json({ error: "Fallo Auth Server-to-Server", detalle: authData });
    }

    // 3. Conexión a Salesforce con el Token
    const conn = new jsforce.Connection({
      instanceUrl: authData.instance_url,
      accessToken: authData.access_token
    });

    // 4. Buscar la cuenta y guardar el reporte
    const account = await conn.sobject("Account").find({ Name: { $like: `%${nombreCliente}%` } }).limit(1);
    
    if (account.length === 0) {
        return res.status(404).json({ error: `Cliente '${nombreCliente}' no encontrado en Salesforce.` });
    }

    await conn.sobject("Note").create({
      ParentId: account[0].Id,
      Title: `Visita Técnica - ${new Date().toLocaleDateString()}`,
      Body: resumenIA
    });

    // ¡ÉXITO!
    return res.status(200).json({ success: true, message: "¡REPORTADO EN SALESFORCE!" });

  } catch (error) {
    return res.status(500).json({ error: "Error interno", detalle: error.message });
  }
}
