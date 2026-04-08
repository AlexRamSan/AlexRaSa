// Archivo: /api/contactos.js
module.exports = async function handler(req, res) {
  // Evitamos que Vercel rechace la conexión por seguridad (CORS)
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { dominio } = req.query;

  if (!dominio) {
    return res.status(400).json({ error: 'Debes proporcionar un dominio válido.' });
  }

  if (!process.env.APOLLO_API_KEY) {
    return res.status(400).json({ error: 'Falta la variable APOLLO_API_KEY en Vercel.' });
  }

  try {
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
        per_page: 15
      })
    });

    if (!apolloReq.ok) {
      const errorText = await apolloReq.text();
      console.error("Error de Apollo:", errorText);
      return res.status(400).json({ error: 'Apollo rechazó la llave. Verifica que no tenga espacios.' });
    }

    const apolloData = await apolloReq.json();

    const contactosLimpios = (apolloData.people || []).map(p => {
      let estadoTraducido = 'Desconocido';
      if (p.email_status === 'verified') estadoTraducido = 'Verificado';
      if (p.email_status === 'extrapolated') estadoTraducido = 'Extrapolado / Riesgo';
      if (p.email_status === 'catch_all') estadoTraducido = 'Catch-all';

      return {
        nombre: p.first_name || 'Usuario',
        apellido: p.last_name || '',
        puesto: p.title || 'Perfil Técnico/Advo.',
        correo: p.email || p.obfuscated_email || 'Requiere Reveal',
        estado: estadoTraducido
      };
    });

    res.status(200).json(contactosLimpios);

  } catch (error) {
    console.error('Error interno del código:', error);
    res.status(500).json({ error: `Fallo interno del servidor: ${error.message}` });
  }
};
