import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PUT');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            return res.status(500).json({ error: "Faltan las credenciales de Supabase en Vercel." });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. GET: Consultar inventario completo
        if (req.method === 'GET') {
            const { data, error } = await supabase.from('inventory').select('*').order('sku', { ascending: true });
            if (error) throw error;
            return res.status(200).json(data);
        }

        // 2. POST: Manejar movimiento o auto-creación asegurando el campo 'name'
        if (req.method === 'POST') {
            const { sku, quantityChange, initialStock, name } = req.body;
            
            if (!sku) {
                return res.status(400).json({ error: "Falta el SKU." });
            }

            const { data: item, error: fetchError } = await supabase
                .from('inventory')
                .select('stock')
                .eq('sku', sku)
                .single();

            // Si NO existe, lo creamos asignando un nombre por defecto para cumplir con la BD
            if (fetchError || !item) {
                const startingStock = initialStock !== undefined ? initialStock : (quantityChange > 0 ? quantityChange : 0);
                const productName = name || `Pieza REGO-FIX ${sku}`;

                const { error: insertError } = await supabase
                    .from('inventory')
                    .insert([{ sku: sku, name: productName, stock: startingStock, last_updated: new Date() }]);

                if (insertError) throw insertError;
                return res.status(200).json({ success: true, sku, newStock: startingStock, created: true });
            }

            // Si YA existe, calculamos el nuevo stock
            const change = quantityChange !== undefined ? quantityChange : 0;
            const newStock = Math.max(0, item.stock + change);

            const { error: updateError } = await supabase
                .from('inventory')
                .update({ stock: newStock, last_updated: new Date() })
                .eq('sku', sku);

            if (updateError) throw updateError;

            return res.status(200).json({ success: true, sku, newStock, created: false });
        }

        // 3. PUT: Modificación manual completa (Ajustar stock exacto o nombre)
        if (req.method === 'PUT') {
            const { sku, stock, name } = req.body;
            
            if (!sku) {
                return res.status(400).json({ error: "Falta el SKU." });
            }

            const updateFields = { last_updated: new Date() };
            if (stock !== undefined) updateFields.stock = parseInt(stock);
            if (name !== undefined) updateFields.name = name;

            const { error: updateError } = await supabase
                .from('inventory')
                .update(updateFields)
                .eq('sku', sku);

            if (updateError) throw updateError;

            return res.status(200).json({ success: true, message: "Actualizado correctamente." });
        }

        return res.status(405).json({ error: 'Método no permitido.' });

    } catch (error) {
        console.error("Error en inventory.js:", error);
        return res.status(500).json({ error: error.message || 'Error interno en el servidor de inventario.' });
    }
}
