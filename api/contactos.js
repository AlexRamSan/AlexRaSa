// Archivo: /api/contactos.js
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { dominio } = req.query;

  if (!dominio) {
    return res.status(400).json({ error: 'Debes proporcionar un dominio válido.' });
  }

  try {
    // 1. Validar que las variables existen en Vercel
    if (!process.env.SNOVIO_CLIENT_ID || !process.env.SNOVIO_CLIENT_SECRET) {
      console.error("FALTAN VARIABLES DE ENTORNO EN VERCEL");
      return res.status(500).json({ error: 'Faltan credenciales de Snov.io en Vercel.' });
    }

    // 2. Autenticación nativa
    const authReq = await fetch('https://api.snov.io/v1/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: process.env.SNOVIO_CLIENT_ID,
        client_secret: process.env.SNOVIO_CLIENT_SECRET
      })
    });

    if (!authReq.ok) {
      return res.status(500).json({ error: 'Credenciales de Snov.io incorrectas o rechazadas.' });
    }

    const authData = await authReq.json();
    const token = authData.access_token;

    // 3. Búsqueda nativa
    const searchReq = await fetch(`https://api.snov.io/v2/domain-emails-with-info?domain=${dominio}&type=all&limit=15`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${token}` }
    });

    if (!searchReq.ok) {
      return res.status(500).json({ error: 'Snov.io rechazó la búsqueda del dominio.' });
    }

    const searchData = await searchReq.json();

    // 4. Limpieza de datos
    const contactosLimpios = (searchData.emails || []).map(c => ({
      nombre: c.firstName || 'Sin Nombre',
      apellido: c.lastName || '',
      puesto: c.position || 'No especificado',
      correo: c.email,
      estado: c.emailStatus === 'valid' ? 'Verificado' : 'Riesgo / Catch-all'
    }));

    res.status(200).json(contactosLimpios);

  } catch (error) {
    console.error('Error del servidor:', error);
    res.status(500).json({ error: 'Error interno del servidor.' });
  }
}
