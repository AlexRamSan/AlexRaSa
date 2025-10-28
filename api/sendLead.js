/**
 * Proxy seguro entre tu sitio (alexrasa.store) y Google Sheets
 * Evita el error de CORS y protege el endpoint real.
 *
 * Instrucciones:
 * 1. Crea la carpeta /api/ en tu repo (si no existe).
 * 2. Guarda este archivo como /api/sendLead.js
 * 3. Despliega en Vercel (se crea automáticamente como función serverless).
 * 4. En tu HTML, cambia:
 *      const WEB_APP_URL = '/api/sendLead';
 */

export default async function handler(req, res) {
  // --- Permitir solo POST ---
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ ok: false, error: 'Método no permitido. Usa POST.' });
  }

  // --- Configuración ---
  const SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwrg-93tIvGCd-W0eQprDGrBIIkotM41McJplAItc_mPKDvjpjedFwmAziw9jWQWxRWvQ/exec';

  try {
    // --- Reenviar el cuerpo recibido al Apps Script ---
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });

    // --- Leer la respuesta (puede ser texto o JSON) ---
    const text = await response.text();

    // --- Configurar CORS para permitir desde cualquier origen (público) ---
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // --- Responder directamente con el resultado del Apps Script ---
    res.status(200).send(text);
  } catch (error) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.status(500).json({
      ok: false,
      error: 'Fallo al contactar el Apps Script.',
      detalle: error.message
    });
  }
}
