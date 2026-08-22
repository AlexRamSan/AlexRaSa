// Ruta del archivo: api/delete-study.js
import { del } from '@vercel/blob';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'DELETE, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { id } = req.body || {};
    if (!id) {
      return res.status(400).json({ error: 'Falta el ID del estudio a eliminar' });
    }

    // Borrar el archivo JSON físico del bucket de Vercel Blob
    await del(`casos/${id}.json`);

    return res.status(200).json({ success: true, message: 'Estudio eliminado de la nube' });
  } catch (error) {
    console.error('Error al eliminar de Vercel Blob:', error);
    return res.status(500).json({ error: 'Error al eliminar en la nube: ' + error.message });
  }
}
