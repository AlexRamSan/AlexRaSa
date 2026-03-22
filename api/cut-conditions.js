export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Solo POST' });

  const { material, herramienta, interfaz, operacion, diametro, z, largo, lubricacion } = req.body;
  const d = parseFloat(diametro);
  const l = parseFloat(largo);

  const promptIngenieria = `
    Eres el motor de cálculo técnico de REGO-FIX. Analiza estas entradas libres del operador:
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

    2. REGLA SECURGRIP (SG) - PROTECCIÓN ANTI PULL-OUT:
       - Se activa SI Y SOLO SI la operación es HPC/Desbaste pesado EN materiales duros (Titanio, Inconel, Inox) Y el diámetro (Ø) está soportado.
       - TAMAÑOS SOPORTADOS PARA PG-SG (Basado en catálogo oficial):
         * PG 15-SG: Solo soporta Ø 10mm.
         * PG 25-SG: Soporta Ø 10, 12, 14, 16, 18, 20mm (o pulgadas 1/2", 5/8", 3/4").
         * PG 32-SG: Soporta Ø 10, 12, 14, 16, 18, 20, 25mm (o pulgadas 1/2" a 1").
       - TAMAÑOS SOPORTADOS PARA ER-SG: ER 32-SG o ER 40-SG (A partir de Ø 10mm).
       - Si el Ø es menor a 10mm, ES IMPOSIBLE USAR secuRgrip. Pasa a la Regla 3.
       - Nomenclatura obligatoria de la pinza: "PG [Tamaño]-SG secuRgrip" o "ER [Tamaño]-SG secuRgrip".

    3. REGLA POWRGRIP (PG) ESTÁNDAR: Para el resto de los casos.
       - TAMAÑOS: PG10 (hasta 6mm), PG15 (hasta 12mm), PG25 (hasta 20mm), PG32 (hasta 25.4mm).
    
    4. REGLA DE LUBRICACIÓN: Si el usuario indica lubricación "Interna" o "Centro", añade a la pinza sugerida el sufijo DM (Estanca para ER) o Cool-Flow/Estanca (para PG).

    5. FÍSICA DE CORTE Y DEFLEXIÓN: 
       - Deduce Velocidad de Corte (Vc) y avance por diente (fz).
       - Calcula RPM = (Vc * 1000) / (PI * Ø).
       - Calcula Avance (Vf) = RPM * Z * fz.
       - Incrementa el avance 25% por la rigidez de REGO-FIX.
       - Ratio L/D actual es ${l/d}. Si es > 3.5, justifica en el dictamen cómo el TIR < 3µm del portaherramientas salva la vida de la herramienta frente a la deflexión.

    Devuelve ÚNICAMENTE un JSON con esta estructura exacta (rpm y avance como enteros):
    {
      "sistema_recomendado": "Ej: HSK-A 63 / powRgrip PG 25-SG",
      "pinza_sugerida": "Ej: Pinza PG 25-SG Estanca",
      "rpm_calculado": 0,
      "avance_calculado": 0,
      "mejora_esperada": "Ej: +25% de Avance y 100% Anti Pull-out",
      "dictamen_tecnico": "2 líneas: Justifica la selección considerando deflexión (L/D) y lubricación."
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
        temperature: 0.1 // Casi cero para forzar exactitud de catálogo
      })
    });

    const data = await aiRes.json();
    res.status(200).json(JSON.parse(data.choices[0].message.content));

  } catch (error) {
    res.status(500).json({ error: "Error procesando los parámetros técnicos." });
  }
}
