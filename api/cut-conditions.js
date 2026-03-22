export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  // Recibimos textos 100% libres desde el frontend
  const { material, herramienta, interfaz, operacion, diametro, z } = req.body;
  const d = parseFloat(diametro);

  const promptIngenieria = `
    Eres el motor de cálculo técnico de REGO-FIX. Analiza estas entradas libres del operador:
    - Pieza: ${material}
    - Herramienta: ${herramienta}
    - Interfaz Máquina: ${interfaz}
    - Operación: ${operacion}
    - Ø Herramienta: ${d} mm
    - Filos (Z): ${z}

    REGLAS ESTRICTAS DE CATÁLOGO REGO-FIX A APLICAR:
    1. SELECCIÓN DE SISTEMA:
       - Si Ø < 3mm: Selecciona "micRun (MR)".
       - Si Operación implica "Desbaste" y la Pieza es dura (Titanio, Inconel, Inoxidable, >45 HRC) y Ø >= 10mm: Selecciona obligatoriamente "secuRgrip (PG-SG)" para protección anti pull-out.
       - Resto de casos: Selecciona "powRgrip (PG) Estándar".
    2. TAMAÑO DE HOLDER PG (si aplica): PG10 (hasta 6mm), PG15 (hasta 12mm), PG25 (hasta 20mm), PG32 (hasta 25.4mm).
    3. FÍSICA DE CORTE: 
       - Deduce la Velocidad de Corte (Vc) y el avance por diente (fz) adecuados para esa combinación de material y herramienta.
       - Calcula RPM = (Vc * 1000) / (PI * Ø).
       - Calcula Avance de mesa (Vf) = RPM * Z * fz.
       - IMPORTANTE: Incrementa el Avance (Vf) un 25% gracias a la rigidez y el TIR < 3µm del sistema suizo.

    Devuelve ÚNICAMENTE un JSON con esta estructura exacta:
    {
      "sistema_recomendado": "Ej: HSK-A 63 / powRgrip PG 15",
      "pinza_sugerida": "Ej: PG 15-12mm Estándar",
      "rpm_calculado": 0,
      "avance_calculado": 0,
      "mejora_esperada": "Ej: +25% Productividad",
      "dictamen_tecnico": "1 sola línea justificando la selección del sistema y el TIR."
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
        model: "gpt-4o", // Usamos gpt-4o para máxima precisión técnica
        messages: [
          { role: "system", content: "Eres un ingeniero de aplicaciones experto. Responde solo en JSON." },
          { role: "user", content: promptIngenieria }
        ],
        response_format: { type: "json_object" }
      })
    });

    const data = await aiRes.json();
    res.status(200).json(JSON.parse(data.choices[0].message.content));

  } catch (error) {
    res.status(500).json({ error: "Error procesando los parámetros técnicos." });
  }
}
