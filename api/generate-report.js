import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function getSalesforceAccessToken() {
  // Validación previa de variables críticas para evitar crasheos indeseados
  if (!process.env.SF_CLIENT_ID || !process.env.SF_CLIENT_SECRET || !process.env.SF_REFRESH_TOKEN) {
    throw new Error("Faltan variables de entorno de Salesforce en el panel de Vercel (SF_CLIENT_ID, SF_CLIENT_SECRET o SF_REFRESH_TOKEN).");
  }

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
    throw new Error(`Salesforce rechazó las credenciales: ${errText}`);
  }

  const data = await response.json();
  return {
    accessToken: data.access_token,
    instanceUrl: data.instance_url
  };
}

async function runQuery(instanceUrl, accessToken, query) {
  try {
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
  } catch (e) {
    return [];
  }
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

    let datosRealesSalesforce = {};

    // Intentar conectar con Salesforce de forma segura
    try {
      const { accessToken, instanceUrl } = await getSalesforceAccessToken();
      
      const visitasYTareas = await runQuery(instanceUrl, accessToken, 
        `SELECT Subject, Description, ActivityDate, Status FROM Task WHERE ActivityDate >= ${inicio} AND ActivityDate <= ${fin}`
      );

      const oportunidadesNuevas = await runQuery(instanceUrl, accessToken, 
        `SELECT Name, Amount, StageName, CloseDate FROM Opportunity WHERE CreatedDate >= ${inicio}T00:00:00Z AND CreatedDate <= ${fin}T23:59:59Z`
      );

      datosRealesSalesforce = {
        periodoFiltro: rangoFechasTexto,
        tareasYVisitasRegistradas: visitasYTareas,
        nuevasOportunidadesDetectadas: oportunidadesNuevas,
        statusConexion: "Conexión Exitosa con Salesforce"
      };
    } catch (sfError) {
      // Si falla Salesforce, guardamos el error estructurado sin tirar el servidor
      datosRealesSalesforce = {
        periodoFiltro: rangoFechasTexto,
        tareasYVisitasRegistradas: [],
        nuevasOportunidadesDetectadas: [],
        statusConexion: `Error de Autenticación: ${sfError.message}`
      };
    }

    const prompt = `
      Eres un asistente experto en análisis comercial para REGO-FIX México (RFMX).
      Tu tarea es tomar los siguientes datos de Salesforce para el periodo: ${rangoFechasTexto}.
      STATUS DE CONEXIÓN ACTUAL: ${datosRealesSalesforce.statusConexion}

      DATOS DE ENTRADA:
      ${JSON.stringify(datosRealesSalesforce)}

      Genera el reporte en formato JSON. Si la conexión falló o los registros están vacíos, indica alertas lógicas de revisión en las diapositivas correspondientes.
      
      Estructura requerida:
      {
        "slide1_portada": { "fecha": "${rangoFechasTexto}", "region": "Zona Centro-Sur / Bajío" },
        "slide2_resultados": { "budget": "$120,000 USD", "facturado": "$0 USD", "cumplimiento": "0%", "backorder": "Verificar en sistema", "forecast": "Pendiente" },
        "slide3_profit": { "margen_proyectos": "N/A", "descuentos_activos": "Ninguno detectado", "directo_vs_distribucion": "Revisar canales" },
        "slide4_actividad": { "visitas": "0 visitas registradas", "nuevas_oportunidades": "0 oportunidades nuevas", "proyectos_activos": "Sin datos en el rango de fechas", "actividades_salesforce": "0 tareas", "demos_activas": "Sin pruebas reportadas" },
        "slide5_recuperacion": { "material_campo": "Verificar resguardos", "recuperacion_pendiente": "Ninguna", "estatus_demos": "Sin datos" },
        "slide6_cobranza": { "cartera_vencida": "Consultar administración", "compromisos_pago": "Ninguno", "clientes_criticos": "Ninguno" },
        "slide7_plan_accion": { "estrategia": "Restablecer conexión de datos o verificar que existan actividades registradas en Salesforce del ${inicio} al ${fin}.", "cuentas_prioritarias": "Cuentas del Bajío / Toluca", "acciones_proxima_semana": "Validar registros semanales", "apoyo_gerencia": "Soporte en revisión de credenciales de API si persiste el estatus de error." }
      }

      REGLA: Devuelve exclusivamente el objeto JSON directo.
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" }, 
      messages: [
        { role: "system", content: "Generas reportes de ventas estructurados estrictamente en formato JSON." },
        { role: "user", content: prompt }
      ],
      temperature: 0.1, 
    });

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(JSON.parse(completion.choices[0].message.content));

  } catch (error) {
    // Respuesta de emergencia segura para que el Frontend nunca se rompa
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({
      slide1_portada: { fecha: "Error en Servidor", region: "Revisar Logs de Vercel" },
      slide2_resultados: { budget: "Error", facturado: "Error", cumplimiento: "0%", backorder: "Error", forecast: "Error" },
      slide3_profit: { margen_proyectos: "Error", descuentos_activos: "Error", directo_vs_distribucion: "Error" },
      slide4_actividad: { visitas: "Error", nuevas_oportunidades: "Error", proyectos_activos: "Error", actividades_salesforce: "Error", demos_activas: "Error" },
      slide5_recuperacion: { material_campo: "Error", recuperacion_pendiente: "Error", estatus_demos: "Error" },
      slide6_cobranza: { cartera_vencida: "Error", compromisos_pago: "Error", clientes_criticos: "Error" },
      slide7_plan_accion: { estrategia: `Detalle técnico: ${error.message}`, cuentas_prioritarias: "Error", acciones_proxima_semana: "Error", apoyo_gerencia: "Error" }
    });
  }
}
