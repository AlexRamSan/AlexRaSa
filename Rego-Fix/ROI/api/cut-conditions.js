// api/cut-conditions.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Post only' });

  const { material, diametro, largo, z, rpm_act, feed_act, aplicacion, coolant, lang } = req.body || {};
  const d = parseFloat(diametro) || 0;
  const currentLang = ['es', 'pt', 'en'].includes(lang) ? lang : 'es';

  // --- 1. TABLA DE SELECCIÓN REGO-FIX ---
  let holder = "";
  let boquilla = "";
  let tir = "0.003mm";

  if (d > 0 && d <= 4) { holder = "PG 6"; boquilla = `PG 6 / ${d}mm`; }
  else if (d <= 6) { holder = "PG 10"; boquilla = `PG 10 / ${d}mm`; }
  else if (d <= 12) { holder = "PG 15"; boquilla = `PG 15 / ${d}mm`; }
  else if (d <= 20) { holder = "PG 25"; boquilla = `PG 25 / ${d}mm`; }
  else if (d <= 25.4) { holder = "PG 32"; boquilla = `PG 32 / ${d}mm`; }
  else if (d <= 40) { holder = "PG 48"; boquilla = `PG 48 / ${d}mm`; }
  else { return res.status(400).json({ error: "Diámetro fuera de rango de catálogo PG." }); }

  // --- 2. LÓGICA DE INGENIERÍA (OPTIMIZACIÓN DE PARÁMETROS) ---
  const k_rego = 1.25; 
  const currentRpm = parseFloat(rpm_act) || 3000;
  const currentFeed = parseFloat(feed_act) || 500;

  const v_opt = Math.round(currentRpm * 1.15); // +15% Velocidad sugerida por estabilidad
  const f_opt = Math.round(currentFeed * k_rego); // +25% Avance por concentricidad TIR

  // --- 3. PROMPT DE INGENIERÍA ADAPTADO AL IDIOMA ---
  const promptIA = `
    Actúa como Ingeniero de Aplicaciones Senior de REGO-FIX.
    Idioma de respuesta obligatorio: ${currentLang === 'pt' ? 'Português do Brasil' : currentLang === 'en' ? 'English (US)' : 'Español (México)'}.

    CONTEXTO:
    - Material: ${material || 'Acero'} | Operación: ${aplicacion || 'Fresado'}.
    - Herramienta: Ø${d}mm con stick-out de ${largo || 30}mm.
    - Setup Actual: RPM ${currentRpm}, Avance ${currentFeed} mm/min.
    
    CÁLCULOS TÉCNICOS:
    - Ensamble propuesto: ${holder} con Boquilla ${boquilla}.
    - Parámetros Óptimos: RPM ${v_opt}, Avance ${f_opt} mm/min.
    
    TAREA:
    Escribe un dictamen técnico conciso (máximo 2 a 3 líneas).
    Si el Stick-out (${largo || 30}mm) es > 3 veces el diámetro (${d}mm), menciona que el sistema powRgrip es mandatorio para absorber vibraciones y compensar la deflexión radial.
    Responde estrictamente en formato JSON con la clave "dictamen_tecnico".
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
          { role: "system", content: "Eres un experto en herramientas CNC y sistemas REGO-FIX. Devuelve únicamente JSON válido." },
          { role: "user", content: promptIA }
        ],
        response_format: { type: "json_object" }
      })
    });

    let dictamenTexto = "Optimización calculada bajo estándares PG.";
    if (aiRes.ok) {
      const aiData = await aiRes.json();
      const parsed = JSON.parse(aiData.choices[0].message.content);
      dictamenTexto = parsed.dictamen_tecnico || parsed.nota || dictamenTexto;
    }

    return res.status(200).json({
      holder_reco: holder,
      boquilla_reco: boquilla,
      new_rpm: v_opt,
      new_feed: f_opt,
      pct_gain: Math.round(((f_opt / currentFeed) - 1) * 100),
      nota: dictamenTexto
    });

  } catch (error) {
    console.error("Error en cut-conditions:", error);
    // Fallback con el cálculo de ingeniería intacto
    return res.status(200).json({
      holder_reco: holder,
      boquilla_reco: boquilla,
      new_rpm: v_opt,
      new_feed: f_opt,
      pct_gain: Math.round(((f_opt / currentFeed) - 1) * 100),
      nota: "Parámetros optimizados basados en rigidez y concentricidad powRgrip (TIR ≤ 0.003mm)."
    });
  }
}
