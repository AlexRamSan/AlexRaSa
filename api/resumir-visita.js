import jsforce from 'jsforce';
import OpenAI from 'openai';

export default async function handler(req, res) {
  // Asegurarnos de que el iPhone manda un POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Solo se permite el método POST' });
  }

  // Parsear el texto que llega del Atajo de iOS
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) {}
  }

  const { textoVisita, nombreCliente } = body;

  if (!textoVisita || !nombreCliente) {
     return res.status(400).json({ error: 'Faltan datos: Asegúrate de dictar el texto y el nombre del cliente.' });
  }

  try {
    // 1. Procesamiento con OpenAI (Mejorando la redacción del dictado)
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "Eres un consultor experto en manufactura, mecanizado CNC, sistemas powRgrip y herramientas de corte. Tu tarea es recibir un dictado crudo de una visita a un cliente y convertirlo en un reporte técnico, profesional, estructurado y directo. Resalta acuerdos, cotizaciones y próximos pasos."
        },
        {
          role: "user",
          content: `Cliente: ${nombreCliente}. Notas crudas de la visita dictadas desde el auto: ${textoVisita}`
        }
      ],
    });
    
    const resumenIA = completion.choices[0].message.content;

    // 2. Autenticación a Salesforce ("Modo Dios" sin contraseñas)
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
      return res.status(401).json({ error: "Fallo de Autenticación Server-to-Server", detalle: authData });
    }

    // 3. Conexión a Salesforce con la llave maestra
    const conn = new jsforce.Connection({
      instanceUrl: authData.instance_url,
      accessToken: authData.access_token
    });

    // 4. Buscar la cuenta del cliente en la base de datos
    const accountResult = await conn.sobject("Account")
                                    .find({ Name: { $like: `%${nombreCliente}%` } })
                                    .limit(1);

    if (accountResult.length === 0) {
        return res.status(404).json({ error: `No se encontró al cliente '${nombreCliente}' en tu Salesforce.` });
    }

    const accountId = accountResult[0].Id;

    // 5. Crear el reporte como una Tarea Completada (Para que salga en el Historial de Actividad)
    await conn.sobject("Task").create({
      WhatId: accountId,
      Subject: `Visita Técnica IA - ${new Date().toLocaleDateString('es-MX')}`,
      Description: resumenIA,
      Status: 'Completed',
      Priority: 'Normal'
    });

    // ¡ÉXITO! Se le responde al iPhone
    return res.status(200).json({ success: true, message: "¡Reporte guardado exitosamente en el historial del cliente!" });

  } catch (error) {
    console.error("Error en la ejecución:", error);
    return res.status(500).json({ error: "Error interno del servidor", detalle: error.message });
  }
}
