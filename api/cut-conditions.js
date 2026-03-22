export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  const { material, herramienta, interfaz, operacion, diametro, z, largo, lubricacion, max_rpm, rpm_actual, avance_actual, tiene_actuales } = req.body;
  const d = parseFloat(diametro);
  const l = parseFloat(largo);
  const maxRpmVal = parseInt(max_rpm) || 99999; // Si no pone límite, lo dejamos alto

  const condicionesActualesText = tiene_actuales 
    ? `\n- CONDICIONES ACTUALES DEL CLIENTE: RPM = ${rpm_actual}, Avance = ${avance_actual} mm/min.` 
    : `\n- CONDICIONES ACTUALES: No proporcionadas (Cálculo desde cero).`;

  const promptIngenieria = `
    Eres el motor de cálculo técnico de REGO-FIX. Analiza estas entradas del usuario:
    - Pieza: ${material}
    - Herramienta: ${herramienta}
    - Interfaz Máquina: ${interfaz}
    - Operación: ${operacion}
    - Ø Herramienta: ${d} mm
    - Proyección (Largo): ${l} mm
    - Filos (Z): ${z}
    - Lubricación: ${lubricacion}
    - RPM Máximas de la Máquina: ${maxRpmVal} ${condicionesActualesText}

    REGLAS ESTRICTAS DE CATÁLOGO REGO-FIX:
    
    1. SISTEMAS Y TAMAÑOS:
       - Si Ø < 3mm -> "micRun (MR)".
       - Si Desbaste/HPC EN materiales duros Y Ø >= 10mm -> OBLIGATORIO "secuRgrip (SG)". 
       - Restricciones SG: HSK-A 63 soporta 15-SG, 25-SG, 32-SG. CAT 40/BT 40 saltan a PG 25-SG o 32-SG. ER-SG también es válido si el cono es ER.
       - Resto de casos -> "powRgrip (PG) Estándar".
    
    2. REGLA DE LUBRICACIÓN: Si indica "Interna" o "Centro", añade "Estanca" o "Cool-Flow" a la pinza.

    3. FÍSICA Y LIMITACIONES DE MÁQUINA (CAPPING): 
       - Deduce Vc y fz base para el material.
       - Calcula RPM Teóricas = (Vc * 1000) / (PI * Ø).
       - REGLA DE CAPPING: Si las RPM Teóricas son mayores a ${maxRpmVal}, DEBES limitar las RPM calculadas a ${maxRpmVal} y establecer "capping_activado": true.
       - Calcula Avance (Vf) = RPM (ya limitadas) * Z * fz * Factor Rigidez (1.25x para PG, 1.40x para SG).
       - Ratio L/D actual es ${parseFloat(l/d).toFixed(1)}.
       
    4. CÁLCULO DE MEJORA:
       - Si hay "CONDICIONES ACTUALES", compara el Avance calculado contra el Avance Actual de ${avance_actual || 0} mm/min y devuelve el porcentaje de mejora real. Si no las hay, solo pon "+25% Productividad".

    Devuelve ÚNICAMENTE JSON con esta estructura exacta (numéricos enteros donde aplique):
    {
      "sistema_recomendado": "Ej: CAT 40 / powRgrip PG 25-SG",
      "pinza_sugerida": "Ej: Pinza PG 25-SG Estanca Ø12mm",
      "rpm_calculado": 0,
      "avance_calculado": 0,
      "capping_activado": false,
      "mejora_esperada": "Ej: +45% de Avance y Anti Pull-out",
      "dictamen_tecnico": "2 líneas: Justifica la selección (cono, L/D, rigidez) y el impacto del avance."
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
        messages: [
          { role: "system", content: "Eres ingeniero de aplicaciones REGO-FIX. Responde solo en JSON válido." },
          { role: "user", content: promptIngenieria }
        ],
        response_format: { type: "json_object" },
        temperature: 0.1 
      })
    });

    const data = await aiRes.json();
    res.status(200).json(JSON.parse(data.choices[0].message.content));

  } catch (error) {
    res.status(500).json({ error: "Error procesando los parámetros técnicos." });
  }
}
