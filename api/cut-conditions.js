export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  const { material, herramienta, interfaz, operacion, diametro, z, largo, lubricacion, max_rpm, rpm_actual, avance_actual, tiene_actuales } = req.body;
  const d = parseFloat(diametro);
  const l = parseFloat(largo);
  const maxRpmVal = parseInt(max_rpm) || 99999;

  const condicionesActualesText = tiene_actuales 
    ? `\n- CONDICIONES ACTUALES: RPM = ${rpm_actual}, Avance = ${avance_actual} mm/min.` 
    : `\n- CONDICIONES ACTUALES: No proporcionadas.`;

  const promptIngenieria = `
    Eres el motor de cálculo de REGO-FIX. Analiza:
    - Pieza: ${material}
    - Herramienta: ${herramienta}
    - Interfaz: ${interfaz}
    - Operación: ${operacion}
    - Ø Herramienta: ${d} mm
    - Proyección (L): ${l} mm
    - Filos (Z): ${z}
    - Lubricación: ${lubricacion}
    - Límite RPM: ${maxRpmVal} ${condicionesActualesText}

    REGLAS DE CATÁLOGO:
    1. Si Ø < 3mm -> "micRun (MR)".
    2. Si Desbaste/HPC en Titanio/Inconel/Inox Y Ø >= 10mm -> OBLIGATORIO "secuRgrip (SG)". 
       - HSK-A 63 soporta 15-SG, 25-SG, 32-SG.
       - CAT 40/BT 40/SK 40 saltan a PG 25-SG o 32-SG. (No uses 15-SG).
       - ER-SG es válido si el cono es ER.
    3. Resto de casos -> "powRgrip (PG) Estándar".
    4. Lubricación "Interna/Centro" -> Añade "Estanca" o "Cool-Flow".

    FÍSICA DE CORTE: 
    - Deduce Vc y fz.
    - RPM Teóricas = (Vc * 1000) / (PI * Ø).
    - CAPPING: Si RPM Teóricas > ${maxRpmVal}, limita las RPM a ${maxRpmVal} y pon "capping_activado": true.
    - Avance (mm/min) = RPM (limitadas) * Z * fz * (1.25 para PG, 1.40 para SG).
    - Compara Avance calculado vs Avance actual (${avance_actual || 0}) para dar el % de mejora.

    Responde en JSON:
    {
      "sistema_recomendado": "Ej: HSK-A 63 / powRgrip PG 25-SG",
      "pinza_sugerida": "Ej: Pinza PG 25-SG Estanca",
      "rpm_calculado": 0,
      "avance_calculado": 0,
      "capping_activado": false,
      "mejora_esperada": "Ej: +25%",
      "dictamen_tecnico": "2 líneas justificando la selección y mejora de MRR."
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
        messages: [{ role: "system", content: "Devuelve solo JSON." }, { role: "user", content: promptIngenieria }],
        response_format: { type: "json_object" },
        temperature: 0.1 
      })
    });

    const data = await aiRes.json();
    res.status(200).json(JSON.parse(data.choices[0].message.content));

  } catch (error) {
    res.status(500).json({ error: "Error en servidor." });
  }
}
