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
        const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            return res.status(500).json({ error: "Faltan las credenciales de Supabase en Vercel (SUPABASE_URL / SUPABASE_SERVICE_KEY)." });
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        // 1. GET: Consultar inventario completo
        if (req.method === 'GET') {
            const { data, error } = await supabase
                .from('inventory')
                .select('*')
                .order('sku', { ascending: true });
                
            if (error) throw error;
            return res.status(200).json(data || []);
        }

        // 2. POST: Manejar movimiento o auto-creación
        if (req.method === 'POST') {
            const { sku, quantityChange, initialStock, name } = req.body || {};
            
            if (!sku) {
                return res.status(400).json({ error: "Falta el SKU." });
            }

            const cleanSku = String(sku).trim();
            const nowIso = new Date().toISOString();

            // Buscar si el SKU ya existe
            const { data: item, error: fetchError } = await supabase
                .from('inventory')
                .select('stock, name')
                .eq('sku', cleanSku)
                .maybeSingle();

            if (fetchError) throw fetchError;

            // Si NO existe, se crea
            if (!item) {
                const startingStock = initialStock !== undefined 
                    ? Math.max(0, parseInt(initialStock, 10) || 0)
                    : Math.max(0, parseInt(quantityChange, 10) || 0);

                const productName = name || `Pieza REGO-FIX ${cleanSku}`;

                const { error: insertError } = await supabase
                    .from('inventory')
                    .insert([{ 
                        sku: cleanSku, 
                        name: productName, 
                        stock: startingStock, 
                        last_updated: nowIso 
                    }]);

                if (insertError) throw insertError;
                return res.status(200).json({ success: true, sku: cleanSku, newStock: startingStock, created: true });
            }

            // Si YA existe, calculamos el nuevo stock sumando o restando la cantidad recibida
            const change = quantityChange !== undefined ? (parseInt(quantityChange, 10) || 0) : 0;
            const currentStock = parseInt(item.stock, 10) || 0;
            const newStock = Math.max(0, currentStock + change);

            const { error: updateError } = await supabase
                .from('inventory')
                .update({ 
                    stock: newStock, 
                    last_updated: nowIso 
                })
                .eq('sku', cleanSku);

            if (updateError) throw updateError;

            return res.status(200).json({ success: true, sku: cleanSku, newStock: newStock, created: false });
        }

        // 3. PUT: Modificación manual completa
        if (req.method === 'PUT') {
            const { sku, stock, name } = req.body || {};
            
            if (!sku) {
                return res.status(400).json({ error: "Falta el SKU." });
            }

            const cleanSku = String(sku).trim();
            const updateFields = { last_updated: new Date().toISOString() };
            
            if (stock !== undefined) updateFields.stock = Math.max(0, parseInt(stock, 10) || 0);
            if (name !== undefined) updateFields.name = name;

            const { error: updateError } = await supabase
                .from('inventory')
                .update(updateFields)
                .eq('sku', cleanSku);

            if (updateError) throw updateError;

            return res.status(200).json({ success: true, message: "Actualizado correctamente." });
        }

        return res.status(405).json({ error: 'Método no permitido.' });

    } catch (error) {
        console.error("Error en inventory.js:", error);
        return res.status(500).json({ error: error.message || 'Error interno en la base de datos de inventario.' });
    }
}
