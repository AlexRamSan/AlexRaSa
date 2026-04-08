// Archivo: /api/contactos.js
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

  const { dominio } = req.query;
  const API_KEY = process.env.APOLLO_API_KEY;

  try {
    // PASO 1: Buscar la Organización por dominio para obtener su ID
    const orgRes = await fetch('https://api.apollo.io/v1/organizations/bulk_enrich', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY },
      body: JSON.stringify({ domains: [dominio] })
    });

    const orgData = await orgRes.json();
    const orgId = orgData[0]?.id;

    if (!orgId) {
        return res.status(400).json({ error: `No se encontró la empresa con el dominio ${dominio}` });
    }

    // PASO 2: Buscar personas asociadas a esa Organización específica
    // Este método es mucho más amigable con los planes gratuitos
    const peopleRes = await fetch('https://api.apollo.io/v1/mixed_people/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY },
      body: JSON.stringify({
        organization_ids: [orgId],
        page: 1,
        per_page: 12,
        prospective_hub_user_ids: [] 
      })
    });

    const peopleData = await peopleRes.json();

    if (!peopleRes.ok) {
        return res.status(400).json({ error: "Apollo limitó la búsqueda de personas. Intenta con otro dominio." });
    }

    const contactos = (peopleData.people || []).map(p => ({
      nombre: p.first_name || 'Usuario',
      apellido: p.last_name || '',
      puesto: p.title || 'Ingeniería/Mantenimiento',
      // En plan gratuito, Apollo suele devolver el correo ofuscado hasta que lo "revelas"
      correo: p.email || 'Click en Apollo para revelar',
      estado: p.email_status === 'verified' ? 'Verificado' : 'Consultar'
    }));

    res.status(200).json(contactos);

  } catch (error) {
    res.status(500).json({ error: `Error en el proceso: ${error.message}` });
  }
};
