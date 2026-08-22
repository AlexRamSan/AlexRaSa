// Ruta del archivo: api/save-study.js
import { put } from '@vercel/blob';

export default async function handler(req, res) {
  // Configurar CORS básico por seguridad
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Solo POST.' });
  }

  try {
    const study = req.body;
    if (!study || !study.id) {
      return res.status(400).json({ error: 'Datos de estudio incompletos' });
    }

    study.sync_status = "synced";
    study.last_updated = Date.now();

    // Guardar o sobrescribir el JSON en Vercel Blob
    const blob = await put(`casos/${study.id}.json`, JSON.stringify(study), {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true
    });

    return res.status(200).json({
      success: true,
      url: blob.url,
      study: study
    });

  } catch (error) {
    console.error('Error guardando en Vercel Blob:', error);
    return res.status(500).json({ error: 'Error al persistir en la nube: ' + error.message });
  }
}
