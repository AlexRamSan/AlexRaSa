import OpenAI from "openai";

// Inicialización de OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Función interna para obtener un Access Token fresco usando el Refresh Token de tus variables de entorno
async function getSalesforceAccessToken() {
  const loginUrl = process.env.SF_LOGIN_URL || 'https://login.salesforce.com';
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.SF_CLIENT_ID,
    client_secret: process.env.SF_CLIENT_SECRET,
    refresh_token: process.env.SF_REFRESH_TOKEN
  });

  const response = await fetch(`${loginUrl}/services/oauth2/token`, {
    method: 'POST',
    body: params,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Error de autenticación con Salesforce: ${errText}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    instanceUrl: data.instance_url
  };
}

// Función para ejecutar consultas SOQL en Salesforce
async function runQuery(instanceUrl, accessToken, query) {
  const url = `${instanceUrl}/services/data/v57.0/query/?q=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) return [];
  const data = await response.json();
  return data.records || [];
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Método no permitido.' });
  }

  try {
    const { metadataReporte } = req.body;
    const inicio = metadataReporte.fechaInicioFiltro;
    const fin = metadataReporte.fechaFinFiltro;
    const rangoFechasTexto = `Del ${inicio} al ${fin}`;

    // 1. AUTENTICACIÓN CON ENTORNO REAL
    const { accessToken, instanceUrl } = await getSalesforceAccessToken();

    // 2. CONSULTAS REALES EN RANGO DE FECHAS (SOQL)
    // Nota: Ajusta los nombres de los campos u objetos si usas campos personalizados en RFMX
    const visitasYTareas = await runQuery(instanceUrl, accessToken, 
      `SELECT Subject, Description, ActivityDate, Status FROM Task WHERE ActivityDate >= ${inicio} AND ActivityDate <= ${fin}`
    );

    const oportunidadesNuevas = await runQuery(instanceUrl, accessToken, 
      `SELECT Name, Amount, StageName, CloseDate FROM Opportunity WHERE CreatedDate >= ${inicio}T00:00:00Z AND CreatedDate <= ${fin}T23:59:59Z`
    );

    const pipelineMetas = await runQuery(instanceUrl, accessToken, 
      `SELECT Amount, StageName FROM Opportunity WHERE CloseDate = THIS_MONTH`
    );

    // Unimos los datos extraídos para entregárselos de forma masiva a la IA
    const datosRealesSalesforce = {
      periodoFiltro: rangoFechasTexto,
      tareasYVisitasRegistradas: visitasYTareas,
      nuevasOportunidadesDetectadas: oportunidadesNuevas,
      resumenPipelineMensual: pipelineMetas
    };

    // 3. PROMPT ESTRUCTURADO CON DATA REAL
    const prompt = `
      Eres un asistente experto en análisis comercial para REGO-FIX México (RFMX).
      Tu tarea es tomar los siguientes datos REALES extraídos directamente de Salesforce para el periodo de tiempo: ${rangoFechasTexto}.

      DATOS REALES DE EXTRAÍDOS DE SALESFORCE:
      ${JSON.stringify(datosRealesSalesforce)}

      Debes procesar, sintetizar y resumir estos registros en un reporte ejecutivo de alta dirección. 
      Genera un objeto JSON estrictamente con la estructura de diapositivas requerida:
      {
        "slide1_portada": { "fecha": "${rangoFechasTexto}", "region": "Zona Centro-Sur / Bajío" },
        "slide2_resultados": { "budget": "Meta mensual de la región", "facturado": "Suma de montos ganados/facturados", "cumplimiento": "Calcular % de avance", "backorder": "Cálculo o estimación de backorder", "forecast": "Estimado de cierre" },
        "slide3_profit": { "margen_proyectos": "Margen promedio según las oportunidades", "descuentos_activos": "Descuentos aplicados o detectados", "directo_vs_distribucion": "Análisis de canales" },
        "slide4_actividad": { "visitas": "Totalizar cuántas visitas/minutas se registran en las tareas del periodo", "nuevas_oportunidades": "Contar cuántas oportunidades se crearon y sus nombres clave", "proyectos_activos": "Resumen de lo que se estuvo trabajando en piso de fábrica", "actividades_salesforce": "Número de interacciones cerradas", "demos_activas": "Estatus de herramental en prueba" },
        "slide5_recuperacion": { "material_campo": "Kits powRgrip o herramental asignado a pruebas", "recuperacion_pendiente": "Acciones de recolección mencionadas en tareas", "estatus_demos": "Estatus de validación técnica" },
        "slide6_cobranza": { "cartera_vencida": "Alertas de crédito o facturas pendientes", "compromisos_pago": "Fechas acordadas en minutas", "clientes_criticos": "Cuentas retenidas" },
        "slide7_plan_accion": { "estrategia": "Estrategia comercial sugerida para cerrar el mes con éxito", "cuentas_prioritarias": "Cuentas automotrices/aeroespaciales foco en el periodo", "acciones_proxima_semana": "Próximos pasos lógicos en base a los pendientes", "apoyo_gerencia": "Requerimientos de soporte de crédito o corporativo" }
      }

      REGLA CRÍTICA: Procesa la información real adjunta. Si un dato específico (como cobranza) no viene explícito en el volcado de Salesforce, usa el contexto comercial de REGO-FIX México para estructurar un estado lógico o un recordatorio de revisión de cartera ejecutiva. Devuelve exclusivamente el JSON directo.
    `;

    // 4. LLAMADA A GPT-4O
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" }, 
      messages: [
        { role: "system", content: "Eres un analista de datos industriales encargado de estructurar reportes de ventas basados en consultas SOQL de Salesforce." },
        { role: "user", content: prompt }
      ],
      temperature: 0.1, 
    });

    const jsonRespuesta = JSON.parse(completion.choices[0].message.content);
    
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(jsonRespuesta);

  } catch (error) {
    console.error("Error en servidor Vercel:", error);
    return res.status(500).json({ 
      error: "Error al conectar con la API de Salesforce o procesar reporte", 
      details: error.message 
    });
  }
}
