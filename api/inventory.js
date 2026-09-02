import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

export default async function handler(req, res) {
  // Configuración de CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // 1. GET: Consultar inventario completo ordenado
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('inventory')
        .select('sku, stock')
        .order('sku', { ascending: true });

      if (error) throw error;
      return res.status(200).json(data);
    }

    // 2. POST: Manejar movimiento o auto-creación
    if (req.method === 'POST') {
      const { sku, quantityChange, initialStock } = req.body || {};

      if (!sku) {
        return res.status(400).json({ error: 'Falta el SKU.' });
      }

      // Buscar si el SKU ya existe
      const { data: item, error: fetchError } = await supabase
        .from('inventory')
        .select('stock')
        .eq('sku', sku)
        .maybeSingle();

      if (fetchError) throw fetchError;

      // Si NO existe, lo creamos automáticamente
      if (!item) {
        const startingStock = initialStock !== undefined 
          ? Number(initialStock) 
          : (Number(quantityChange) > 0 ? Number(quantityChange) : 0);

        const { error: insertError } = await supabase
          .from('inventory')
          .insert([{ sku, stock: startingStock, last_updated: new Date().toISOString() }]);

        if (insertError) throw insertError;
        return res.status(200).json({ success: true, sku, newStock: startingStock, created: true });
      }

      // Si YA existe, calculamos el nuevo stock asegurando tipos numéricos
      const change = quantityChange !== undefined ? Number(quantityChange) : 0;
      const currentStock = Number(item.stock) || 0;
      const newStock = Math.max(0, currentStock + change);

      const { error: updateError } = await supabase
        .from('inventory')
        .update({ stock: newStock, last_updated: new Date().toISOString() })
        .eq('sku', sku);

      if (updateError) throw updateError;
      return res.status(200).json({ success: true, sku, newStock, created: false });
    }

    // 3. PUT: Carga masiva o actualización manual directa en lote (Batch Upsert)
    if (req.method === 'PUT') {
      const { items } = req.body || {};

      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'El formato debe ser un arreglo no vacío de elementos.' });
      }

      const now = new Date().toISOString();
      const payload = items.map(el => ({
        sku: el.sku,
        stock: Number(el.stock) || 0,
        last_updated: now
      }));

      // Una sola petición a Supabase para todo el arreglo
      const { error: upsertError } = await supabase
        .from('inventory')
        .upsert(payload, { onConflict: 'sku' });

      if (upsertError) throw upsertError;

      return res.status(200).json({ 
        success: true, 
        message: `${payload.length} productos actualizados correctamente.` 
      });
    }

    return res.status(405).json({ error: 'Método no permitido.' });

  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error interno del servidor.' });
  }
}
