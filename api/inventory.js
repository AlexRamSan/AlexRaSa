import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Faltan credenciales de Supabase en variables de entorno.' });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // 1. GET: Consultar todo el inventario
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('inventory')
        .select('*')
        .order('sku', { ascending: true });

      if (error) throw error;
      return res.status(200).json(data || []);
    }

    // 2. POST: Dar de alta, ingresar o dar de baja cantidades
    if (req.method === 'POST') {
      const { sku, name, quantityChange = 0, initialStock = 0 } = req.body || {};

      if (!sku) {
        return res.status(400).json({ error: 'El SKU es obligatorio.' });
      }

      const cleanSku = sku.trim();
      const change = parseInt(quantityChange, 10) || 0;

      // Buscar si el producto ya existe
      const { data: existing, error: searchError } = await supabase
        .from('inventory')
        .select('*')
        .eq('sku', cleanSku)
        .maybeSingle();

      if (searchError) throw searchError;

      if (!existing) {
        // Producto nuevo: se registra con el stock inicial indicado
        const initQty = Math.max(0, parseInt(initialStock, 10) || change || 0);
        const { data: inserted, error: insertError } = await supabase
          .from('inventory')
          .insert([{
            sku: cleanSku,
            name: name ? name.trim() : 'Herramienta REGO-FIX',
            stock: initQty,
            last_updated: new Date().toISOString()
          }])
          .select()
          .single();

        if (insertError) throw insertError;
        return res.status(200).json({ success: true, item: inserted, message: 'Producto nuevo creado con éxito.' });
      }

      // Producto existente: sumar o restar la cantidad indicada
      const updatedStock = Math.max(0, existing.stock + change);

      const { data: updated, error: updateError } = await supabase
        .from('inventory')
        .update({
          stock: updatedStock,
          name: name ? name.trim() : existing.name,
          last_updated: new Date().toISOString()
        })
        .eq('sku', cleanSku)
        .select()
        .single();

      if (updateError) throw updateError;

      return res.status(200).json({
        success: true,
        item: updated,
        message: `Stock de ${cleanSku} actualizado: ${updatedStock} pzas (${change >= 0 ? '+' : ''}${change})`
      });
    }

    return res.status(405).json({ error: 'Método no permitido.' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
