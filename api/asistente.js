const OpenAI = require("openai");
const formidable = require("formidable");
const fs = require("fs");

// Inicialización de OpenAI con la llave de tus variables de entorno
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Configuración crítica de Vercel para permitir la recepción de archivos binarios (audios)
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // Configurar cabeceras para permitir respuestas correctas en formato JSON
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido. Usa POST.' });
  }

  // Configuración del procesador de formularios
  const form = formidable({ multiples: false });

  form.parse(req, async (err, fields, files) => {
    if (err) {
      console.error("Error parseando el formulario con formidable:", err);
      return res.status(500).json({ success: false, error: "Error al procesar el archivo de audio o texto." });
    }

    try {
      let transcripcionText = "";

      // 1. GESTIÓN DE ACCIONES SECUNDARIAS (OBTENER CUENTAS)
      // Normalizamos la lectura de campos ya que formidable a veces los regresa como arreglos
      const action = fields.action ? (Array.isArray(fields.action) ? fields.action[0] : fields.action) : null;

      if (action === 'getAllAccounts') {
        const mockAccounts = [
          { Id: "0018W00002NlXz1QAF", Name: "Bocar Group Lerma", BillingCity: "Estado de México" },
          { Id: "0018W00002NlXz2QAF", Name: "Nemak", BillingCity: "Saltillo" },
          { Id: "0018W00002NlXz3QAF", Name: "Bosch Toluca", BillingCity: "Toluca" },
          { Id: "0018W00002NlXz4QAF", Name: "Knurling Distribuciones", BillingCity: "Querétaro" }
        ];
        return res.status(200).json({ success: true, accounts: mockAccounts });
      }

      if (action === 'confirmar') {
        return res.status(200).json({ success: true, message: "Inyectado correctamente en Salesforce." });
      }

      // 2. PROCESAMIENTO DE ENTRADA: AUDIO (WHISPER) O TEXTO DIRECTO
      const audioFile = files.audio ? (Array.isArray(files.audio) ? files.audio[0] : files.audio) : null;
      const textoManual = fields.texto ? (Array.isArray(fields.texto) ? fields.texto[0] : fields.texto) : null;

      if (audioFile && audioFile.filepath) {
        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(audioFile.filepath),
          model: "whisper-1",
          language: "es"
        });
        transcripcionText = transcription.text;
      } else if (textoManual) {
        transcripcionText = textoManual;
      } else {
        return res.status(400).json({ success: false, error: "No se detectó audio ni texto válido." });
      }

      // 3. AUDITORÍA INTELIGENTE CON GPT-4o
      const promptAuditoria = `
        Eres el asistente inteligente de Miguel para REGO-FIX México (RFMX).
        Tu meta es tomar sus minutas, pero actuar como auditor de los requerimientos de la gerencia.
        
        Puntos clave del reporte semanal:
        - Resultados del mes / Forecast.
        - Profit / Margen y Descuentos aplicados.
        - Actividad (Visitas, Oportunidades y Demos en piso de fábrica).
        - Cobranza (Cartera o acuerdos de pago).

        Dictado actual: "${transcripcionText}"

        Si falta información crucial del estatus de la planta o de la cobranza, genera una pregunta proactiva en el campo 'detalles' pidiéndole completar la información antes de guardar en Salesforce.

        Responde exclusivamente con este formato JSON:
        {
          "success": true,
          "transcript": "${transcripcionText}",
          "accounts": [], 
          "plan": {
            "intent": "REGISTRO_ACTIVIDAD",
            "asunto": "Reporte de Campo Estructurado",
            "detalles": "Escribe aquí la pregunta inteligente si faltan datos comerciales importantes, o el resumen limpio para Salesforce si la información está completa.",
            "fecha": "2026-05-19",
            "hora": "12:00"
          }
        }
      `;

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Analista comercial de precisión industrial." },
          { role: "user", content: promptAuditoria }
        ],
        temperature: 0.2
      });

      const respuestaFinal = JSON.parse(completion.choices[0].message.content);
      
      // Auto-asociación lógica por coincidencia de texto
      const lowTxt = transcripcionText.toLowerCase();
      if (lowTxt.includes("bocar")) respuestaFinal.accounts = [{ Id: "0018W00002NlXz1QAF", Name: "Bocar Group Lerma", BillingCity: "Estado de México" }];
      if (lowTxt.includes("bosch")) respuestaFinal.accounts = [{ Id: "0018W00002NlXz3QAF", Name: "Bosch Toluca", BillingCity: "Toluca" }];
      if (lowTxt.includes("knurling")) respuestaFinal.accounts = [{ Id: "0018W00002NlXz4QAF", Name: "Knurling Distribuciones", BillingCity: "Querétaro" }];

      return res.status(200).json(respuestaFinal);

    } catch (innerError) {
      console.error("Error procesando llamadas internas de IA:", innerError);
      return res.status(500).json({ success: false, error: innerError.message });
    }
  });
}
