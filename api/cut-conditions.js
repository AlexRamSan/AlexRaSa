// api/cut-conditions.js
const ISO_DATA = {
  P: { name: "Aceros (P)", vc: 165, fz: 0.06 },
  M: { name: "Inoxidables (M)", vc: 90, fz: 0.045 },
  K: { name: "Fundiciones (K)", vc: 190, fz: 0.09 },
  N: { name: "Aluminios (N)", vc: 550, fz: 0.16 },
  S: { name: "Superaleaciones / Ti (S)", vc: 45, fz: 0.035 },
  H: { name: "Duros >50HRC (H)", vc: 55, fz: 0.025 }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');
  const { material_texto, tool_material, aplicacion, diametro, largo, z, cono } = req.body;
  const d = parseFloat(diametro);

  // 1. Clasificación IA del Material
  const aiClass = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: "Clasifica material en ISO (P,M,K,N,S,H) y HRC. Devuelve JSON: {iso: 'P', hrc: '30'}" }],
      response_format: { type: "json_object" }
    })
  });
  const { iso, hrc } = JSON.parse((await aiClass.json()).choices[0].message.content);
  const base = ISO_DATA[iso] || ISO_DATA.P;

  // 2. Selección de Ensamble Técnica
  let sistema = "", pinza = "", tir = "0.003mm", k_prod = 1.0;

  if (d < 3) {
    sistema = `${cono} / micRun (MR)`;
    pinza = `MR ${d <= 1.5 ? '11' : '16'} UP`;
    tir = "0.002mm"; k_prod = 1.15;
  } else if ((iso === 'S' || iso === 'M') && aplicacion.includes("Desbaste") && d >= 10) {
    sistema = `${cono} / secuRgrip (SG)`;
    pinza = `PG-SG Heavy Duty`;
    k_prod = 1.40;
  } else if (aplicacion.includes("Acabado") || d > 6) {
    sistema = `${cono} / powRgrip (PG)`;
    pinza = `PG ${d <= 12 ? '15' : '25'} Standard`;
    k_prod = 1.25;
  } else {
    sistema = `${cono} / ER UP`;
    pinza = `ER ${d <= 10 ? '16' : '32'} UP`;
    tir = "0.005mm"; k_prod = 1.10;
  }

  // 3. Cálculos
  const tool_k = tool_material === "HSS" ? 0.35 : (tool_material === "Ceramica" ? 2.3 : 1.0);
  const v_opt = Math.round((base.vc * tool_k * 1000) / (Math.PI * d));
  const f_opt = Math.round(v_opt * parseInt(z) * (base.fz * k_prod));

  const aiDictamen = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: `Material: ${material_texto}. Sistema: ${sistema}. RPM: ${v_opt}, Feed: ${f_opt}. Explica por qué este ensamble REGO-FIX es superior para ${aplicacion}.` }]
    })
  });

  const finalRes = await aiDictamen.json();
  res.status(200).json({
    sistema, pinza, tir, new_rpm: v_opt, new_feed: f_opt,
    mat_info: `${base.name} (~${hrc} HRC)`, nota: finalRes.choices[0].message.content
  });
}
