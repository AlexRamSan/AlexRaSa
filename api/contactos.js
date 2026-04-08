// Archivo: /api/contactos.js
export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { dominio } = req.query;

  if (!dominio) {
    return res.status(400).json({ error: 'Debes proporcionar un dominio válido.' });
  }

  // Validar que la llave de Apollo existe en Vercel
  if (!process.env.APOLLO_API_KEY) {
    return res.status(500).json({ error: 'Falta la API Key de Apollo en Vercel.' });
  }

  try {
    // Petición nativa a la API de Apollo
    const apolloReq = await fetch('https://api.apollo.io/v1/mixed_people/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        api_key: process.env.APOLLO_API_KEY,
        q_organization_domains: dominio,
        page: 1,
        per_page: 15 // Límite de contactos por consulta
      })
    });

    if (!apolloReq.ok) {
      const errorData = await apolloReq.text();
      console.error("Error de Apollo:", errorData);
      return res.status(500).json({ error: 'Apollo rechazó la búsqueda. Verifica tu API Key.' });
    }

    const apolloData = await apolloReq.json();

    // Apollo agrupa los resultados en un arreglo llamado "people"
    const contactosLimpios = (apolloData.people || []).map(p => {
      // Apollo tiene un campo "email_status". Traducimos los más comunes.
      let estadoTraducido = 'Desconocido';
      if (p.email_status === 'verified') estadoTraducido = 'Verificado';
      if (p.email_status === 'extrapolated') estadoTraducido = 'Extrapolado / Riesgo';
      if (p.email_status === 'catch_all') estadoTraducido = 'Catch-all';

      return {
        nombre: p.first_name || 'Usuario',
        apellido: p.last_name || '',
        puesto: p.title || 'Perfil Técnico/Advo.',
        // A veces Apollo oculta el correo si requiere un "crédito de revelado"
        correo: p.email || p.obfuscated_email || 'Requiere Reveal (Apollo)',
        estado: estadoTraducido
      };
    });

    res.status(200).json(contactosLimpios);

  } catch (error) {
    console.error('Error del servidor:', error);
    res.status(500).json({ error: 'Error interno conectando con Apollo.' });
  }
}
