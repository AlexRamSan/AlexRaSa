import OpenAI from "openai";
import { IncomingForm } from "formidable";
import fs from "fs";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const config = {
  api: { bodyParser: false }, 
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Método no permitido' });
  }

  const form = new IncomingForm();
  form.parse(req, async (err, fields, files) => {
    if (err) return res.status(500).json({ success: false, error: "Error procesando formulario" });

    try {
      let transcripcionText = "";

      // ACCIÓN: OBTENER TODAS LAS CUENTAS COMERCIALES
      if (fields.action && fields.action[0] === 'getAllAccounts') {
        const mockAccounts = [
          { Id: "0018W00002NlXz1QAF", Name: "Bocar Group Lerma", BillingCity: "Estado de México" },
          { Id: "0018W00002NlXz2QAF", Name: "Nemak", BillingCity: "Saltillo" },
          { Id: "0018W00002NlXz3QAF", Name: "Bosch Toluca", BillingCity: "Toluca" },
          { Id: "0018W00002NlXz4QAF", Name: "Knurling Distribuciones", BillingCity: "Querétaro" }
        ];
        return res.status(200).json({ success: true, accounts: mockAccounts });
      }

      // ACCIÓN: CONFIRMAR E INYECTAR EN SALESFORCE
      if (fields.action && fields.action[0] === 'confirmar') {
        return res.status(200).json({ success: true, message: "Inyectado correctamente." });
      }

      // PROCESAMIENTO DE VOZ (WHISPER) O TEXTO DIRECTO
      if (files.audio) {
        const audioFile = files.audio[0];
        const transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(audioFile.filepath),
          model: "whisper-1",
          language: "es"
        });
        transcripcionText = transcription.text;
      } else if (fields.texto) {
        transcripcionText = fields.texto[0];
      } else {
        return res.status(400).json({ success: false, error: "Datos insuficientes." });
      }

      // AUDITORÍA INTELIGENTE DE REQUERIMIENTOS SEMANALES
      const promptAuditoria = `
        Eres el asistente inteligente de Miguel para REGO-FIX México (RFMX).
        Tu meta es tomar sus minutas, pero actuar como auditor estricto de los requerimientos de la gerencia.
        
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
      
      // Auto-asociación inteligente de cuentas por nombre
      const lowTxt = transcripcionText.toLowerCase();
      if (lowTxt.includes("bocar")) respuestaFinal.accounts = [{ Id: "0018W00002NlXz1QAF", Name: "Bocar Group Lerma", BillingCity: "Estado de México" }];
      if (lowTxt.includes("bosch")) respuestaFinal.accounts = [{ Id: "0018W00002NlXz3QAF", Name: "Bosch Toluca", BillingCity: "Toluca" }];
      if (lowTxt.includes("knurling")) respuestaFinal.accounts = [{ Id: "0018W00002NlXz4QAF", Name: "Knurling Distribuciones", BillingCity: "Querétaro" }];

      return res.status(200).json(respuestaFinal);

    } catch (e) {
      return res.status(500).json({ success: false, error: e.message });
    }
  });
}
