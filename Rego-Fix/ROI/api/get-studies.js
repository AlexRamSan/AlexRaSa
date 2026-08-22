// Ruta del archivo: api/get-studies.js
import { list } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido. Solo GET.' });
  }

  try {
    const { blobs } = await list({ prefix: 'casos/' });
    const studies = [];

    for (const item of blobs) {
      try {
        const response = await fetch(item.url, { cache: 'no-store' });
        if (response.ok) {
          const studyData = await response.json();
          studies.push(studyData);
        }
      } catch (errBlob) {
        console.warn('Error leyendo blob:', item.url, errBlob);
      }
    }

    return res.status(200).json(studies);

  } catch (error) {
    console.error('Error al listar estudios desde Vercel Blob:', error);
    return res.status(500).json({ error: 'Error consultando la nube: ' + error.message });
  }
}
