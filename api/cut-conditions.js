// api/cut-conditions.js
const ISO_BASE = {
  P: { name: "Acero (P)", vc: 160, fz: 0.06 },
  M: { name: "Inox (M)", vc: 95, fz: 0.045 },
  K: { name: "Fundición (K)", vc: 190, fz: 0.09 },
  N: { name: "Aluminio (N)", vc: 550, fz: 0.16 },
  S: { name: "Titanio/S", vc: 45, fz: 0.035 },
  H: { name: "Duro >50HRC", vc: 50, fz: 0.02 }
};

export default async function handler(req, res) {
  const { material_texto, tool_material, aplicacion, diametro, z, cono } = req.body;
  const d = parseFloat(diametro);

  // 1. Clasificación Rápida
  const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: "Clasifica material en ISO (P,M,K,N,S,H). Devuelve JSON: {iso: 'P'}" }],
      response_format: { type: "json_object" }
    })
  });
  const { iso } = JSON.parse((await aiRes.json()).choices[0].message.content);
  const base = ISO_BASE[iso] || ISO_BASE.P;

  // 2. Selección de Sistema (Regla de Negocio REGO-FIX)
  let holder = "", pinza = "", k_prod = 1.25;
  
  if (d < 3) { holder = `${cono} / MR (micRun)`; pinza = "MR-UP (Ultra Precision)"; }
  else if ((iso === 'S' || iso === 'M') && aplicacion.includes("Desbaste")) { 
    holder = `${cono} / PG-HD`; pinza = "PG-SG (secuRgrip)"; k_prod = 1.40; 
  } else { 
    holder = `${cono} / powRgrip (PG)`; pinza = "PG Standard / CF"; 
  }

  // 3. Cálculo de Condiciones
  const t_k = tool_material === "HSS" ? 0.35 : 1.0;
  const rpm = Math.round((base.vc * t_k * 1000) / (Math.PI * d));
  const feed = Math.round(rpm * parseInt(z) * (base.fz * k_prod));

  // 4. Resumen Ejecutivo (Prompt Corto)
  const aiNota = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: `Material: ${material_texto}. Ensamble: ${holder}. Define en 2 líneas qué mejora de productividad y seguridad (TIR/Pull-out) logramos.` }]
    })
  });

  const notaFinal = await aiNota.json();
  res.status(200).json({
    holder, pinza, rpm, feed,
    mejora: `+${Math.round((k_prod-1)*100)}% en Avance`,
    nota: notaFinal.choices[0].message.content
  });
}
