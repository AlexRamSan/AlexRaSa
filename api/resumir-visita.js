import jsforce from 'jsforce';
import { OpenAI } from 'openai';

export default async function handler(req, res) {
  // 1. Bloque de Seguridad: Solo permitir POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Usa POST desde el Atajo de iPhone.' });
  }

  const { textoVisita, nombreCliente } = req.body;

  // 2. Validación de datos recibidos
  if (!textoVisita || !nombreCliente) {
    return res.status(400).json({ error: 'Faltan datos: textoVisita o nombreCliente.' });
  }

  try {
    // 3. Configuración de OpenAI (Especialista en REGO-FIX)
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-4", 
      messages: [
        { 
          role: "system", 
          content: "Eres un consultor técnico senior de REGO-FIX. Tu objetivo es resumir visitas técnicas de venta de sistemas de sujeción (powRgrip, ER, SecuRgrip). Estructura el resumen en: 1. Situación Actual (máquinas/problemas), 2. Solución REGO-FIX propuesta, 3. Próximos pasos. Usa un tono profesional y técnico." 
        },
        { role: "user", content: `Cliente: ${nombreCliente}. Reporte dictado: ${textoVisita}` }
      ],
    });

    const resumenIA = completion.choices[0].message.content;

    // 4. Conexión Segura a Salesforce (OAuth2)
    const conn = new jsforce.Connection({
      oauth2: {
        clientId: process.env.SF_CLIENT_ID,
        clientSecret: process.env.SF_CLIENT_SECRET,
        redirectUri: 'https://localhost:3000'
      },
      loginUrl: 'https://login.salesforce.com'
    });

    // Login usando Usuario + (Password + Token)
    await conn.login(
      process.env.SF_USERNAME, 
      process.env.SF_PASSWORD + process.env.SF_TOKEN
    );

    // 5. Buscar la Cuenta del cliente en Salesforce
    const account = await conn.sobject("Account")
      .find({ Name: { $like: `%${nombreCliente}%` } })
      .limit(1);
    
    if (account.length === 0) {
      return res.status(404).json({ error: `No se encontró el cliente '${nombreCliente}' en Salesforce.` });
    }

    // 6. Crear la Nota en la Cuenta encontrada
    await conn.sobject("Note").create({
      ParentId: account[0].Id,
      Title: `Resumen Visita REGO-FIX - ${new Date().toLocaleDateString()}`,
      Body: resumenIA,
      IsPrivate: false
    });

    // 7. Respuesta Exitosa
    return res.status(200).json({ 
      success: true, 
      message: "Reporte guardado en Salesforce",
      resumen: resumenIA 
    });

  } catch (error) {
    console.error("Error detallado:", error);
    return res.status(500).json({ 
      error: "Error en el proceso", 
      detalle: error.message 
    });
  }
}
