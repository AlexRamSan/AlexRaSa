const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

module.exports = async (req, res) => {
    // Configuración para permitir conexiones seguras (CORS)
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') return res.status(200).end();

    // Cuando la tienda pide el inventario
    if (req.method === 'GET') {
        const { data, error } = await supabase.from('inventory').select('sku, stock');
        if (error) return res.status(500).json({ error: error.message });
        return res.status(200).json(data);
    }

    // Cuando el escáner actualiza el inventario
    if (req.method === 'POST') {
        const { sku, quantityChange } = req.body;
        try {
            const { data: item, error: fetchError } = await supabase.from('inventory').select('stock').eq('sku', sku).single();
            if (fetchError || !item) return res.status(404).json({ error: 'SKU no encontrado' });

            const newStock = Math.max(0, item.stock + quantityChange);
            const { error: updateError } = await supabase.from('inventory').update({ stock: newStock, last_updated: new Date() }).eq('sku', sku);
            if (updateError) throw updateError;

            return res.status(200).json({ success: true, sku, newStock });
        } catch (error) {
            return res.status(500).json({ error: error.message });
        }
    }

    res.status(405).json({ error: 'Method Not Allowed' });
};
