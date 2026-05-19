import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método no permitido. Usa POST.' });
  }

  try {
    // Recibir los datos comerciales y los metadatos de fechas dinámicas
    const { metadataReporte, salesforceRawData } = req.body; 

    const rangoFechasTexto = `Del ${metadataReporte.fechaInicioFiltro} al ${metadataReporte.fechaFinFiltro}`;

    const prompt = `
      Eres un asistente experto en análisis comercial para REGO-FIX México (RFMX).
      Tu tarea es tomar los siguientes datos comerciales e interpretarlos estrictamente para el periodo de tiempo: ${rangoFechasTexto}.

      DATOS DE ENTRADA:
      ${JSON.stringify(salesforceRawData)}

      Genera un reporte de ventas ejecutivo estructurado exactamente en este formato JSON:
      {
        "slide1_portada": { "fecha": "${rangoFechasTexto}", "region": "Zona Centro-Sur / Bajío" },
        "slide2_resultados": { "budget": "Monto meta", "facturado": "Monto facturado en el periodo", "cumplimiento": "Porcentaje", "backorder": "Monto backorder", "forecast": "Estimado" },
        "slide3_profit": { "margen_proyectos": "Margen promedio", "descuentos_activos": "Descuentos en el periodo", "directo_vs_distribucion": "Proporción analizada" },
        "slide4_actividad": { "visitas": "Detalle de visitas en este rango de fechas", "nuevas_oportunidades": "Oportunidades abiertas", "proyectos_activos": "Proyectos del periodo", "actividades_salesforce": "Tareas hechas", "demos_activas": "Demos corriendo" },
        "slide5_recuperacion": { "material_campo": "Kits prestados", "recuperacion_pendiente": "Pendientes de recolectar", "estatus_demos": "Estatus" },
        "slide6_cobranza": { "cartera_vencida": "Saldos vencidos", "compromisos_pago": "Compromisos acordados", "clientes_criticos": "Cuentas críticas" },
        "slide7_plan_accion": { "estrategia": "Estrategia para cerrar brecha", "cuentas_prioritarias": "Clientes foco", "acciones_proxima_semana": "Agenda futura", "apoyo_gerencia": "Requerimientos corporativos" }
      }

      REGLA CRÍTICA: Basa tus respuestas únicamente en información coherente para el rango de fechas especificado (${rangoFechasTexto}). Devuelve exclusivamente el objeto JSON sin textos aclaratorios ni bloques de marcado markdown.
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" }, 
      messages: [
        { 
          role: "system", 
          content: "Eres un analista comercial que genera reportes ejecutivos semanales de alta precisión estructurados en formato JSON." 
        },
        { 
          role: "user", 
          content: prompt 
        }
      ],
      temperature: 0.1, 
    });

    const jsonRespuesta = JSON.parse(completion.choices[0].message.content);
    
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(jsonRespuesta);

  } catch (error) {
    console.error("Error en servidor Vercel:", error);
    return res.status(500).json({ 
      error: "Error interno al procesar los datos de ventas con OpenAI", 
      details: error.message 
    });
  }
}
