export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  const { material, herramienta, interfaz, operacion, diametro, z, largo, lubricacion } = req.body;
  const d = parseFloat(diametro);
  const l = parseFloat(largo);

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

    REGLAS ESTRICTAS DE CATÁLOGO REGO-FIX (NUNCA INVENTES MEDIDAS):
    
    1. REGLA DE MICRO-MECANIZADO: Si Ø < 3mm -> Sistema: "micRun (MR)".

    2. REGLA SECURGRIP (SG) - ANTI PULL-OUT:
       - Se activa OBLIGATORIAMENTE si la operación es Desbaste/HPC EN materiales duros (Titanio, Inconel, Inox) Y Ø >= 10mm.
       - RESTRICCIONES DE HUSILLO PARA PG-SG (Crucial):
         * Si Interfaz es HSK-A 63: Soporta PG 15-SG, PG 25-SG, PG 32-SG.
         * Si Interfaz es CAT 40, BT 40, SK 40, Capto C6: Soporta PRINCIPALMENTE PG 25-SG y PG 32-SG. (No uses PG 15-SG aquí, salta al 25).
         * Si Interfaz es CAT 50, BT 50, HSK-A 100: Soporta PG 25-SG, PG 32-SG, PG 48-SG.
       - TAMAÑOS DE BOQUILLA PARA PG-SG:
         * PG 15-SG: Solo para Ø 10mm.
         * PG 25-SG: Para Ø 10, 12, 14, 16, 18, 20mm (o 1/2", 5/8", 3/4").
         * PG 32-SG: Para Ø 10 al 25mm (o 1/2" a 1").
       - También puedes sugerir ER-SG (ER 32-SG o ER 40-SG) si el usuario especifica interfaz ER.
       - Nomenclatura del Sistema: "[Interfaz] / powRgrip PG [Tamaño]-SG"
       - Nomenclatura de Pinza: "Pinza PG [Tamaño]-SG secuRgrip para Ø${d}mm"

    3. REGLA POWRGRIP (PG) ESTÁNDAR: Para el resto de los casos.
       - Tamaños: PG10 (hasta 6mm), PG15 (hasta 12mm), PG25 (hasta 20mm), PG32 (hasta 25.4mm).
    
    4. REGLA DE LUBRICACIÓN: Si indica "Interna" o "Centro", añade "Estanca" o "Cool-Flow".

    5. FÍSICA Y DEFLEXIÓN: 
       - Deduce Velocidad de Corte (Vc) y avance por diente (fz).
       - RPM = (Vc * 1000) / (PI * Ø).
       - Avance (Vf) = RPM * Z * fz.
       - Incrementa el avance 25% gracias a la rigidez REGO-FIX.
       - Ratio L/D actual es ${l/d}. Si es > 3.5, justifica en el dictamen cómo la fuerza de sujeción salva la herramienta.

    Devuelve ÚNICAMENTE JSON con esta estructura (rpm y avance enteros):
    {
      "sistema_recomendado": "Ej: CAT 40 / powRgrip PG 25-SG",
      "pinza_sugerida": "Ej: Pinza PG 25-SG Estanca Ø12mm",
      "rpm_calculado": 0,
      "avance_calculado": 0,
      "mejora_esperada": "Ej: +25% Avance y Anti Pull-out",
      "dictamen_tecnico": "2 líneas: Justifica la selección (cono, SG, etc) considerando deflexión y material."
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
