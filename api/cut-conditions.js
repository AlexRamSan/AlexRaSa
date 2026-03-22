// api/cut-conditions.js

const ISO_MAP = {
  P: { name: "Aceros", vc_base: 160, fz_base: 0.06 },
  M: { name: "Inoxidables", vc_base: 90, fz_base: 0.04 },
  K: { name: "Fundiciones", vc_base: 180, fz_base: 0.10 },
  N: { name: "No Ferrosos", vc_base: 450, fz_base: 0.15 },
  S: { name: "Superaleaciones", vc_base: 45, fz_base: 0.03 },
  H: { name: "Duros >50HRC", vc_base: 50, fz_base: 0.02 }
};

export default async function handler(req, res) {
  const { material_texto, tool_material, aplicacion, diametro, largo, z } = req.body;
  const d = parseFloat(diametro);

  // 1. LLAMADA A IA PARA CLASIFICACIÓN TÉCNICA
  const aiClassification = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Eres un experto en materiales ISO (P,M,K,N,S,H). Clasifica el material del usuario y devuelve JSON: {iso_cat: 'P', dureza_est: '30HRC', factor_abrasion: 1.0}" },
        { role: "user", content: `Clasifica este material: ${material_texto}` }
      ],
      response_format: { type: "json_object" }
    })
  });

  const { iso_cat, dureza_est } = (await aiClassification.json()).choices[0].message.content;
  const base = ISO_MAP[iso_cat] || ISO_MAP.P;

  // 2. AJUSTE POR MATERIAL DE HERRAMIENTA
  let tool_factor = tool_material === "HSS" ? 0.3 : (tool_material === "Ceramica" ? 2.5 : 1.0);
  
  // 3. SELECCIÓN DE HOLDER (Educada por catálogo REGO-FIX)
  let holder = d <= 6 ? "PG 10" : d <= 12 ? "PG 15" : d <= 20 ? "PG 25" : "PG 32";
  if (d >= 12 && (iso_cat === 'S' || iso_cat === 'M')) holder += " secuRgrip (SG)";

  // 4. CÁLCULO DE CONDICIONES ÓPTIMAS
  let v_opt = Math.round((base.vc_base * tool_factor * 1000) / (Math.PI * d));
  let f_opt = Math.round(v_opt * parseInt(z) * (base.fz_base * 1.30)); // +30% por rigidez PG

  const promptFinal = `Como Ingeniero REGO-FIX, justifica por qué para ${material_texto} (${iso_cat}) con herramienta de ${tool_material}, el ensamble ${holder} es la mejor opción. 
  RPM: ${v_opt}, Avance: ${f_opt}. Menciona que la operación de ${aplicacion} se verá beneficiada por el TIR < 3um.`;

  const dictamen = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: promptFinal }]
    })
  });

  const finalRes = await dictamen.json();

  res.status(200).json({
    holder,
    new_rpm: v_opt,
    new_feed: f_opt,
    material_detectado: `${base.name} (~${dureza_est})`,
    nota: finalRes.choices[0].message.content
  });
}
