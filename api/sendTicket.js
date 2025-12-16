// /api/sendTicket.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const GAS_URL =
      "https://script.google.com/macros/s/AKfycbyWk9LwQiIxeYxt7FWdzLLEOWaZQwjP4WAEEElwBVwZ99U-2WpVE1uYC5oxW7OwrEeXBQ/exec";

    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const t = body?.ticket || body || {};

    // Payload compatible con tu sheet/form
    const payload = {
      id: crypto.randomUUID(),
      fecha: new Date().toLocaleDateString("es-MX"),
      createdAt: new Date().toISOString(),

      empresa: t.empresa || "No especificado",
      contacto: t.nombre || "No especificado",
      puesto: "Soporte (Chatbot)",

      telefono: t.whatsapp || "No especificado",
      email: t.email || "No especificado",

      ciudad: t.ciudad || "No especificado",
      estado: t.estado || "No especificado",
      industria: t.industria || "No especificado",

      interes: t.tema || "Soporte manufactura",
      maquinas: "",
      origen: "Chatbot",
      nextDate: "",

      notas: [
        `RESUMEN: ${t.resumen || ""}`.trim(),
        `DATOS: ${t.datos_tecnicos || ""}`.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    };

    const upstream = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const text = await upstream.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { ok: upstream.ok, raw: text };
    }

    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
