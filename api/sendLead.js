// /api/sendLead.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  try {
    const GAS_URL = 'https://script.google.com/macros/s/AKfycbwrg-93tIvGCd-W0eQprDGrBIIkotM41McJplAItc_mPKDvjpjedFwmAziw9jWQWxRWvQ/exec';

    // El cuerpo que mandó tu formulario
    const payload = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

    // Reenvía al Web App de Google (server-side => sin CORS)
    const upstream = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    });

    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { ok: upstream.ok, raw: text }; }

    return res.status(upstream.status).json(data);
  } catch (err) {
    console.error('Proxy error:', err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
