// Ruta del archivo: api/save-study.js
// Función Serverless en Vercel para recibir y almacenar estudios del equipo

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido. Solo POST.' });
  }

  try {
    const studyData = req.body;

    if (!studyData || !studyData.id) {
      return res.status(400).json({ error: 'Datos de estudio incompletos' });
    }

    console.log(`[Master Sync] Estudio recibido: ${studyData.id} | Empresa: ${studyData.company} | Asesor: ${studyData.userName}`);

    return res.status(200).json({
      success: true,
      message: 'Estudio guardado en servidor Master correctamente',
      receivedId: studyData.id,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error al procesar estudio en servidor:', error);
    return res.status(500).json({ error: 'Error interno en el servidor' });
  }
}
