import { Configuration, OpenAIApi } from "openai";

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método no permitido' });
  }

  try {
    const { salesforceRawData } = req.body; 

    const prompt = `
      Eres un asistente experto en análisis comercial para REGO-FIX México (RFMX).
      Tu tarea es tomar los siguientes datos crudos de Salesforce (actividades, oportunidades, cuentas, métricas)
      y estructurarlos estrictamente en el formato de 7 diapositivas requerido por la gerencia para la junta de ventas.
      
      Datos crudos de Salesforce:
      ${JSON.stringify(salesforceRawData)}

      Por favor, genera un objeto JSON con las siguientes llaves. Sé muy ejecutivo, claro y concreto:
      
      {
        "slide1_portada": { "fecha": "", "region": "Zona Centro-Sur / Bajío" },
        "slide2_resultados": { "budget": "", "facturado": "", "cumplimiento": "", "backorder": "", "forecast": "" },
        "slide3_profit": { "margen_proyectos": "", "descuentos_activos": "", "directo_vs_distribucion": "" },
        "slide4_actividad": { "visitas": "", "nuevas_oportunidades": "", "proyectos_activos": "", "actividades_salesforce": "", "demos_activas": "" },
        "slide5_recuperacion": { "material_campo": "", "recuperacion_pendiente": "", "estatus_demos": "" },
        "slide6_cobranza": { "cartera_vencida": "", "compromisos_pago": "", "clientes_criticos": "" },
        "slide7_plan_accion": { "estrategia": "", "cuentas_prioritarias": "", "acciones_proxima_semana": "", "apoyo_gerencia": "" }
      }
      
      Responde ÚNICAMENTE con el objeto JSON, sin texto introductorio, saludos ni bloques de código markdown (\`\`\`json).
    `;

    const completion = await openai.createChatCompletion({
      model: "gpt-4o",
      messages: [
        { role: "system", content: "Eres un analista de datos comerciales de precisión que devuelve solo JSON estructurado." },
        { role: "user", content: prompt }
      ],
      temperature: 0.1, // Temperatura baja para total fidelidad a tus datos reales
    });

    const reportContent = JSON.parse(completion.data.choices[0].message.content);
    return res.status(200).json(reportContent);

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Error procesando el reporte con OpenAI" });
  }
}
