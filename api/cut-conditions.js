// api/cut-conditions.js

const ISO_DATA = {
  P: { name: "Aceros", vc: 160, fz: 0.06 },
  M: { name: "Inoxidables", vc: 95, fz: 0.045 },
  K: { name: "Fundiciones", vc: 180, fz: 0.10 },
  N: { name: "No Ferrosos", vc: 550, fz: 0.18 },
  S: { name: "Superaleaciones / Ti", vc: 50, fz: 0.035 },
  H: { name: "Duros >50HRC", vc: 45, fz: 0.02 }
};

export default async function handler(req, res) {
  const { material_texto, tool_material, aplicacion, diametro, largo, z, coolant } = req.body;
  const d = parseFloat(diametro);

  // 1. CLASIFICACIÓN IA DEL MATERIAL
  const aiClass = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: "Clasifica material en categoría ISO (P,M,K,N,S,H). Devuelve JSON: {iso: 'P', hrc: '30'}" }],
      response_format: { type: "json_object" }
    })
  });
  const { iso, hrc } = JSON.parse((await aiClass.json()).choices[0].message.content);
  const base = ISO_DATA[iso] || ISO_DATA.P;

  // 2. MATRIZ DE DECISIÓN DE SISTEMA (ER vs PG vs SG)
  let sistema = "";
  let pinza = "";
  let tir = "0.003mm";
  let factor_rigidez = 1.0;

  if (aplicacion.includes("Roscado")) {
    sistema = "ER-TAP o PG-TAP";
    pinza = `Pinza con Cuadradillo (GT)`;
    tir = "0.010mm";
  } else if (d < 3) {
    sistema = "micRun (MR)";
    pinza = `MR ${d <= 1.5 ? '11' : '16'} (UP)`;
    tir = "0.002mm";
    factor_rigidez = 1.15;
  } else if ((iso === 'S' || iso === 'M') && aplicacion.includes("Desbaste") && d >= 10) {
    sistema = "secuRgrip (SG) - Anti Pull-out";
    pinza = `PG-SG Heavy Duty`;
    factor_rigidez = 1.40;
  } else if (aplicacion.includes("Acabado") && d > 6) {
    sistema = "powRgrip (PG) Standard";
    pinza = `PG ${d <= 12 ? '15' : '25'} Standard`;
    factor_rigidez = 1.25;
  } else {
    sistema = "ER Ultra-Precisión (UP)";
    pinza = `ER ${d <= 10 ? '16' : '32'} UP`;
    tir = "0.005mm";
    factor_rigidez = 1.10;
  }

  // 3. CÁLCULOS TÉCNICOS
  const t_factor = tool_material === "HSS" ? 0.35 : (tool_material === "Ceramica" ? 2.2 : 1.0);
  const v_opt = Math.round((base.vc * t_factor * 1000) / (Math.PI * d));
  const f_opt = Math.round(v_opt * parseInt(z) * (base.fz * factor_rigidez));

  // 4. DICTAMEN IA BASADO EN CATÁLOGO
  const aiDictamen = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: `Material: ${material_texto}. Operación: ${aplicacion}. Sistema Elegido: ${sistema}. RPM: ${v_opt}, Feed: ${f_opt}. Justifica técnicamente por qué este sistema (ER, PG o SG) es el ideal según los estándares suizos de REGO-FIX.` }]
    })
  });

  const finalRes = await aiDictamen.json();

  res.status(200).json({
    sistema, pinza, tir,
    new_rpm: v_opt,
    new_feed: f_opt,
    material_detectado: `${base.name} (~${hrc} HRC)`,
    nota: finalRes.choices[0].message.content
  });
}
