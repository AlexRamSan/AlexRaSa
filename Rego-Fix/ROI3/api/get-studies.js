import { list } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido. Utiliza GET.' });
  }

  try {
    const { blobs } = await list({ prefix: 'studies/' });
    
    // Obtener los datos JSON de cada estudio listado
    const studies = await Promise.all(
      blobs.map(async (blob) => {
        try {
          const response = await fetch(blob.url);
          if (response.ok) {
            return await response.json();
          }
          return null;
        } catch {
          return null;
        }
      })
    );

    const filteredStudies = studies
      .filter((s) => s !== null)
      .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

    return res.status(200).json(filteredStudies);
  } catch (error) {
    console.error('Error al recuperar estudios de la nube:', error);
    return res.status(500).json({
      error: 'Error al consultar estudios en la nube.',
      details: error.message
    });
  }
}
