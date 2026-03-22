// api/cut-conditions.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Post only' });

  const { material, diametro, largo, z, rpm_act, feed_act, aplicacion, coolant } = req.body;
  const d = parseFloat(diametro);

  // --- 1. EDUCACIÓN TÉCNICA: TABLA DE SELECCIÓN REGO-FIX ---
  let holder = "";
  let boquilla = "";
  let tir = "0.003mm";

  if (d <= 4) { holder = "PG 6"; boquilla = `PG 6 / ${d}mm`; }
  else if (d <= 6) { holder = "PG 10"; boquilla = `PG 10 / ${d}mm`; }
  else if (d <= 12) { holder = "PG 15"; boquilla = `PG 15 / ${d}mm`; }
  else if (d <= 20) { holder = "PG 25"; boquilla = `PG 25 / ${d}mm`; }
  else if (d <= 25.4) { holder = "PG 32"; boquilla = `PG 32 / ${d}mm`; }
  else if (d <= 40) { holder = "PG 48"; boquilla = `PG 48 / ${d}mm`; }
  else { return res.status(400).json({ error: "Diámetro fuera de rango de catálogo PG." }); }

  // --- 2. LÓGICA DE INGENIERÍA (OPTIMIZACIÓN REAL) ---
  // Factor de mejora REGO-FIX por rigidez y runout
  const k_rego = 1.25; 
  
  // Estimación de condiciones óptimas (Simulación de tabla de carburo)
  // Nota: Estos valores se pueden ajustar según una base de datos de materiales más amplia
  const v_opt = Math.round(rpm_act * 1.15); // +15% Velocidad sugerida por estabilidad
  const f_opt = Math.round(feed_act * k_rego); // +25% Avance por concentricidad TIR

  // --- 3. CONSULTA A OPENAI PARA EL DICTAMEN ---
  const promptIA = `
    Actúa como Ingeniero de Aplicaciones Senior de REGO-FIX.
    CONTEXTO:
    - Cliente usa: ${material} con una operación de ${aplicacion}.
    - Herramienta: Ø${d}mm con stick-out de ${largo}mm.
    - Setup Actual: RPM ${rpm_act}, Avance ${feed_act} mm/min.
    
    TUS CÁLCULOS TÉCNICOS RESULTANTES:
    - Ensamble propuesto: ${holder} con Boquilla ${boquilla}.
    - Parámetros Óptimos: RPM ${v_opt}, Avance ${f_opt} mm/min.
    
    TAREA:
    Escribe un Dictamen Técnico breve (máx 3 líneas). 
    Si el Stick-out (${largo}mm) es > 3 veces el Ø (${d}mm), DEBES mencionar que el sistema powRgrip es MANDATORIO para absorber vibración y compensar la deflexión radial. 
    Responde estrictamente en JSON.
  `;

  try {
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: "Eres un experto en herramientas CNC y sistemas REGO-FIX. Responde en JSON puro." },
          { role: "user", content: promptIA }
        ],
        response_format: { type: "json_object" }
      })
    });

    const aiData = await aiRes.json();
    const dictamen = JSON.parse(aiData.choices[0].message.content);

    // Unimos los datos calculados por el backend con el dictamen de la IA
    res.status(200).json({
      holder_reco: holder,
      boquilla_reco: boquilla,
      new_rpm: v_opt,
      new_feed: f_opt,
      pct_gain: Math.round(((f_opt / feed_act) - 1) * 100),
      nota: dictamen.dictamen_tecnico || dictamen.nota || "Optimización calculada bajo estándares PG."
    });

  } catch (error) {
    res.status(500).json({ error: "Error en el cálculo de ingeniería." });
  }
}
