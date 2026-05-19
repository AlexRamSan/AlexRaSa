import OpenAI from "openai";

// Inicializa el cliente de OpenAI con la API Key de tus variables de entorno de Vercel
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  // Asegurar que solo acepte peticiones POST desde tu formulario web
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método no permitido. Usa POST.' });
  }

  try {
    // 1. Recibir la data cruda que mandó el frontend (Salesforce)
    const { salesforceRawData } = req.body; 

    // Obtener la fecha actual de manera automática para la portada
    const opcionesFecha = { month: 'long', year: 'numeric' };
    const fechaActual = new Date().toLocaleDateString('es-MX', opcionesFecha);

    // 2. Construcción del Prompt con la estructura obligatoria de la gerencia
    const prompt = `
      Eres un asistente experto en análisis comercial y operaciones de negocio para REGO-FIX México (RFMX).
      Tu tarea es tomar los siguientes datos comerciales crudos provenientes de Salesforce (módulos de oportunidades, tareas, cuentas, métricas de visitas y estatus de cobro):

      DATOS CRUDOS DE SALESFORCE:
      ${JSON.stringify(salesforceRawData)}

      Debes procesar, resumir y acomodar esta información de manera sumamente ejecutiva, clara, concisa y profesional para la junta semanal de ventas.
      Sigue estrictamente la estructura solicitada por la gerencia.

      Genera un objeto JSON estructurado exactamente con las siguientes llaves y campos:
      {
        "slide1_portada": { "fecha": "${fechaActual}", "region": "Zona Centro-Sur / Bajío" },
        "slide2_resultados": { "budget": "Monto de la meta mensual", "facturado": "Monto cobrado/facturado a la fecha", "cumplimiento": "Porcentaje % de avance", "backorder": "Monto en backorder", "forecast": "Predicción estimada de cierre de mes" },
        "slide3_profit": { "margen_proyectos": "Porcentaje o estatus del margen", "descuentos_activos": "Resumen de descuentos comerciales aplicados", "directo_vs_distribucion": "Proporción o análisis de venta directa contra canales de distribución" },
        "slide4_actividad": { "visitas": "Cantidad y detalle clave de visitas realizadas", "nuevas_oportunidades": "Nuevos requerimientos detectados", "proyectos_activos": "Estatus de proyectos clave en piso de fábrica", "actividades_salesforce": "Resumen de tareas/minutas registradas", "demos_activas": "Estatus de pruebas de rendimiento de herramienta en campo" },
        "slide5_recuperacion": { "material_campo": "Kits o herramientas actualmente prestadas", "recuperacion_pendiente": "Herramientas listas para recolectar", "estatus_demos": "Estatus técnico/comercial de las pruebas" },
        "slide6_cobranza": { "cartera_vencida": "Monto o cuentas con saldos vencidos", "compromisos_pago": "Fechas y acuerdos de pago de los clientes", "clientes_criticos": "Cuentas críticas o bloqueadas por crédito" },
        "slide7_plan_accion": { "estrategia": "Estrategia comercial para alcanzar el budget", "cuentas_prioritarias": "Clientes foco de la semana", "acciones_proxima_semana": "Agenda/actividades clave a realizar", "apoyo_gerencia": "Requerimientos específicos del gerente para destrabar proyectos o créditos" }
      }

      REGLA CRÍTICA: Responde EXCLUSIVAMENTE con el objeto JSON. No incluyas introducciones, explicaciones, ni bloques de código con marcas \`\`\`json. Tu respuesta debe ser directamente parseable.
    `;

    // 3. Llamada avanzada a GPT-4o forzando el modo JSON
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" }, // Fuerza a OpenAI a responder con un objeto JSON perfecto
      messages: [
        { 
          role: "system", 
          content: "Eres un analista de datos de precisión industrial que genera reportes de ventas estructurados estrictamente en formato JSON." 
        },
        { 
          role: "user", 
          content: prompt 
        }
      ],
      temperature: 0.1, // Temperatura baja para evitar alucinaciones y mantener fidelidad total a tus números de Salesforce
    });

    // 4. Extraer el contenido generado por la IA y enviarlo de vuelta al Frontend
    const jsonRespuesta = JSON.parse(completion.choices[0].message.content);
    
    // Configurar cabeceras para permitir respuestas correctas en formato JSON
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(jsonRespuesta);

  } catch (error) {
    console.error("Error en el handler de Vercel:", error);
    return res.status(500).json({ 
      error: "Error interno procesando el reporte con OpenAI", 
      details: error.message 
    });
  }
}
