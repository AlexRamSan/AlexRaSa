import { createClient } from '@supabase/supabase-js';
import jsforce from 'jsforce';

// Configuración de conexión a Salesforce (usa variables de entorno seguras)
const conn = new jsforce.Connection({
  loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com'
});

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
      throw new Error("Tabla distributors vacía o no encontrada");
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

  // 2. RUTA: NOTIFICACIÓN INTERNA POR DESCARGA DE PDF O EVENTO INTERNO
  if (action === 'internal_sales_notification' && req.method === 'POST') {
    try {
      const { action: subAction, distributor, client, items = [], totals = {}, leadTime, htmlDocument } = req.body || {};

      let quoteId = null;
      let oppId = null;

      const subtotalVal = Number(totals.subtotalNet !== undefined ? totals.subtotalNet : totals.subtotal) || 0;
      const totalVal = Number(totals.total) || 0;
      const ivaVal = Number(totals.iva) || (subtotalVal * 0.16);

      // Sincronización opcional con Salesforce
      try {
        if (process.env.SF_USER && process.env.SF_PASSWORD) {
          await conn.login(process.env.SF_USER, process.env.SF_PASSWORD + (process.env.SF_TOKEN || ''));
          
          const oppResult = await conn.sobject("Opportunity").create({
            Name: `B2B - ${client} (${distributor?.name || 'Distribuidor'})`,
            StageName: 'Prospecting',
            CloseDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            Description: `Cotización generada en portal B2B. Acción: ${subAction}. Tiempo de entrega: ${leadTime}`
          });

          if (oppResult.success) {
            oppId = oppResult.id;
            const quoteResult = await conn.sobject("Quote").create({
              Name: `QT-B2B-${Date.now()}`,
              OpportunityId: oppId,
              TotalPrice: subtotalVal,
              Status: 'Presented',
              Description: `Total con IVA: $${totalVal.toFixed(2)} USD`
            });
            quoteId = quoteResult.id;
          }
        }
      } catch (sfErr) {
        console.warn('Advertencia Salesforce (no crítico):', sfErr.message);
      }

      // Si el frontend envió el formato oficial membretado completo, se usa como cuerpo principal
      let bodyHtml = htmlDocument;

      if (!bodyHtml) {
        const itemsHtml = items.map(it => {
          const lPrice = Number(it.listPrice !== undefined ? it.listPrice : it.price) || 0;
          const tNet = Number(it.totalNet !== undefined ? it.totalNet : it.total) || 0;
          return `
            <tr>
              <td style="padding:6px;border:1px solid #ddd;font-family:monospace;">${it.sku}</td>
              <td style="padding:6px;border:1px solid #ddd;">${it.name}</td>
              <td style="padding:6px;border:1px solid #ddd;text-align:center;">${it.qty}</td>
              <td style="padding:6px;border:1px solid #ddd;text-align:right;">$${lPrice.toFixed(2)} USD</td>
              <td style="padding:6px;border:1px solid #ddd;text-align:right;">$${tNet.toFixed(2)} USD</td>
            </tr>
          `;
        }).join('');

        bodyHtml = `
          <h2 style="color: #003DA5;">Notificación de Cotización B2B REGO-FIX</h2>
          <p><strong>Distribuidor:</strong> ${distributor?.name || 'N/A'} (${distributor?.tier || distributor?.category || 'N/A'})</p>
          <p><strong>Cliente Final:</strong> ${client}</p>
          <p><strong>Acción Realizada:</strong> ${subAction === 'DESCARGA_PDF' || subAction === 'PDF_DOWNLOAD' ? 'Descarga de Cotización (PDF)' : 'Notificación de Cotización'}</p>
          <p><strong>Fecha:</strong> ${new Date().toLocaleString()}</p>
          ${oppId ? `<p><strong>Salesforce Oportunidad ID:</strong> ${oppId} (Quote:${quoteId})</p>` : ''}
          <div style="background:#f0f7ff;border-left:4px solid #003DA5;padding:10px;margin:15px 0;font-size:14px;">
            <strong>Tiempo de Entrega Estimado:</strong> ${leadTime}
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:13px;margin:15px 0;">
            <thead>
              <tr style="background:#003DA5;color:#fff;">
                <th style="padding:6px;border:1px solid #ddd;">SKU</th>
                <th style="padding:6px;border:1px solid #ddd;">Producto</th>
                <th style="padding:6px;border:1px solid #ddd;">Cant.</th>
                <th style="padding:6px;border:1px solid #ddd;">P. Lista</th>
                <th style="padding:6px;border:1px solid #ddd;">Importe</th>
              </tr>
            </thead>
            <tbody>${itemsHtml}</tbody>
          </table>
          <p style="text-align:right;font-size:14px;">
            <strong>Subtotal:</strong> $${subtotalVal.toFixed(2)} USD<br>
            <strong>IVA (16%):</strong> $${ivaVal.toFixed(2)} USD<br>
            <strong style="color:#003DA5;font-size:16px;">Total Cotizado:</strong> $${totalVal.toFixed(2)} USD
          </p>
        `;
      }

      // Envío mediante Resend
      const RESEND_API_KEY = process.env.RESEND_API_KEY;
      const targetEmail = 'mramirez@rego-fix.com';

      if (RESEND_API_KEY) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${RESEND_API_KEY}`
          },
          body: JSON.stringify({
            from: 'REGO-FIX B2B <b2b@alexrasa.store>',
            to: [targetEmail],
            subject: `[PDF DESCARGADO] Cotización B2B: ${client} - ${distributor?.name}`,
            html: bodyHtml
          })
        });
      }

      return res.status(200).json({ success: true, message: 'Notificación registrada y enviada.' });
    } catch (e) {
      console.error('Error en internal_sales_notification:', e);
      return res.status(500).json({ error: e.message });
    }
  }

  // 3. RUTA: ENVÍO DE COTIZACIÓN CON EL FORMATO OFICIAL IMPRIMIBLE
  if (action === 'send_quote' && req.method === 'POST') {
    try {
      const { distributor, client, items = [], totals = {}, leadTime, emailTo, internalCopyEmail, htmlDocument } = req.body || {};

      if (!items || items.length === 0) {
        return res.status(400).json({ error: 'No hay partidas en la cotización.' });
      }

      const RESEND_API_KEY = process.env.RESEND_API_KEY;
      const quoteLeadTime = leadTime || 'Entrega inmediata tras recibir orden de compra';

      const subtotalVal = Number(totals.subtotalNet !== undefined ? totals.subtotalNet : totals.subtotal) || 0;
      const totalVal = Number(totals.total) || 0;
      const ivaVal = Number(totals.iva) || (subtotalVal * 0.16);

      // Si el frontend pasó el HTML oficial membretado completo (#printable-quote), se utiliza directamente
      let bodyHtml = htmlDocument;

      if (!bodyHtml) {
        const itemsHtml = items.map(it => {
          const lPrice = Number(it.listPrice !== undefined ? it.listPrice : it.price) || 0;
          const dPrice = Number(it.distPrice !== undefined ? it.distPrice : it.price) || 0;
          const tNet = Number(it.totalNet !== undefined ? it.totalNet : it.total) || 0;
          return `
            <tr>
              <td style="padding:6px;border:1px solid #ddd;font-family:monospace;font-weight:bold;">${it.sku}</td>
              <td style="padding:6px;border:1px solid #ddd;">${it.name}</td>
              <td style="padding:6px;border:1px solid #ddd;text-align:center;">${it.qty}</td>
              <td style="padding:6px;border:1px solid #ddd;text-align:right;color:#666;text-decoration:line-through;">$${lPrice.toFixed(2)} USD</td>
              <td style="padding:6px;border:1px solid #ddd;text-align:right;font-weight:bold;color:#003DA5;">$${dPrice.toFixed(2)} USD</td>
              <td style="padding:6px;border:1px solid #ddd;text-align:right;font-weight:bold;">$${tNet.toFixed(2)} USD</td>
            </tr>
          `;
        }).join('');

        bodyHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 800px; margin: auto; padding: 20px; border: 1px solid #eee;">
            <h2 style="color: #003DA5; margin-bottom: 5px;">Cotización Oficial - REGO-FIX México</h2>
            <p style="margin: 2px 0;"><strong>Cliente Final:</strong> ${client}</p>
            <p style="margin: 2px 0;"><strong>Emitido por Distribuidor:</strong> ${distributor?.name} (${distributor?.tier || 'Estándar'})</p>
            <div style="background:#f0f7ff;border-left:4px solid #003DA5;padding:10px;margin:15px 0;font-size:14px;">
              <strong>Tiempo de Entrega Estimado:</strong> ${quoteLeadTime}
            </div>
            <table style="width:100%;border-collapse:collapse;font-size:12px;margin:15px 0;">
              <thead>
                <tr style="background:#003DA5;color:#fff;">
                  <th style="padding:6px;border:1px solid #ddd;">SKU</th>
                  <th style="padding:6px;border:1px solid #ddd;">Producto</th>
                  <th style="padding:6px;border:1px solid #ddd;">Cant.</th>
                  <th style="padding:6px;border:1px solid #ddd;">Precio Lista</th>
                  <th style="padding:6px;border:1px solid #ddd;">Precio Dist.</th>
                  <th style="padding:6px;border:1px solid #ddd;">Importe</th>
                </tr>
              </thead>
              <tbody>${itemsHtml}</tbody>
            </table>
            <p style="text-align:right;font-size:14px;line-height:1.6;">
              <strong>Subtotal:</strong> $${subtotalVal.toFixed(2)} USD<br>
              <strong>IVA (16%):</strong> $${ivaVal.toFixed(2)} USD<br>
              <strong style="color:#003DA5;font-size:16px;">Total Cotización:</strong> $${totalVal.toFixed(2)} USD
            </p>
          </div>
        `;
      }

      // Lista única de destinatarios (sin duplicados)
      const recipientsSet = new Set();
      if (emailTo) recipientsSet.add(emailTo);
      if (internalCopyEmail) recipientsSet.add(internalCopyEmail);
      recipientsSet.add('mramirez@rego-fix.com');

      const recipients = Array.from(recipientsSet);

      if (recipients.length > 0 && RESEND_API_KEY) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${RESEND_API_KEY}`
          },
          body: JSON.stringify({
            from: 'REGO-FIX B2B <b2b@alexrasa.store>',
            to: recipients,
            subject: `Cotización Oficial REGO-FIX - Cliente: ${client} (${distributor?.name})`,
            html: bodyHtml
          })
        });
      }

      return res.status(200).json({
        success: true,
        leadTime: quoteLeadTime,
        message: 'Cotización oficial enviada por correo exitosamente.'
      });
    } catch (e) {
      console.error('Error en send_quote:', e);
      return res.status(500).json({ error: e.message });
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
            message: `AVISO DE CUMPLIMIENTO COMERCIAL: La empresa "${directMatch.customer_name}" está clasificada como CUENTA PROTEGIDA DE VENTA DIRECTA por REGO-FIX México. Queda estrictamente prohibido cotizar, promover o suministrar producto a esta entidad.`
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
