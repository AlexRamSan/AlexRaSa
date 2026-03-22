export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  // Recibimos los datos libres
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
    
    1. TAMAÑOS DE SISTEMA: 
       - PG (powRgrip): PG10 (hasta 6mm), PG15 (hasta 12mm), PG25 (hasta 20mm), PG32 (hasta 25.4mm).
       - MR (micRun): MR11 (hasta 6mm), MR16 (hasta 10mm).

    2. MATRIZ DE SELECCIÓN DE HOLDER Y PINZA:
       - REGLA A (Micro): Si Ø < 3mm -> 
         * Sistema: "micRun (MR)"
         * Pinza: "MR [11 o 16] - ${d}mm"
       
       - REGLA B (secuRgrip): Si Operación implica "Desbaste" o alta remoción, Y la Pieza es dura (Titanio, Inconel, Inoxidable, Acero tratado >45 HRC), Y Ø >= 10mm ->
         * Sistema: "secuRgrip (PG-SG) Heavy Duty"
         * Pinza: "PG [15, 25 o 32]-SG secuRgrip para ${d}mm" (ES VITAL QUE LA PINZA INCLUYA EL SUFIJO -SG).
       
       - REGLA C (Estándar): Para el resto de los casos ->
         * Sistema: "powRgrip (PG) Estándar"
         * Pinza: "PG [10, 15, 25 o 32] Estándar para ${d}mm"

    3. FÍSICA DE CORTE: 
       - Deduce la Velocidad de Corte (Vc) y el avance por diente (fz) adecuados para el material y herramienta.
       - Calcula RPM = (Vc * 1000) / (PI * Ø).
       - Calcula Avance de mesa (Vf) = RPM * Z * fz.
       - Incrementa el Avance (Vf) un 25% por la alta rigidez y TIR < 3µm del sistema.

    Devuelve ÚNICAMENTE un JSON con esta estructura exacta:
    {
      "sistema_recomendado": "Ej: HSK-A 63 / secuRgrip (PG-SG)",
      "pinza_sugerida": "Ej: Pinza PG 25-SG secuRgrip",
      "rpm_calculado": 0,
      "avance_calculado": 0,
      "mejora_esperada": "Ej: +25% y 100% Anti Pull-out",
      "dictamen_tecnico": "1 sola línea justificando la selección del sistema y la boquilla."
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
        model: "gpt-4o", // gpt-4o es necesario para seguir reglas lógicas estrictas
        messages: [
          { role: "system", content: "Eres un ingeniero de aplicaciones experto de REGO-FIX. Responde solo en JSON." },
          { role: "user", content: promptIngenieria }
        ],
        response_format: { type: "json_object" },
        temperature: 0.2 // Temperatura baja para que no se ponga "creativo" con los nombres
      })
    });

    const data = await aiRes.json();
    res.status(200).json(JSON.parse(data.choices[0].message.content));

  } catch (error) {
    res.status(500).json({ error: "Error procesando los parámetros técnicos." });
  }
}
