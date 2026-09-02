import { createClient } from '@supabase/supabase-js';

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { dominio, action, user } = req.query;

  // ====================================================
  // RUTA 1: BÚSQUEDA DE CONTACTOS EN APOLLO
  // ====================================================
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

      if (!orgId) return res.status(400).json({ error: `No se encontró la empresa con dominio ${dominio}` });

      const peopleRes = await fetch('https://api.apollo.io/v1/mixed_people/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': API_KEY },
        body: JSON.stringify({ organization_ids: [orgId], page: 1, per_page: 12, prospective_hub_user_ids: [] })
      });
      const peopleData = await peopleRes.json();

      const contactos = (peopleData.people || []).map(p => ({
        nombre: p.first_name || 'Usuario',
        apellido: p.last_name || '',
        puesto: p.title || 'Ingeniería/Mantenimiento',
        correo: p.email || 'Click en Apollo para revelar',
        estado: p.email_status === 'verified' ? 'Verificado' : 'Consultar'
      }));

      return res.status(200).json(contactos);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  // ====================================================
  // RUTA 2: GESTIÓN Y VALIDACIÓN DE DISTRIBUIDORES
  // ====================================================
  if (action === 'distributors' || req.method === 'POST') {
    try {
      const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        return res.status(500).json({ error: 'Faltan credenciales de Supabase en las variables de entorno.' });
      }

      const supabase = createClient(supabaseUrl, supabaseKey);

      // GET: Cargar cuentas asignadas
      if (req.method === 'GET') {
        const distInfo = DISTRIBUTOR_RULES[user];
        if (!distInfo) return res.status(401).json({ error: 'Distribuidor no autorizado en la matriz.' });

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

      // POST: Validación y Registro estricto de cuentas
      if (req.method === 'POST') {
        const { user: postUser, customerName, taxId } = req.body || {};
        const distInfo = DISTRIBUTOR_RULES[postUser];
        if (!distInfo) return res.status(401).json({ error: 'Distribuidor no autorizado.' });

        const cleanName = (customerName || '').trim().toUpperCase();
        if (!cleanName) return res.status(400).json({ error: 'Nombre de cliente inválido.' });

        // 1. Buscar coincidencias por nombre
        const { data: existing, error: searchError } = await supabase
          .from('customer_accounts')
          .select('*')
          .ilike('customer_name', `%${cleanName}%`);

        if (searchError) throw searchError;

        const records = existing || [];

        // 2. BLOQUEO DE CUENTA PROTEGIDA (Venta Directa o Estatus Locked)
        const directMatch = records.find(c => 
          c.account_group === 'Direct sale' || 
          c.status === 'Locked' ||
          c.customer_name.toUpperCase().includes('BOCAR')
        );

        if (directMatch) {
          return res.status(403).json({
            blocked: true,
            penaltyNotice: true,
            message: `AVISO DE CUMPLIMIENTO COMERCIAL: La empresa "${directMatch.customer_name}" está clasificada como CUENTA PROTEGIDA DE VENTA DIRECTA por REGO-FIX México. Queda estrictamente prohibido cotizar, promover o suministrar producto a esta entidad. La detección de actividad comercial no autorizada conllevará la reclasificación inmediata de su categoría con pérdida de descuento comercial, o bien la rescisión definitiva de su contrato de distribución.`
          });
        }

        // 3. BLOQUEO DE DUPLICADOS O ASIGNACIÓN A OTRO DISTRIBUIDOR
        const existingDist = records.find(c => c.customer_name.toUpperCase() === cleanName);
        if (existingDist) {
          if (!existingDist.salesman.toLowerCase().includes(distInfo.name.toLowerCase())) {
            return res.status(409).json({
              error: `La cuenta "${existingDist.customer_name}" ya se encuentra asignada a otra firma de distribución (${existingDist.salesman}).`
            });
          } else {
            return res.status(409).json({
              error: `La cuenta "${cleanName}" ya está dada de alta en su lista de clientes asignados.`
            });
          }
        }

        // 4. Inserción de cuenta nueva libre
        const { data: newAccount, error: insertError } = await supabase
          .from('customer_accounts')
          .insert([{
            tax_id: taxId || null,
            customer_name: cleanName,
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
          message: `Cuenta "${cleanName}" registrada y asignada exitosamente a ${distInfo.name}.`
        });
      }

    } catch (err) {
      console.error(err);
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(400).json({ error: 'Parámetros insuficientes.' });
}
