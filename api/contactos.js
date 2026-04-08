// Archivo: /api/contactos.js
const axios = require('axios');

export default async function handler(req, res) {
  // Solo permitimos peticiones GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { dominio } = req.query;

  if (!dominio) {
    return res.status(400).json({ error: 'Debes proporcionar un dominio válido.' });
  }

  try {
    // 1. Autenticación con las variables de Vercel
    const authResponse = await axios.post('https://api.snov.io/v1/oauth/access_token', {
      grant_type: 'client_credentials',
      client_id: process.env.SNOVIO_CLIENT_ID,
      client_secret: process.env.SNOVIO_CLIENT_SECRET
    });

    const token = authResponse.data.access_token;

    // 2. Búsqueda de correos en el dominio
    const searchResponse = await axios.get('https://api.snov.io/v2/domain-emails-with-info', {
      params: {
        domain: dominio,
        type: 'all',
        limit: 15 // Límite para no quemar créditos de más en empresas gigantes
      },
      headers: { 
        'Authorization': `Bearer ${token}` 
      }
    });

    // 3. Limpieza de datos para tu frontend
    const contactosLimpios = searchResponse.data.emails.map(c => ({
      nombre: c.firstName || 'Sin Nombre',
      apellido: c.lastName || '',
      puesto: c.position || 'No especificado',
      correo: c.email,
      estado: c.emailStatus === 'valid' ? 'Verificado' : 'Riesgo / Catch-all'
    }));

    // Enviar resultados al frontend
    res.status(200).json(contactosLimpios);

  } catch (error) {
    console.error('Error en la API de Snov.io:', error.response?.data || error.message);
    res.status(500).json({ error: 'Error al conectar con el servidor de prospección.' });
  }
}
