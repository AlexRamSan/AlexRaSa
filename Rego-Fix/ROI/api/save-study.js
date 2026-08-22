// Ruta del archivo: api/save-study.js
import { put } from '@vercel/blob';

export default async function handler(req, res) {
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

    // Guardar archivo JSON persistente en Vercel Blob
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
