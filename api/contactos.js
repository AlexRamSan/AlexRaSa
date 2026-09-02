const { createClient } = require('@supabase/supabase-js');

// Matriz oficial de descuentos REGO-FIX 2026
const DISTRIBUTOR_RULES = {
  'usuario1': {
    name: 'Distribuidor AHNSA',
    category: 'ORO',
    discounts: { 'ER': 0.40, 'PG': 0.30, 'Maquinas': 0.10, 'Mordazas': 0.05, 'Otros': 0.10 }
  },
  'usuario2': {
    name: 'Distribuidor DHM',
    category: 'DIAMANTE',
    discounts: { 'ER': 0.45, 'PG': 0.35, 'Maquinas': 0.10, 'Mordazas': 0.05, 'Otros': 0.15 }
  },
  'usuario_bronce': {
    name: 'Distribuidor WEM / General',
    category: 'BRONCE',
    discounts: { 'ER': 0.20, 'PG': 0.20, 'Maquinas': 0.10, 'Mordazas': 0.05, 'Otros': 0.10 }
  }
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { dominio, action, user } = req.query;

  // ==========================================
  // RUTA 1: BÚSQUEDA DE CONTACTOS EN APOLLO
  // ==========================================
  if (dominio) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Método no permitido' });

    const API_KEY = process.env.APOLLO_API_KEY;

    try {
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
        return res.status(400).json({ error: 'Apollo limitó la búsqueda de personas. Intenta con otro dominio.' });
      }

      const contactos = (peopleData.people || []).map(p => ({
        nombre: p.first_name || 'Usuario',
        apellido: p.last_name || '',
        puesto: p.title || 'Ingeniería/Mantenimiento',
        correo: p.email || 'Click en Apollo para revelar',
        estado: p.email_status === 'verified' ? 'Verificado' : 'Consultar'
      }));

      return res.status(200).json(contactos);

    } catch (error) {
      return res.status(500).json({ error: `Error en el proceso: ${error.message}` });
    }
  }

  // ====================================================
  // RUTA 2: GESTIÓN Y VALIDACIÓN DE DISTRIBUIDORES
  // ====================================================
  if (action === 'distributors' || req.method === 'POST') {
    try {
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

      // GET: Cargar cuentas autorizadas del distribuidor
      if (req.method === 'GET') {
        const distInfo = DISTRIBUTOR_RULES[user];
        if (!distInfo) return res.status(401).json({ error: 'Distribuidor no autorizado.' });

        const { data: accounts, error } = await supabase
          .from('customer_accounts')
          .select('id, customer_name, status, account_group, salesman')
          .or(`salesman.ilike.%${distInfo.name}%,salesman.ilike.%${user}%`)
          .order('customer_name', { ascending: true });

        if (error) throw error;

        return res.status(200).json({
          distributor: distInfo,
          assignedAccounts: accounts || []
        });
      }

      // POST: Validar choque con venta directa o dar de alta nuevo prospecto
      if (req.method === 'POST') {
        const { user: postUser, customerName, taxId } = req.body || {};
        const distInfo = DISTRIBUTOR_RULES[postUser];
        if (!distInfo) return res.status(401).json({ error: 'Distribuidor no autorizado.' });

        const cleanName = (customerName || '').trim();
        if (!cleanName) return res.status(400).json({ error: 'Nombre de cliente inválido.' });

        const { data: existing, error: searchError } = await supabase
          .from('customer_accounts')
          .select('*')
          .ilike('customer_name', `%${cleanName}%`);

        if (searchError) throw searchError;

        // Regla estricta: Bloqueo de cuentas protegidas / Venta Directa
        const directMatch = (existing || []).find(c => c.account_group === 'Direct sale' || c.status === 'Locked');

        if (directMatch) {
          return res.status(403).json({
            blocked: true,
            penaltyNotice: true,
            message: `AVISO DE CUMPLIMIENTO COMERCIAL: La empresa "${directMatch.customer_name}" está clasificada como CUENTA PROTEGIDA DE VENTA DIRECTA por REGO-FIX México. Queda estrictamente prohibido cotizar, promover o suministrar producto a esta entidad. La detección de actividad comercial no autorizada conllevará la reclasificación inmediata de su categoría con pérdida de descuento comercial, o bien la rescisión definitiva de su contrato de distribución.`
          });
        }

        // Si ya pertenece a otra firma de distribución
        const otherDist = (existing || []).find(c => c.account_group === 'Distributor' && !c.salesman.toLowerCase().includes(distInfo.name.toLowerCase()));
        if (otherDist) {
          return res.status(409).json({
            error: `La cuenta "${otherDist.customer_name}" ya se encuentra asignada a otra firma de distribución.`
          });
        }

        // Registro de cuenta nueva autorizada
        const { data: newAccount, error: insertError } = await supabase
          .from('customer_accounts')
          .insert([{
            tax_id: taxId || null,
            customer_name: cleanName.toUpperCase(),
            status: 'Active',
            salesman: distInfo.name,
            account_group: 'Distributor'
          }])
          .select()
          .single();

        if (insertError) throw insertError;

        return res.status(200).json({
          success: true,
          account: newAccount,
          message: `Cuenta "${cleanName.toUpperCase()}" registrada y asignada exitosamente a ${distInfo.name}.`
        });
      }

    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Parámetros insuficientes o método no permitido.' });
};
