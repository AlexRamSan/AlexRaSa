// Ruta del archivo: api/get-studies.js
import { list } from '@vercel/blob';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido. Solo GET.' });
  }

  try {
    // Validar si el token existe antes de llamar a Vercel Blob
    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return.status(200).json([]);
    }

    const { blobs } = await list({ prefix: 'casos/' });
    if (!blobs || blobs.length === 0) {
      return res.status(200).json([]);
    }

    const studies = [];
    for (const item of blobs) {
      try {
        const response = await fetch(item.url, { cache: 'no-store' });
        if (response.ok) {
          const studyData = await response.json();
          studies.push(studyData);
        }
      } catch (errBlob) {
        console.warn('Error leyendo blob individual:', item.url, errBlob);
      }
    }

    return res.status(200).json(studies);

  } catch (error) {
    console.error('Error al listar estudios desde Vercel Blob:', error);
    // Devuelve un arreglo vacío en lugar de colapsar la UI
    return res.status(200).json([]);
  }
}
