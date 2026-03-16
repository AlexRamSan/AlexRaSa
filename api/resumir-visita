import jsforce from 'jsforce';
import { OpenAI } from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { textoVisita, nombreCliente } = req.body;

  try {
    // 1. Procesamiento con IA especializado en REGO-FIX
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { 
          role: "system", 
          content: "Eres un consultor técnico senior de REGO-FIX. Resume reportes de visitas enfocándote en sistemas de sujeción (powRgrip, ER, SecuRgrip). Identifica problemas de runout, vibración o vida útil y cómo REGO-FIX los resuelve. Estructura en: Diagnóstico, Propuesta Técnica y Compromisos." 
        },
        { role: "user", content: `Cliente: ${nombreCliente}. Reporte: ${textoVisita}` }
      ],
    });

    const resumenIA = completion.choices[0].message.content;

    // 2. Conexión a Salesforce
    const conn = new jsforce.Connection({ loginUrl: 'https://login.salesforce.com' });
    await conn.login(process.env.SF_USERNAME, process.env.SF_PASSWORD + process.env.SF_TOKEN);

    // 3. Insertar la nota en Salesforce
    // Buscamos la cuenta por nombre
    const account = await conn.sobject("Account").find({ Name: { $like: `%${nombreCliente}%` } }).limit(1);
    
    if (account.length > 0) {
      await conn.sobject("ContentNote").create({
        Title: `Visita REGO-FIX - ${new Date().toLocaleDateString()}`,
        Content: Buffer.from(resumenIA).toString('base64') // Salesforce requiere base64 para notas
      }).then(async (note) => {
        // Vinculamos la nota con la cuenta
        await conn.sobject("ContentDocumentLink").create({
          LinkedEntityId: account[0].Id,
          ContentDocumentId: note.id,
          ShareType: 'V'
        });
      });

      res.status(200).json({ success: true, message: "Nota guardada en Salesforce" });
    } else {
      res.status(404).json({ error: "Cliente no encontrado" });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}
