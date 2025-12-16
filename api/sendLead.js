// /api/sendLead.js
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ ok: false, error: "Method Not Allowed" });
  }

  try {
    const GAS_URL =
      "https://script.google.com/macros/s/AKfycbyWk9LwQiIxeYxt7FWdzLLEOWaZQwjP4WAEEElwBVwZ99U-2WpVE1uYC5oxW7OwrEeXBQ/exec";

    const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});

    // Acepta payload legacy (ticket) y payload nuevo (session/final)
    const ticket = body.ticket || null;
    const session = body.session || null;
    const finalPack = body.final || null;

    // Normaliza SIEMPRE a campos planos (lo que tu email/GAS ya imprime)
    const normalized = ticket
      ? {
          empresa: ticket.empresa || "",
          contacto: ticket.nombre || ticket.contacto || "",
          puesto: ticket.puesto || ticket.rol || "",
          telefono: ticket.whatsapp || ticket.telefono || "",
          email: ticket.email || "",
          ciudad: ticket.ciudad || "",
          estado: ticket.estado || "",
          industria: ticket.industria || "",
          maquinas: ticket.maquinas || "",
          interes: ticket.tema || ticket.interes || "",
          resumen: ticket.resumen || "",
          datos_tecnicos: ticket.datos_tecnicos || "",
        }
      : {
          empresa: session?.contacto?.empresa || "",
          contacto: session?.contacto?.nombre || "",
          puesto: session?.contacto?.rol || "",
          telefono: session?.contacto?.whatsapp || "",
          email: session?.contacto?.email || "",
          ciudad: session?.contacto?.ciudad || "",
          estado: session?.contacto?.estado || "",
          industria: session?.tecnico?.proceso || "",
          maquinas: [session?.tecnico?.maquina, session?.tecnico?.control].filter(Boolean).join(" | "),
          interes: [session?.producto, session?.track, session?.comercial?.tipo_interes].filter(Boolean).join(" | "),
          resumen: finalPack?.summary_for_miguel || "",
          datos_tecnicos: [
            session?.tecnico?.operacion ? `Operación: ${session.tecnico.operacion}` : "",
            session?.tecnico?.material ? `Material: ${session.tecnico.material}` : "",
            session?.tecnico?.meta ? `Meta: ${session.tecnico.meta}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        };

    const payloadToGAS = {
      ...normalized,
      pagePath: body.pagePath || "",
      // Para debug (quítalo cuando ya funcione)
      raw: body,
    };

    const upstream = await fetch(GAS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloadToGAS),
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
    console.error("Proxy error:", err);
    return res.status(500).json({ ok: false, error: String(err) });
  }
}
