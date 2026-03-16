import jsforce from 'jsforce';
import OpenAI from 'openai';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) {} }

  const { textoVisita, nombreCliente, resumenAprobado } = body;

  if (!nombreCliente) return res.status(400).json({ error: 'Falta el cliente.' });

  try {
    // ====================================================================
    // FASE 1: CREAR EL BORRADOR (La IA le da formato, no guarda nada aún)
    // ====================================================================
    if (textoVisita && !resumenAprobado) {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        const completion = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages: [
            {
              role: "system",
              content: `Eres un asistente técnico de transcripción para un consultor de manufactura y CNC. Tu ÚNICA tarea es estructurar las notas dictadas de forma profesional con viñetas cortas.
              REGLAS ESTRICTAS:
              1. NO agregues saludos, introducciones, ni frases como "Aquí tienes el reporte".
              2. NO agregues firmas al final.
              3. NO inventes ningún dato, número o acuerdo que no esté en el texto original.
              4. Usa un tono directo y técnico.
              Estructura: Diagnóstico, Solución/Pruebas, Acuerdos/Próximos Pasos.`
            },
            { role: "user", content: `Cliente: ${nombreCliente}. Notas: ${textoVisita}` }
          ],
        });
        
        // Devolvemos el borrador al iPhone para revisión
        return res.status(200).json({ success: true, draft: completion.choices[0].message.content });
    }

    // ====================================================================
    // FASE 2: GUARDAR EN SALESFORCE (Con el texto revisado y aprobado)
    // ====================================================================
    if (resumenAprobado) {
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
        if (!authData.access_token) return res.status(401).json({ error: "Fallo Auth", detalle: authData });

        const conn = new jsforce.Connection({
          instanceUrl: authData.instance_url,
          accessToken: authData.access_token
        });

        // Búsqueda Inteligente del Cliente
        let nombreLimpio = nombreCliente.trim();
        let accountResult = await conn.sobject("Account").find({ Name: { $like: `%${nombreLimpio}%` } }).limit(1);

        if (accountResult.length === 0) {
            const palabras = nombreLimpio.split(' ').filter(p => p.length > 3 && !['grupo', 'industrias', 'mexico', 'mx', 'corporativo', 'de', 'la', 'cv', 'sa'].includes(p.toLowerCase()));
            if (palabras.length > 0) {
                accountResult = await conn.sobject("Account").find({ Name: { $like: `%${palabras[0]}%` } }).limit(1);
            }
        }

        if (accountResult.length === 0) return res.status(404).json({ error: `No encontré ningún cliente parecido a '${nombreCliente}'.` });

        const accountId = accountResult[0].Id;
        const nombreOficial = accountResult[0].Name;

        // Crear la Actividad en Salesforce
        await conn.sobject("Task").create({
          WhatId: accountId,
          Subject: `Visita Técnica IA - ${new Date().toLocaleDateString('es-MX')} (${nombreOficial})`,
          Description: resumenAprobado, // ¡Se guarda exactamente lo que tú modificaste!
          Status: 'Completed',
          Priority: 'Normal'
        });

        return res.status(200).json({ success: true, message: `Reporte guardado en: ${nombreOficial}` });
    }

    return res.status(400).json({ error: 'Faltan datos en la petición.' });
  } catch (error) {
    return res.status(500).json({ error: "Error interno", detalle: error.message });
  }
}
