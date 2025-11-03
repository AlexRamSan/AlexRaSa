// toolform/js/tool-selection.js
// Recomendador explicativo de herramienta, parámetros y tiempo de ciclo.
// Reemplaza el archivo existente por este y recarga la página.
(() => {
  // --- Datos base (puedes ajustar cutting-data.json con vc_table y kc_table) ---
  let VC_TABLE = {
    al: { carbide: 800, hss: 300, pcd: 1200 },
    st: { carbide: 150, hss: 60, cermet: 120 },
    ss: { carbide: 60, cermet: 40, cbn: 30 },
    ti: { carbide: 30, cermet: 20 },
    ci: { carbide: 80 },
    pl: { carbide: 600, pcd: 1000 },
    cm: { carbide: 20 }
  };
  const KC_TABLE = { al:600, st:2000, ss:3000, ti:5000, ci:1500, pl:200, cm:4000, other:2000 };

  const TOOL_TYPES_BY_MACHINE = {
    vmc: ['Fresa de extremo','Fresa de cara','Broca','Insertos','PCD/CBN'],
    hmc: ['Fresa de extremo','Insertos','Fresa de cara','PCD/CBN'],
    lathe: ['Porta-insertos (torneado)','Broca','Herramienta de roscar'],
    'turn-mill': ['Fresa de extremo','Porta-insertos (torneado)','Insertos'],
    router: ['Fresa de extremo','Fresa de desbaste'],
    '5axis': ['Fresa de extremo','Fresa de contorno','PCD/CBN'],
    drill: ['Broca','Regrueso','Insertos']
  };
  const TOOL_MATERIALS = { default: ['Carburo','HSS','Cermet','PCD','CBN'], lathe: ['Carburo','Cermet','CBN'] };

  // --- Helpers de unidades y fórmulas ---
  const mmToIn = mm => mm/25.4;
  const inToMm = inch => inch*25.4;
  function computeRPM(vc_mmin, D_mm) { if (!vc_mmin || !D_mm) return null; return Math.round((1000 * vc_mmin) / (Math.PI * D_mm)); }
  function computeFeed(rpm, fz, z) { if (!rpm || !fz || !z) return null; return Math.round(rpm * fz * z * 100)/100; } // mm/min
  function computeMRR(ap, ae_mm, feed) { if (!ap || !ae_mm || !feed) return null; return Math.round(ap * ae_mm * feed); } // mm3/min
  function safe(n, dp=3){ return (n===null || n===undefined) ? null : Math.round(n * Math.pow(10,dp))/Math.pow(10,dp); }

  // --- Cargar cutting-data.json si existe ---
  fetch('data/cutting-data.json').then(r=>r.ok? r.json(): null).then(json => {
    if (!json) return;
    if (json.vc_table) VC_TABLE = json.vc_table;
    if (json.kc_table) Object.assign(KC_TABLE, json.kc_table);
  }).catch(()=>{ /* silencio */ });

  // --- Reglas de recomendación (heurísticas) ---
  function chooseToolForProcess({operation, machine, material, diameter, priority}) {
    // Decide familia de herramienta y parámetros de geometría abstracta según operación y material.
    const out = { tool:'Fresa de extremo', family:'Carburo', coating:'AlTiN', geometry:'hélice estándar', why:[] };

    // Operation-driven choices
    if (operation === 'drill') {
      out.tool = (diameter && diameter > 12) ? 'Broca sólida (carburo macizo)' : 'Broca de múltiple punta / insertable';
      out.family = (diameter && diameter <= 6) ? 'HSS o Carburo' : 'Carburo';
      out.coating = (material === 'al') ? 'Ninguno / Pulido' : 'AlTiN';
      out.geometry = 'ángulo punta 118-140°, flauta amplia para evacuación de viruta';
      out.why.push('Taladrado requiere control de evacuación y rigidez; para diámetros grandes usar carburo.');
    } else if (operation === 'turning' || machine === 'lathe') {
      out.tool = 'Porta-insertos indexables (torneado)';
      out.family = 'Carburo (placas)';
      out.coating = (material === 'st' || material === 'ss') ? 'AlTiN/TiCN' : 'AlTiN';
      out.geometry = 'radio pequeño (0.2-0.8 mm) para acabado, ángulo de incidencia según rosca';
      out.why.push('Torneado con insertos optimiza vida de herramienta y permite reparaciones económicas.');
    } else { // milling family
      if (operation === 'face' || operation === 'pocket' || operation === 'contour' || operation === 'slot') {
        // roughing vs finishing decision via priority
        if (priority === 'cycle') {
          out.tool = 'Fresa de desbaste (fresa de radio grande / full-immersion)';
          out.geometry = 'hélice baja, arista robusta, mayor ap y ae';
          out.why.push('Prioriza tiempo de ciclo; usar geometría robusta y mayores ap/ae.');
        } else {
          out.tool = 'Fresa de acabado / extremo de alta velocidad';
          out.geometry = 'hélice mayor, radio pequeño, filo pulido para acabado';
          out.why.push('Prioriza acabado y vida de herramienta.');
        }
        // material specific
        if (material === 'al') {
          out.family = 'Carburo pulido o PCD';
          out.coating = 'Sin recubrimiento / pulido o DLC';
          out.why.push('Aluminio requiere filo pulido y evacuación de viruta; PCD para producción alta.');
        } else if (material === 'ti') {
          out.family = 'Carburo de alta tenacidad';
          out.coating = 'AlTiN o sin recubrimiento';
          out.why.push('Titanio genera calor; recubrimientos que reducen adherencia y diente pulido ayudan.');
        } else if (material === 'ss') {
          out.family = 'Carburo o Cermet';
          out.coating = 'AlTiN / TiCN';
          out.why.push('Inoxidable requiere recubrimientos duros y avances bajos.');
        } else {
          out.family = 'Carburo';
          out.coating = 'AlTiN';
        }
      } else if (operation === 'thread') {
        out.tool = 'Herramienta de roscar o machos/portaherramientas';
        out.family = 'Carburo insertable o HSS para roscas internas';
        out.coating = (material === 'al') ? 'Ninguno' : 'AlTiN';
        out.geometry = 'forma de hilo correspondiente; preferir perfiles integrales para precisión';
        out.why.push('Roscar exige control de avance por paso; usar herramienta específica de rosca.');
      } else {
        out.tool = 'Fresa de extremo';
        out.family = 'Carburo';
        out.coating = 'AlTiN';
        out.geometry = 'geometría estándar';
      }
    }

    // Safety / constraints: remove impossible combos (ej: porta-insertos en VMC multi)
    if (machine !== 'lathe' && out.tool.toLowerCase().includes('porta-insertos') && machine !== 'turn-mill') {
      out.why.push('El porta-insertos es típico en torno. Verifica compatibilidad con la máquina.');
    }

    return out;
  }

  // --- UI render (idéntico pero mantiene integración) ---
  const root = document.getElementById('tool-selection-root');
  if (!root) {
    console.error('tool-selection root no encontrado.');
    return;
  }
  root.innerHTML = `...`; // minimal: we assume index.html already injecta el formulario como antes
  // Si usas la versión previa, NO borres; la UI ya carga desde index.html.
  // Para no romper, buscamos elementos existentes en DOM y los usaremos.
  // --- Bind to existing form elements (as in previous file) ---
  function $(id){ return document.getElementById(id); }
  const machineTypeEl = $('machineType'), operationEl = $('operation'), workMaterialEl = $('workMaterial'),
        diameterEl = $('diameter'), flutesEl = $('flutes'), apEl = $('ap'), aeEl = $('ae'),
        cutLengthEl = $('cutLength'), priorityEl = $('priority'), toolMaterialEl = $('toolMaterial');

  // If any required DOM missing, stop.
  if (!machineTypeEl || !operationEl || !workMaterialEl) {
    console.warn('Elementos del formulario no encontrados. Asegúrate de usar el index.html provisto.');
  }

  // --- Recomendador principal (explicativo) ---
  function buildDetailedRecommendation(form) {
    // form: object from readForm()
    const baseChoice = chooseToolForProcess({ operation: form.operation, machine: form.machine, material: form.workMaterial, diameter: form.diameter, priority: form.priority });

    // Determine tool family (material family) from either selected toolMaterial or heuristics
    let toolFamily = (form.toolMaterial && form.toolMaterial.toLowerCase()) ? form.toolMaterial.toLowerCase() : 'carbide';
    if (toolFamily.includes('hss')) toolFamily = 'hss';
    if (toolFamily.includes('pcd')) toolFamily = 'pcd';
    if (toolFamily.includes('cbn')) toolFamily = 'cbn';
    if (toolFamily.includes('cermet')) toolFamily = 'cermet';
    if (!toolFamily) toolFamily = 'carbide';

    // vc from VC_TABLE
    const vcRow = VC_TABLE[form.workMaterial] || VC_TABLE['st'];
    let vc = (vcRow && vcRow[toolFamily]) ? vcRow[toolFamily] : (vcRow && vcRow['carbide'] ? vcRow['carbide'] : 100);
    // adjust for priority
    if (form.priority === 'toollife') vc *= 0.75;
    if (form.priority === 'cycle') vc *= 1.05;

    // units conversion
    let D_mm = form.diameter;
    if (form.units === 'imperial' && form.diameter) D_mm = inToMm(form.diameter);

    // compute rpm/feed/mrr
    const rpm = computeRPM(vc, D_mm);
    const fz = recommendedFz(form.operation, form.workMaterial, D_mm || 6);
    const feed = computeFeed(rpm, fz, form.flutes || 1);
    const ae_mm = parseAe(form.ae, D_mm) || (D_mm ? safe(0.5 * D_mm,2) : null);
    const ap = form.ap || (form.operation==='face' ? safe(2) : safe(1));
    const mrr = computeMRR(ap, ae_mm, feed);

    // potencia (kW) y tiempo de ciclo
    const kc = KC_TABLE[form.workMaterial] || KC_TABLE.other;
    const power_kW = (mrr && kc) ? safe((kc * mrr) / 60000000, 3) : null;
    const cutLen = form.cutLength || 100;
    const cycle_min = (feed && cutLen) ? safe(cutLen / feed, 3) : null;
    const cycle_sec = cycle_min ? safe(cycle_min * 60, 2) : null;

    // Build rationale text
    const rationale = [];
    rationale.push(`Material pieza: ${displayMaterial(form.workMaterial)}. Elegí ${baseChoice.tool} (${baseChoice.family}).`);
    rationale.push(`Por qué: ${baseChoice.why.join(' ')}.`);
    rationale.push(`Geometría sugerida: ${baseChoice.geometry}.`);
    rationale.push(`Elegí material de herramienta: ${baseChoice.family} con recubrimiento ${baseChoice.coating} por balance entre resistencia y disipación térmica.`);
    rationale.push(`Parámetros aproximados: vc ≈ ${safe(vc)} m/min, rpm ≈ ${rpm} rpm, fz ≈ ${fz} mm/diente, avance ≈ ${feed} mm/min.`);
    rationale.push(`Condiciones de corte: ap ≈ ${ap} mm, ae ≈ ${ae_mm} mm (${form.ae || '≈50% D' }).`);
    rationale.push(`MRR estimado ≈ ${mrr} mm³/min. Potencia estimada ≈ ${power_kW} kW.`);
    rationale.push(`Tiempo de corte estimado ≈ ${cycle_min} min (${cycle_sec} s) para longitud ${cutLen} mm.`);
    // Risks and checks
    const checks = [];
    if (form.stickout && D_mm && (form.stickout / D_mm) > 3) checks.push('alto riesgo de vibración por porte largo');
    if (form.cooling && form.cooling.toLowerCase().includes('seco') && form.workMaterial==='ti') checks.push('evitar seco en titanio; usar refrigeración o MQL');
    if (checks.length) rationale.push('Precauciones: ' + checks.join('; ') + '.');

    // structured recommendation
    const detailed = {
      selection: {
        tool: baseChoice.tool,
        tool_family: baseChoice.family,
        recommended_material: baseChoice.family,
        recommended_coating: baseChoice.coating,
        geometry: baseChoice.geometry
      },
      parameters: {
        vc_mmin: safe(vc),
        rpm,
        fz,
        feed_mm_per_min: feed,
        ap_mm: ap,
        ae_mm,
        mrr_mm3_per_min: mrr,
        power_kW,
        cycle_min,
        cycle_sec,
        cut_length_mm: cutLen
      },
      rationale_text: rationale.join(' '),
      heuristics: {
        vibrationRisk: (form.stickout && D_mm) ? ((form.stickout / D_mm) > 3 ? 'ALTA' : (form.stickout / D_mm) > 1.5 ? 'MEDIA' : 'BAJA') : 'BAJA'
      }
    };

    return detailed;
  }

  // --- Utilities ---
  function parseAe(aeVal, diameter) {
    if (!aeVal) return null;
    if (typeof aeVal === 'string' && aeVal.trim().endsWith('%')) {
      const p = Number(aeVal.replace('%',''))/100;
      return diameter ? Math.round(diameter * p * 100)/100 : null;
    }
    return Number(aeVal);
  }
  function recommendedFz(operation, materialCode, diameter) {
    // same buckets as before
    const D = Number(diameter) || 6;
    const small = D <= 3, med = D > 3 && D <= 12;
    if (operation === 'drill') return small ? 0.02 : med ? 0.06 : 0.12;
    if (operation === 'turning') return small ? 0.04 : med ? 0.12 : 0.18;
    if (materialCode === 'al') return small ? 0.06 : med ? 0.12 : 0.2;
    if (materialCode === 'ss' || materialCode === 'ti') return small ? 0.02 : med ? 0.05 : 0.08;
    return small ? 0.04 : med ? 0.09 : 0.14;
  }
  function displayMaterial(code){
    const map = {al:'Aluminio', st:'Acero', ss:'Inoxidable', ti:'Titanio', ci:'Fundición', pl:'Plástico', cm:'Composite', other:'Otro'};
    return map[code] || code;
  }

  // --- Hook a botón calcular existente ---
  const calcBtn = $('calcBtn'), jsonOut = $('jsonOut');
  if (calcBtn) {
    calcBtn.addEventListener('click', ()=> {
      // read form values (same structure as earlier file)
      const form = {
        machine: $('machineType') ? $('machineType').value : null,
        units: $('units') ? $('units').value : 'metric',
        workMaterial: $('workMaterial') ? $('workMaterial').value : 'st',
        operation: $('operation') ? $('operation').value : 'face',
        toolType: $('toolType') ? $('toolType').value : null,
        toolMaterial: $('toolMaterial') ? $('toolMaterial').value : null,
        coating: $('coating') ? $('coating').value : null,
        diameter: $('diameter') && $('diameter').value ? Number($('diameter').value) : null,
        flutes: $('flutes') && $('flutes').value ? Number($('flutes').value) : 4,
        ap: $('ap') && $('ap').value ? Number($('ap').value) : null,
        ae: $('ae') && $('ae').value ? $('ae').value : null,
        stickout: $('stickout') && $('stickout').value ? Number($('stickout').value) : null,
        cooling: $('cooling') ? $('cooling').value : null,
        priority: $('priority') ? $('priority').value : 'balance',
        cutLength: $('cutLength') && $('cutLength').value ? Number($('cutLength').value) : null,
        notes: $('notes') ? $('notes').value : ''
      };

      const detailed = buildDetailedRecommendation(form);

      const out = {
        form,
        detailed_recommendation: detailed,
        timestamp: new Date().toISOString()
      };

      if (jsonOut) jsonOut.textContent = JSON.stringify(out, null, 2);

      // expose to rpm calculator if exists
      if (window.integrateWithRpmCalculator) {
        try { window.integrateWithRpmCalculator(out); } catch(e){ console.warn(e); }
      }
    });
  }

  // --- minor: preserve export/pdf behavior if existen botones ---
  const pdfBtn = $('pdfBtn'), exportBtn = $('exportBtn');
  if (pdfBtn) pdfBtn.addEventListener('click', async ()=> { $('calcBtn').click(); await exportPdfSnapshot(); });
  if (exportBtn) exportBtn.addEventListener('click', ()=> { if (jsonOut && jsonOut.textContent) downloadJSON('tool-selection', jsonOut.textContent); else alert('Calcula primero.'); });

  // --- helpers para export/pdf (ligeros, reutilizables) ---
  function downloadJSON(name, txt) {
    const blob = new Blob([txt], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${name}.json`; document.body.appendChild(a); a.click(); a.remove();
  }
  async function exportPdfSnapshot(){
    const node = document.querySelector('#toolForm') || document.body;
    const clone = node.cloneNode(true);
    clone.style.background = '#0b1220';
    clone.classList.add('pdf-shot');
    clone.style.position = 'fixed'; clone.style.left = '-9999px';
    document.body.appendChild(clone);
    const canvas = await html2canvas(clone, {scale:2, backgroundColor:'#0b1220'});
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({orientation:'portrait', unit:'pt', format:'a4'});
    const pageWidth = pdf.internal.pageSize.getWidth();
    const imgProps = pdf.getImageProperties(imgData);
    const pdfH = (imgProps.height * pageWidth) / imgProps.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pdfH);
    pdf.save('tool-selection-detailed.pdf');
    clone.remove();
  }

  // --- expose small API to manually request recommendation ---
  window.getToolRecommendation = function(form){ return buildDetailedRecommendation(form); };

})();
