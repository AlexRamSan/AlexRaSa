export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  const { material, herramienta, interfaz, operacion, diametro, z, largo, lubricacion, max_rpm, avance_actual, tiene_actuales, unidad_medida, unidad_avance } = req.body;
  
  // 1. Estandarización de unidades a Métrico (para los cálculos internos)
  let d = parseFloat(diametro);
  let l = parseFloat(largo);
  if (unidad_medida === 'inch') {
    d = d * 25.4;
    l = l * 25.4;
  }

  const maxRpmVal = parseInt(max_rpm) || 99999;
  const numZ = parseInt(z) || 4;

  // Estandarización del avance actual a mm/min para calcular el ROI
  let avance_actual_mm = parseFloat(avance_actual) || 0;
  if (tiene_actuales && avance_actual_mm > 0) {
    if (unidad_avance === 'ipm') avance_actual_mm *= 25.4;
    if (unidad_avance === 'm/min') avance_actual_mm *= 1000;
  }

  const MAT_DB = {
    'P': { vc: 150, fz: 0.08 }, 
    'M': { vc: 80,  fz: 0.05 }, 
    'K': { vc: 120, fz: 0.10 }, 
    'N': { vc: 400, fz: 0.15 }, 
    'S': { vc: 40,  fz: 0.04 }, 
    'H': { vc: 30,  fz: 0.02 }  
  };

  const promptSeleccion = `
    Eres ingeniero de aplicaciones REGO-FIX.
    DATOS: Pieza: ${material}, Herramienta: ${herramienta}, Interfaz: ${interfaz}, Operación: ${operacion}, Ø: ${d}mm, Largo: ${l}mm.

    TAREAS:
    1. Clasifica el material en ISO: "P", "M", "K", "N", "S" o "H".
    2. Selecciona el Sistema REGO-FIX:
       - Si Ø < 3mm -> "micRun (MR)".
       - Si Desbaste/HPC en Titanio/Inconel/Inox (S o M) Y Ø >= 10mm -> "secuRgrip (SG)". 
         * HSK-A 63 soporta 15-SG, 25-SG, 32-SG.
         * CAT/BT/SK saltan a PG 25-SG o 32-SG.
       - Resto de casos -> "powRgrip (PG) Estándar".
       - Si lubricación es "Interna" o "Centro" -> "Estanca" o "Cool-Flow".
    3. Escribe un dictamen justificando la selección y cómo el TIR < 3µm salva la herramienta (ratio L/D es ${(l/d).toFixed(1)}).

    RESPONDE SOLO EN JSON:
    {
      "iso": "S",
      "sistema_recomendado": "CAT 40 / powRgrip PG 25-SG",
      "pinza_sugerida": "PG 25-SG Estanca",
      "dictamen_tecnico": "Dictamen aquí..."
    }
  `;

  try {
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "gpt-4o", 
        messages: [{ role: "system", content: "Devuelve solo JSON." }, { role: "user", content: promptSeleccion }],
        response_format: { type: "json_object" },
        temperature: 0.1 
      })
    });

    const aiData = JSON.parse((await aiRes.json()).choices[0].message.content);
    
    // MATEMÁTICAS EN JAVASCRIPT
    const baseCut = MAT_DB[aiData.iso] || MAT_DB['P'];
    const toolFactor = herramienta.toUpperCase().includes('HSS') ? 0.4 : 1.0;
    
    let rpm_calc = Math.round((baseCut.vc * toolFactor * 1000) / (Math.PI * d));
    let capping = false;
    
    if (rpm_calc > maxRpmVal) {
        rpm_calc = maxRpmVal;
        capping = true;
    }

    let k_rigidez = 1.25; 
    if (aiData.sistema_recomendado.includes('SG') || aiData.pinza_sugerida.includes('SG')) k_rigidez = 1.40;
    if (aiData.sistema_recomendado.includes('MR')) k_rigidez = 1.15;

    let avance_calc = Math.round(rpm_calc * numZ * baseCut.fz * k_rigidez);

    let mejora = "+25% Productividad";
    if (tiene_actuales && avance_actual_mm > 0) {
        const pct = Math.round(((avance_calc / avance_actual_mm) - 1) * 100);
        mejora = pct > 0 ? `+${pct}% de Avance` : "Mejora en Estabilidad y Vida";
    }

    res.status(200).json({
      sistema_recomendado: aiData.sistema_recomendado,
      pinza_sugerida: aiData.pinza_sugerida,
      rpm_calculado: rpm_calc,
      avance_calculado: avance_calc,
      capping_activado: capping,
      mejora_esperada: mejora,
      dictamen_tecnico: aiData.dictamen_tecnico
    });

  } catch (error) {
    res.status(500).json({ error: "Error en servidor calculando cinemática." });
  }
}
