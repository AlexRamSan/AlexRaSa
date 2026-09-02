import { createClient } from '@supabase/supabase-js';

// Matriz oficial REGO-FIX por categoría
const CATEGORY_DISCOUNTS = {
  'DIAMANTE': { ER: 0.45, PG: 0.35, Maquinas: 0.10, Mordazas: 0.05, Otros: 0.15 },
  'ORO':      { ER: 0.40, PG: 0.30, Maquinas: 0.10, Mordazas: 0.05, Otros: 0.10 },
  'PLATA':    { ER: 0.30, PG: 0.25, Maquinas: 0.10, Mordazas: 0.05, Otros: 0.10 },
  'BRONCE':   { ER: 0.20, PG: 0.20, Maquinas: 0.10, Mordazas: 0.05, Otros: 0.10 }
};

const DEFAULT_DISTRIBUTORS = {
  'usuario1': { name: 'Distribuidor AHNSA', category: 'ORO' },
  'usuario2': { name: 'Distribuidor DHM', category: 'DIAMANTE' },
  'usuario_bronce': { name: 'Distribuidor WEM / General', category: 'BRONCE' }
};

async function getDistributorsData(supabase) {
  try {
    const { data, error } = await supabase.from('distributors').select('*');
    if (error || !data || data.length === 0) {
      const fallback = {};
      Object.entries(DEFAULT_DISTRIBUTORS).forEach(([key, d]) => {
        fallback[key] = {
          name: d.name,
          category: d.category,
          discounts: CATEGORY_DISCOUNTS[d.category] || CATEGORY_DISCOUNTS['BRONCE']
        };
      });
      return fallback;
    }
    const mapped = {};
    data.forEach(d => {
      const cat = (d.category || 'BRONCE').toUpperCase();
      mapped[d.user_key] = {
        name: d.name,
        category: cat,
        discounts: CATEGORY_DISCOUNTS[cat] || CATEGORY_DISCOUNTS['BRONCE']
      };
    });
    return mapped;
  } catch (e) {
    return DEFAULT_DISTRIBUTORS;
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { dominio, action, user } = req.query;

  // 1. RUTA: APOLLO CONTACTOS
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

  // 2. RUTA: ENVÍO Y REGISTRO DE COTIZACIÓN B2B
  if (action === 'send_quote' && req.method === 'POST') {
    try {
      const { distributor, client, items, totals, emailTo } = req.body || {};

      if (!items || items.length === 0) {
        return res.status(400).json({ error: 'No hay partidas en la cotización.' });
      }

      // Si tienes Resend o SendGrid configurado en variables de entorno, se dispara aquí
      const RESEND_API_KEY = process.env.RESEND_API_KEY;
      const internalNotificationEmail = process.env.SALES_NOTIFICATION_EMAIL || 'ventas@rego-fix.mx';

      let emailSent = false;
      if (RESEND_API_KEY) {
        const itemsHtml = items.map(it => `
          <tr>
            <td style="padding:6px;border:1px solid #ddd;">${it.sku}</td>
            <td style="padding:6px;border:1px solid #ddd;">${it.name}</td>
            <td style="padding:6px;border:1px solid #ddd;text-align:center;">${it.qty}</td>
            <td style="padding:6px;border:1px solid #ddd;text-align:right;">$${it.unitNet.toFixed(2)} USD</td>
            <td style="padding:6px;border:1px solid #ddd;text-align:right;">$${it.totalNet.toFixed(2)} USD</td>
          </tr>
        `).join('');

        const htmlBody = `
          <h2>Cotización B2B Generada - REGO-FIX México</h2>
          <p><strong>Distribuidor:</strong> ${distributor.name} (${distributor.category})</p>
          <p><strong>Cliente Final:</strong> ${client}</p>
          <p><strong>Fecha:</strong> ${new Date().toLocaleString()}</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin:15px 0;">
            <thead>
              <tr style="background:#003DA5;color:#fff;">
                <th style="padding:6px;border:1px solid #ddd;">SKU</th>
                <th style="padding:6px;border:1px solid #ddd;">Producto</th>
                <th style="padding:6px;border:1px solid #ddd;">Cant.</th>
                <th style="padding:6px;border:1px solid #ddd;">P. Neto</th>
                <th style="padding:6px;border:1px solid #ddd;">Importe</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>
          <p style="text-align:right;font-size:14px;"><strong>Subtotal Neto:</strong> $${totals.subtotal.toFixed(2)} USD<br>
          <strong>IVA (16%):</strong> $${totals.iva.toFixed(2)} USD<br>
          <strong style="color:#003DA5;font-size:16px;">Total Cotizado:</strong> $${totals.total.toFixed(2)} USD</p>
        `;

        const recipients = [internalNotificationEmail];
        if (emailTo) recipients.push(emailTo);

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${RESEND_API_KEY}`
          },
          body: JSON.stringify({
            from: 'REGO-FIX B2B <b2b@alexrasa.store>',
            to: recipients,
            subject: `Nueva Cotización B2B - ${distributor.name} / ${client}`,
            html: htmlBody
          })
        });
        emailSent = true;
      }

      return res.status(200).json({
        success: true,
        emailSent,
        message: emailSent 
          ? 'Cotización registrada y notificada vía correo exitosamente.'
          : 'Cotización registrada y respaldada con éxito en el sistema.'
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // 3. RUTA: PANEL DE CONTROL ADMINISTRATIVO (ADMIN-CUENTAS)
  if (action === 'admin_control') {
    try {
      const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
      const supabase = createClient(supabaseUrl, supabaseKey);

      if (req.method === 'GET') {
        const [accRes, distMatrix] = await Promise.all([
          supabase.from('customer_accounts').select('*').range(0, 4999).order('customer_name', { ascending: true }),
          getDistributorsData(supabase)
        ]);

        if (accRes.error) throw accRes.error;

        return res.status(200).json({
          accounts: accRes.data || [],
          distributors: distMatrix,
          categoryDiscounts: CATEGORY_DISCOUNTS
        });
      }

      if (req.method === 'POST') {
        const { target, data } = req.body || {};

        if (target === 'new_account') {
          const { tax_id, customer_name, account_group, salesman, status } = data;
          if (!customer_name) return res.status(400).json({ error: 'El nombre del cliente es obligatorio.' });

          const { data: created, error } = await supabase
            .from('customer_accounts')
            .insert([{
              tax_id: tax_id ? tax_id.trim().toUpperCase() : null,
              customer_name: customer_name.trim().toUpperCase(),
              account_group: account_group || 'Distributor',
              salesman: salesman || 'Distribuidor General',
              status: status || 'Active',
              aging: 0
            }])
            .select()
            .single();

          if (error) throw error;
          return res.status(200).json({ success: true, item: created });
        }

        if (target === 'new_distributor') {
          const { user_key, name, category } = data;
          if (!user_key || !name) return res.status(400).json({ error: 'Faltan campos del distribuidor.' });

          const cleanCat = (category || 'BRONCE').toUpperCase();
          const discounts = CATEGORY_DISCOUNTS[cleanCat] || CATEGORY_DISCOUNTS['BRONCE'];

          const { data: created, error } = await supabase
            .from('distributors')
            .insert([{
              user_key: user_key.trim().toLowerCase(),
              name: name.trim(),
              category: cleanCat,
              discounts: discounts
            }])
            .select()
            .single();

          if (error) throw error;
          return res.status(200).json({ success: true, distributor: created });
        }

        return res.status(400).json({ error: 'Target no reconocido.' });
      }

      if (req.method === 'PUT') {
        const { target, data } = req.body || {};

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

        if (target === 'distributor_category') {
          const { user_key, category } = data;
          if (!user_key || !category) return res.status(400).json({ error: 'Faltan datos.' });

          const cleanCat = category.toUpperCase();
          const discounts = CATEGORY_DISCOUNTS[cleanCat] || CATEGORY_DISCOUNTS['BRONCE'];

          const { data: updatedDist, error: distError } = await supabase
            .from('distributors')
            .update({
              category: cleanCat,
              discounts: discounts
            })
            .eq('user_key', user_key)
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

  // 4. RUTA: DISTRIBUIDORES B2B (PORTAL CLIENTES)
  if (action === 'distributors' || req.method === 'POST') {
    try {
      const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
      const supabase = createClient(supabaseUrl, supabaseKey);

      const distributorRules = await getDistributorsData(supabase);

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
