// api/cut-conditions.js

const ISO_MAP = {
  P: { name: "Aceros", vc_base: 160, fz_base: 0.06 },
  M: { name: "Inoxidables", vc_base: 95, fz_base: 0.045 },
  K: { name: "Fundiciones", vc_base: 180, fz_base: 0.10 },
  N: { name: "No Ferrosos", vc_base: 550, fz_base: 0.18 },
  S: { name: "Superaleaciones / Ti", vc_base: 50, fz_base: 0.035 },
  H: { name: "Duros >50HRC", vc_base: 45, fz_base: 0.02 }
};

const TOOL_FACTORS = { "Carburo": 1.0, "HSS": 0.35, "Ceramica": 2.2 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  const { material_texto, tool_material, aplicacion, diametro, largo, z, coolant } = req.body;
  const d = parseFloat(diametro);

  // 1. Clasificación del Material vía IA
  const aiClass = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: "Clasifica el material en categoría ISO (P,M,K,N,S,H) y estima HRC. Devuelve JSON: {iso: 'P', hrc: '32'}" }],
      response_format: { type: "json_object" }
    })
  });
  const { iso, hrc } = JSON.parse((await aiClass.json()).choices[0].message.content);
  const base = ISO_MAP[iso] || ISO_MAP.P;

  // 2. Selección de Ensamble (Educado por Catálogo REGO-FIX)
  let holder = "";
  let collet = "";
  let tir = "0.003mm";

  // Lógica secuRgrip (SG) vs powRgrip (PG) vs micRun (MR)
  if (d < 3) {
    holder = "micRun (MR) High Precision";
    collet = `MR ${d <= 1.5 ? '11' : '16'} Ultra-Precision`;
    tir = "0.002mm";
  } else {
    // Rango de Diámetros PG (image_7.png)
    let pg_size = d <= 6 ? "10" : d <= 12 ? "15" : d <= 20 ? "25" : "32";
    
    // Activación de secuRgrip (SG) - image_8.png
    const requiereSG = (iso === 'S' || iso === 'M' || aplicacion.includes("Desbaste")) && d >= 10;
    
    if (requiereSG) {
      holder = `PG ${pg_size} HD-SG (Heavy Duty)`;
      collet = `PG ${pg_size}-SG secuRgrip`;
    } else {
      holder = `powRgrip (PG) ${pg_size}`;
      collet = `PG ${pg_size} Standard / ${coolant.includes("Interno") ? 'DM' : 'CF'}`;
    }
  }

  // 3. Cálculos de Ingeniería (Fórmulas Reales)
  const t_factor = TOOL_FACTORS[tool_material] || 1.0;
  const v_opt = Math.round((base.vc_base * t_factor * 1000) / (Math.PI * d));
  const f_opt = Math.round(v_opt * parseInt(z) * (base.fz_base * 1.30)); // +30% por rigidez suiza

  // 4. Dictamen Final
  const aiDictamen = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: `Material: ${material_texto} (${iso}). Holder: ${holder}. RPM: ${v_opt}, Feed: ${f_opt}. Explica por qué TIR < 3um y el balanceo G2.5 benefician esta operación de ${aplicacion}.` }]
    })
  });

  const finalRes = await aiDictamen.json();

  res.status(200).json({
    holder, collet, tir,
    new_rpm: v_opt,
    new_feed: f_opt,
    mat_info: `${base.name} (~${hrc} HRC)`,
    nota: finalRes.choices[0].message.content
  });
}
