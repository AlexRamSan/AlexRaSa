export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  const { material, herramienta, interfaz, operacion, diametro, z, largo, lubricacion, max_rpm, rpm_actual, avance_actual, tiene_actuales } = req.body;
  const d = parseFloat(diametro);
  const l = parseFloat(largo);
  const maxRpmVal = parseInt(max_rpm) || 99999;
  const numZ = parseInt(z) || 4;

  // Base de datos de ingeniería física (Matemáticas 100% controladas en JS)
  const MAT_DB = {
    'P': { vc: 150, fz: 0.08 }, // Aceros
    'M': { vc: 80,  fz: 0.05 }, // Inoxidables
    'K': { vc: 120, fz: 0.10 }, // Fundiciones
    'N': { vc: 400, fz: 0.15 }, // Aluminio / No ferrosos
    'S': { vc: 40,  fz: 0.04 }, // Inconel / Titanio
    'H': { vc: 30,  fz: 0.02 }  // Aceros Endurecidos
  };

  const promptSeleccion = `
    Eres ingeniero de aplicaciones REGO-FIX.
    DATOS: Pieza: ${material}, Herramienta: ${herramienta}, Interfaz: ${interfaz}, Operación: ${operacion}, Ø: ${d}mm, Largo: ${l}mm.

    TAREAS:
    1. Clasifica el material en una categoría ISO exacta: "P", "M", "K", "N", "S" o "H".
    2. Selecciona el Sistema REGO-FIX usando estas REGLAS DE CATÁLOGO:
       - Si Ø < 3mm -> "micRun (MR)".
       - Si Desbaste/HPC en Titanio/Inconel/Inox (S o M) Y Ø >= 10mm -> OBLIGATORIO "secuRgrip (SG)". 
         * HSK-A 63 soporta 15-SG, 25-SG, 32-SG.
         * CAT/BT/SK saltan a PG 25-SG o 32-SG. (No uses 15-SG).
       - Resto de casos -> "powRgrip (PG) Estándar".
       - Si lubricación es "Interna", añade "Estanca" o "Cool-Flow" a la pinza.
    3. Escribe un dictamen de 2 líneas justificando el portaherramientas y cómo el TIR < 3µm salva la herramienta (ratio L/D es ${(l/d).toFixed(1)}).

    RESPONDE SOLO EN JSON:
    {
      "iso": "S",
      "sistema_recomendado": "CAT 40 / powRgrip PG 25-SG",
      "pinza_sugerida": "PG 25-SG Estanca",
      "dictamen_tecnico": "Dictamen aquí..."
    }
  `;

  try {
    // 1. La IA SOLO clasifica y selecciona catálogo
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
    
    // 2. MATEMÁTICAS ESTRICTAS EN JAVASCRIPT
    const baseCut = MAT_DB[aiData.iso] || MAT_DB['P'];
    const toolFactor = herramienta.toUpperCase().includes('HSS') ? 0.4 : 1.0;
    
    let rpm_calc = Math.round((baseCut.vc * toolFactor * 1000) / (Math.PI * d));
    let capping = false;
    
    // Aplicamos Capping si se pasa del límite de la máquina
    if (rpm_calc > maxRpmVal) {
        rpm_calc = maxRpmVal;
        capping = true;
    }

    // Factor de Rigidez REGO-FIX
    let k_rigidez = 1.25; // Base powRgrip
    if (aiData.sistema_recomendado.includes('SG') || aiData.pinza_sugerida.includes('SG')) k_rigidez = 1.40;
    if (aiData.sistema_recomendado.includes('MR')) k_rigidez = 1.15;

    let avance_calc = Math.round(rpm_calc * numZ * baseCut.fz * k_rigidez);

    // Cálculo de mejora real
    let mejora = "+25% Productividad";
    if (tiene_actuales && avance_actual > 0) {
        const pct = Math.round(((avance_calc / parseFloat(avance_actual)) - 1) * 100);
        mejora = pct > 0 ? `+${pct}% de Avance` : "Mejora en Estabilidad y Vida";
    }

    // Enviamos el paquete completo y seguro al frontend
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
