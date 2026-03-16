import jsforce from 'jsforce';
import { OpenAI } from 'openai';

export default async function handler(req, res) {
  // 1. Bloque de Seguridad y Parseo de datos
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Usa POST.' });
  }

  // Traductor automático: Si el iPhone manda texto plano o formulario, lo convertimos a objeto
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch (e) {
      // Si no es JSON, intentamos procesarlo como datos de formulario
      console.log("Los datos no llegaron como JSON, procesando como string...");
    }
  }

  const { textoVisita, nombreCliente } = body;

  // 2. Validación con respuesta de diagnóstico
  if (!textoVisita || !nombreCliente) {
    return res.status(400).json({ 
      error: 'Faltan datos: textoVisita o nombreCliente.',
      recibido: body 
    });
  }

  try {
    // 3. Configuración de OpenAI (Especialista REGO-FIX)
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-4", 
      messages: [
        { 
          role: "system", 
          content: "Eres un consultor técnico senior de REGO-FIX. Resume visitas técnicas de venta de sistemas de sujeción. Estructura el resumen en: 1. Diagnóstico Técnico, 2. Solución REGO-FIX (powRgrip, ER, SecuRgrip), 3. Compromisos comerciales. Tono profesional y conciso." 
        },
        { role: "user", content: `Cliente: ${nombreCliente}. Reporte dictado: ${textoVisita}` }
      ],
    });

    const resumenIA = completion.choices[0].message.content;

    // 4. Conexión a Salesforce (OAuth2)
    const conn = new jsforce.Connection({
      oauth2: {
        clientId: process.env.SF_CLIENT_ID,
        clientSecret: process.env.SF_CLIENT_SECRET,
        redirectUri: 'https://localhost:3000'
      },
      loginUrl: 'https://login.salesforce.com'
    });

    await conn.login(
      process.env.SF_USERNAME, 
      process.env.SF_PASSWORD + process.env.SF_TOKEN
    );

    // 5. Buscar la Cuenta en Salesforce
    const account = await conn.sobject("Account")
      .find({ Name: { $like: `%${nombreCliente}%` } })
      .limit(1);
    
    if (account.length === 0) {
      return res.status(404).json({ error: `Cliente '${nombreCliente}' no encontrado.` });
    }

    // 6. Crear la Nota (Método compatible con todas las versiones de SF)
    await conn.sobject("Note").create({
      ParentId: account[0].Id,
      Title: `Resumen REGO-FIX - ${new Date().toLocaleDateString()}`,
      Body: resumenIA,
      IsPrivate: false
    });

    return res.status(200).json({ 
      success: true, 
      message: "¡Logrado! Reporte en Salesforce.",
      resumen: resumenIA 
    });

  } catch (error) {
    console.error("Error:", error);
    return res.status(500).json({ 
      error: "Error en el servidor", 
      detalle: error.message 
    });
  }
}
