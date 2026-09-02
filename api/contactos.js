import { createClient } from '@supabase/supabase-js';

// Matriz por defecto si aún no se inicializa la tabla en Supabase
const DEFAULT_DISTRIBUTOR_RULES = {
  'usuario1': {
    name: 'Distribuidor AHNSA',
    category: 'ORO',
    discounts: { ER: 0.40, PG: 0.30, Maquinas: 0.10, Mordazas: 0.05, Otros: 0.10 }
  },
  'usuario2': {
    name: 'Distribuidor DHM',
    category: 'DIAMANTE',
    discounts: { ER: 0.45, PG: 0.35, Maquinas: 0.10, Mordazas: 0.05, Otros: 0.15 }
  },
  'usuario_bronce': {
    name: 'Distribuidor WEM / General',
    category: 'BRONCE',
    discounts: { ER: 0.20, PG: 0.20, Maquinas: 0.10, Mordazas: 0.05, Otros: 0.10 }
  }
};

async function getDistributorsData(supabase) {
  try {
    const { data, error } = await supabase.from('distributors').select('*');
    if (error || !data || data.length === 0) {
      return DEFAULT_DISTRIBUTOR_RULES;
    }
    const mapped = {};
    data.forEach(d => {
      mapped[d.user_key] = {
        name: d.name,
        category: d.category,
        discounts: typeof d.discounts === 'string' ? JSON.parse(d.discounts) : d.discounts
      };
    });
    return mapped;
  } catch (e) {
    return DEFAULT_DISTRIBUTOR_RULES;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { dominio, action, user } = req.query;

  // ====================================================
  // RUTA 1: BÚSQUEDA DE CONTACTOS APOLLO
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
  // RUTA 2: PANEL DE CONTROL ADMINISTRATIVO (ADMIN-CUENTAS)
  // ====================================================
  if (action === 'admin_control') {
    try {
      const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
      const supabase = createClient(supabaseUrl, supabaseKey);

      // GET: Cargar tanto las cuentas como los distribuidores y sus descuentos
      if (req.method === 'GET') {
        const [accRes, distMatrix] = await Promise.all([
          supabase.from('customer_accounts').select('*').order('customer_name', { ascending: true }),
          getDistributorsData(supabase)
        ]);

        if (accRes.error) throw accRes.error;

        return res.status(200).json({
          accounts: accRes.data || [],
          distributors: distMatrix
        });
      }

      // PUT: Actualizar una cuenta o la matriz de descuento de un distribuidor
      if (req.method === 'PUT') {
        const { target, data } = req.body || {};

        // Actualizar datos de una cuenta comercial
        if (target === 'account') {
          const { id, salesman, status, account_group } = data;
          if (!id) return res.status(400).json({ error: 'Falta el ID de la cuenta.' });

          const updateFields = {};
          if (salesman !== undefined) updateFields.salesman = salesman;
          if (status !== undefined) updateFields.status = status;
          if (account_group !== undefined) updateFields.account_group = account_group;

          const { data: updatedAcc, error: accError } = await supabase
            .from('customer_accounts')
            .update(updateFields)
            .eq('id', id)
            .select()
            .single();

          if (accError) throw accError;
          return res.status(200).json({ success: true, item: updatedAcc });
        }

        // Actualizar categoría y descuentos de un distribuidor
        if (target === 'distributor') {
          const { user_key, name, category, discounts } = data;
          if (!user_key) return res.status(400).json({ error: 'Falta user_key del distribuidor.' });

          const { data: updatedDist, error: distError } = await supabase
            .from('distributors')
            .upsert({
              user_key,
              name,
              category,
              discounts
            }, { onConflict: 'user_key' })
            .select()
            .single();

          if (distError) throw distError;
          return res.status(200).json({ success: true, distributor: updatedDist });
        }

        return res.status(400).json({ error: 'Destino no especificado.' });
      }

    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  // ====================================================
  // RUTA 3: GESTIÓN Y SESIÓN DE DISTRIBUIDORES B2B
  // ====================================================
  if (action === 'distributors' || req.method === 'POST') {
    try {
      const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const distributorRules = await getDistributorsData(supabase);

      // GET: Cuentas asignadas al distribuidor autenticado
      if (req.method === 'GET') {
        const distInfo = distributorRules[user];
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

      // POST: Validación / Registro de cuenta nueva por distribuidor
      if (req.method === 'POST') {
        const { user: postUser, customerName, taxId } = req.body || {};
        const distInfo = distributorRules[postUser];
        if (!distInfo) return res.status(401).json({ error: 'Distribuidor no autorizado.' });

        const cleanName = (customerName || '').trim().toUpperCase();
        if (!cleanName) return res.status(400).json({ error: 'Nombre de cliente inválido.' });

        const { data: existing, error: searchError } = await supabase
          .from('customer_accounts')
          .select('*')
          .ilike('customer_name', `%${cleanName}%`);

        if (searchError) throw searchError;
        const records = existing || [];

        // Regla de Bloqueo de Cuentas Protegidas de Venta Directa
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
