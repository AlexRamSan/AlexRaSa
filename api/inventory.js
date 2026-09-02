import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
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

        // 1. Si es GET, consultamos el inventario completo
        if (req.method === 'GET') {
            const { data, error } = await supabase.from('inventory').select('sku, stock');
            if (error) throw error;
            return res.status(200).json(data);
        }

        // 2. Si es POST, actualizamos el stock (Ingreso o Salida)
        if (req.method === 'POST') {
            const { sku, quantityChange } = req.body;
            
            if (!sku || quantityChange === undefined) {
                return res.status(400).json({ error: "Faltan datos (SKU o quantityChange)." });
            }

            // Buscamos el producto en la base de datos
            const { data: item, error: fetchError } = await supabase
                .from('inventory')
                .select('stock')
                .eq('sku', sku)
                .single();

            if (fetchError || !item) {
                return res.status(404).json({ error: 'SKU no encontrado en la Base de Datos.' });
            }

            // Calculamos el nuevo stock (evitando números negativos)
            const newStock = Math.max(0, item.stock + quantityChange);

            // Actualizamos en Supabase
            const { error: updateError } = await supabase
                .from('inventory')
                .update({ stock: newStock, last_updated: new Date() })
                .eq('sku', sku);

            if (updateError) throw updateError;

            return res.status(200).json({ success: true, sku, newStock });
        }

        return res.status(405).json({ error: 'Método no permitido.' });

    } catch (error) {
        console.error("Error en inventory.js:", error);
        return res.status(500).json({ error: error.message || 'Error interno en el servidor de inventario.' });
    }
}
