// Archivo: /api/contactos.js
module.exports = async function handler(req, res) {
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
    // Intentamos con el endpoint de búsqueda de personas por organización
    // Este es el más compatible con los créditos de "Enrichment" que tienes
    const apolloReq = await fetch('https://api.apollo.io/v1/people/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'X-Api-Key': process.env.APOLLO_API_KEY 
      },
      body: JSON.stringify({
        q_organization_domains: dominio,
        page: 1,
        per_page: 15,
        display_mode: "explorer" // Modo compatible con planes iniciales
      })
    });

    const responseData = await apolloReq.json();

    if (!apolloReq.ok) {
      console.error("Error detallado de Apollo:", responseData);
      return res.status(400).json({ 
        error: responseData.error || 'Apollo rechazó la petición.' 
      });
    }

    // Mapeamos los resultados al formato de tu tabla REGO-FIX
    const contactosLimpios = (responseData.people || []).map(p => {
      let estadoTraducido = 'Verificado';
      if (p.email_status === 'extrapolated') estadoTraducido = 'Extrapolado';
      if (p.email_status === 'catch_all') estadoTraducido = 'Catch-all';

      return {
        nombre: p.first_name || 'Usuario',
        apellido: p.last_name || '',
        puesto: p.title || 'Perfil Técnico/Advo.',
        correo: p.email || 'Email Privado (Usa Apollo para revelar)',
        estado: estadoTraducido
      };
    });

    res.status(200).json(contactosLimpios);

  } catch (error) {
    console.error('Error interno:', error);
    res.status(500).json({ error: `Fallo interno del servidor: ${error.message}` });
  }
};
