import { put } from '@vercel/blob';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Utiliza POST.' });
  }

  try {
    const studyData = req.body;
    
    if (!studyData || !studyData.titulo) {
      return res.status(400).json({ error: 'Datos incompletos para guardar el estudio.' });
    }

    const id = Date.now().toString();
    const fileName = `studies/study_${id}.json`;
    const content = JSON.stringify({ id, ...studyData }, null, 2);

    // Guardado en Blob Storage
    const blob = await put(fileName, content, {
      access: 'public',
      contentType: 'application/json'
    });

    return res.status(200).json({
      success: true,
      message: 'Estudio guardado exitosamente en la nube.',
      id: id,
      url: blob.url
    });
  } catch (error) {
    console.error('Error al guardar estudio en la nube:', error);
    return res.status(500).json({
      error: 'Error interno del servidor al procesar el guardado.',
      details: error.message
    });
  }
}
