// tool-selection.js - versión completa con valores por defecto y tarjetas imprimibles
(() => {
  // Datos base
  const VC_TABLE = {
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

  // Helpers
  const inToMm = i => Number(i) * 25.4;
  function computeRPM(vc_mmin, D_mm) { if (!vc_mmin || !D_mm) return null; return Math.round((1000 * vc_mmin) / (Math.PI * D_mm)); }
  function computeFeed(rpm, fz, z) { if (!rpm || !fz || !z) return null; return Math.round(rpm * fz * z * 100)/100; }
  function computeMRR(ap, ae_mm, feed) { if (!ap || !ae_mm || !feed) return null; return Math.round(ap * ae_mm * feed); }
  function safe(n, dp=3){ return (n===null || n===undefined || Number.isNaN(n)) ? null : Math.round(Number(n) * Math.pow(10,dp))/Math.pow(10,dp); }
  function displayMaterial(code){ const map={al:'Aluminio',st:'Acero',ss:'Inoxidable',ti:'Titanio',ci:'Fundición',pl:'Plástico',cm:'Composite',other:'Otro'}; return map[code]||code; }
  function parseAe(aeVal, diameter) {
    if (!aeVal) return null;
    const s = String(aeVal).trim();
    if (s.endsWith('%')) {
      const p = Number(s.replace('%',''))/100;
      return diameter ? Math.round(diameter * p * 100)/100 : null;
    }
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  function recommendedFz(operation, materialCode, diameter) {
    const D = Number(diameter) || 6;
    const small = D <= 3, med = D > 3 && D <= 12;
    if (operation === 'drill') return small ? 0.02 : med ? 0.06 : 0.12;
    if (operation === 'turning') return small ? 0.04 : med ? 0.12 : 0.18;
    if (materialCode === 'al') return small ? 0.06 : med ? 0.12 : 0.2;
    if (materialCode === 'ss' || materialCode === 'ti') return small ? 0.02 : med ? 0.05 : 0.08;
    return small ? 0.04 : med ? 0.09 : 0.14;
  }

  // Intentional: cargar tabla externa opcional
  fetch('data/cutting-data.json').then(r=>r.ok? r.json(): null).then(json => {
    if (!json) return;
    if (json.vc_table) Object.assign(VC_TABLE, json.vc_table);
    if (json.kc_table) Object.assign(KC_TABLE, json.kc_table);
  }).catch(()=>{ /* silent */ });

  // DOM
  document.addEventListener('DOMContentLoaded', () => {
  const $ = id => document.getElementById(id);
  const machineTypeEl = $('machineType'),
        unitsEl       = $('units'),
        workMaterialEl= $('workMaterial'),
        operationEl   = $('operation'),
        toolTypeEl    = $('toolType'),
        toolMaterialEl= $('toolMaterial'),
        diameterEl    = $('diameter'),
        flutesEl      = $('flutes'),
        apEl          = $('ap'),
        aeEl          = $('ae'),
        stickoutEl    = $('stickout'),
        coolingEl     = $('cooling'),
        priorityEl    = $('priority'),
        cutLengthEl   = $('cutLength'),
        notesEl       = $('notes'),
        calcBtn       = $('calcBtn'),
        exportBtn     = $('exportBtn'),
        addVendorBtn  = $('addVendorBtn'),
        vendorsList   = $('vendorsList'),
        resultsCards  = $('resultsCards');

  // 1) Quitar del DOM el <pre id="jsonOut"> si existe (no se mostrará)
  const jsonOut = document.getElementById('jsonOut');
  if (jsonOut) jsonOut.remove();

  // 2) Quitar cualquier botón con id="pdfBtn" para evitar UI muerta y errores
  const pdfBtn = document.getElementById('pdfBtn');
  if (pdfBtn) pdfBtn.remove();

  // 3) Comprobación mínima de integridad del formulario
  if (!machineTypeEl || !workMaterialEl || !operationEl || !calcBtn || !resultsCards) {
    console.error('Formulario incompleto o contenedores no encontrados.');
    return;
  }

  // ... resto del código que ya tienes permanece igual ...
});


    // Populate tool options
    function populateToolOptions() {
      const m = machineTypeEl.value;
      const types = TOOL_TYPES_BY_MACHINE[m] || TOOL_TYPES_BY_MACHINE['vmc'];
      toolTypeEl.innerHTML = types.map(t => `<option value="${t}">${t}</option>`).join('');
      const mats = (m === 'lathe' || m==='turn-mill') ? TOOL_MATERIALS.lathe : TOOL_MATERIALS.default;
      toolMaterialEl.innerHTML = mats.map(x=>`<option value="${x}">${x}</option>`).join('');
    }
    populateToolOptions();
    machineTypeEl.addEventListener('change', populateToolOptions);

    // Operation extras
    operationEl.addEventListener('change', ()=> {
      const opExtra = $('opExtra');
      if (!opExtra) return;
      opExtra.innerHTML = '';
      if (operationEl.value === 'drill') {
        opExtra.innerHTML = `<div class="grid grid-cols-2 gap-3"><div><label class="text-xs muted">Ángulo punta</label><input id="pointAngle" value="118" class="w-full mt-1 p-2 rounded bg-slate-800"></div></div>`;
      } else if (operationEl.value === 'thread') {
        opExtra.innerHTML = `<div class="grid grid-cols-2 gap-3"><div><label class="text-xs muted">Paso (mm)</label><input id="threadPitch" class="w-full mt-1 p-2 rounded bg-slate-800"></div></div>`;
      }
    });

    // Vendors simple
    let vendors = [{id:1,name:'Proveedor A',contact:'ventas@provA.com', commissionPct:8},{id:2,name:'Proveedor B',contact:'ventas@provB.com', commissionPct:10}];
    function renderVendors(){
      if (!vendorsList) return;
      vendorsList.innerHTML = vendors.map(v=>`
        <div class="flex items-center justify-between p-2 rounded bg-slate-800">
          <div><div class="font-medium">${v.name} <span class="text-xs muted">(${v.commissionPct}% comisión)</span></div><div class="text-xs muted">${v.contact}</div></div>
          <div class="flex gap-2">
            <button class="px-2 py-1 bg-indigo-600 rounded text-sm" data-oid="${v.id}">Solicitar</button>
            <button class="px-2 py-1 bg-rose-500 rounded text-sm" data-rid="${v.id}">Eliminar</button>
          </div>
        </div>`).join('');
      vendorsList.querySelectorAll('button[data-oid]').forEach(b => b.addEventListener('click', e => orderFromVendor(Number(e.currentTarget.getAttribute('data-oid')))));
      vendorsList.querySelectorAll('button[data-rid]').forEach(b => b.addEventListener('click', e => { removeVendor(Number(e.currentTarget.getAttribute('data-rid'))); }));
    }
    renderVendors();
    addVendorBtn && addVendorBtn.addEventListener('click', ()=> {
      const name = prompt('Nombre proveedor'); if(!name) return;
      const contact = prompt('Email de contacto') || '';
      const commission = Number(prompt('Comisión % (ej. 8)')) || 0;
      const id = Math.max(0,...vendors.map(v=>v.id))+1;
      vendors.push({id,name,contact,commissionPct:commission});
      renderVendors();
    });
    function orderFromVendor(id) {
      const v = vendors.find(x=>x.id===id);
      if (!v) return alert('Proveedor no encontrado');
      const payload = buildPayload();
      const subject = encodeURIComponent(`Solicitud de herramienta - ${v.name}`);
      const body = encodeURIComponent(`Solicito cotización:\n\n${JSON.stringify(payload,null,2)}\n\nComisión solicitada: ${v.commissionPct}%`);
      window.location.href = `mailto:${v.contact}?subject=${subject}&body=${body}`;
    }
    function removeVendor(id){ vendors = vendors.filter(x=>x.id!==id); renderVendors(); }

    // Recomendador principal con defaults
    function buildDetailedRecommendation(form) {
      const baseChoice = chooseToolForProcess({
        operation: form.operation,
        machine: form.machine,
        material: form.workMaterial,
        diameter: form.diameter,
        priority: form.priority
      });

      // Normalizar tool family
      let toolFamily = (form.toolMaterial || '').toLowerCase() || 'carbide';
      if (toolFamily.includes('hss')) toolFamily = 'hss';
      if (toolFamily.includes('pcd')) toolFamily = 'pcd';
      if (toolFamily.includes('cbn')) toolFamily = 'cbn';
      if (toolFamily.includes('cermet')) toolFamily = 'cermet';

      // Defaults sensatos
      const DEFAULT_DIAM_MM = 6;
      let D_mm = (form.diameter && !isNaN(form.diameter)) ? Number(form.diameter) : DEFAULT_DIAM_MM;
      if (form.units === 'imperial' && form.diameter) D_mm = inToMm(form.diameter);

      const vcRow = VC_TABLE[form.workMaterial] || VC_TABLE['st'];
      let vc = (vcRow && vcRow[toolFamily]) ? vcRow[toolFamily] : (vcRow && vcRow['carbide'] ? vcRow['carbide'] : 100);
      if (form.priority === 'toollife') vc *= 0.75;
      if (form.priority === 'cycle') vc *= 1.05;

      const flutes = (form.flutes && !isNaN(form.flutes)) ? Number(form.flutes) : 1;
      const rpm = computeRPM(vc, D_mm);
      const fz = recommendedFz(form.operation, form.workMaterial, D_mm || DEFAULT_DIAM_MM);
      const feed = computeFeed(rpm, fz, flutes);
      const ae_mm = parseAe(form.ae, D_mm) || safe(0.5 * D_mm, 2);
      const ap = (form.ap && !isNaN(form.ap)) ? Number(form.ap) : (form.operation === 'face' ? safe(2) : safe(1));
      const mrr = computeMRR(ap, ae_mm, feed);
      const kc = KC_TABLE[form.workMaterial] || KC_TABLE.other;
      const power_kW = (mrr && kc) ? safe((kc * mrr) / 60000000, 3) : null;
      const cutLen = form.cutLength || 100;
      const cycle_min = (feed && cutLen) ? safe(cutLen / feed, 3) : null;
      const cycle_sec = cycle_min ? safe(cycle_min * 60, 2) : null;
      const vibRatio = form.stickout && D_mm ? (form.stickout / D_mm) : 0;
      const vibRisk = vibRatio > 3 ? 'ALTA' : vibRatio > 1.5 ? 'MEDIA' : 'BAJA';

      const userCoating = (form.coating && String(form.coating).toLowerCase() !== 'none') ? form.coating : null;
      const recommendedCoating = userCoating || baseChoice.coating || 'Ninguno';

      const rationale = [];
      rationale.push(`Material pieza: ${displayMaterial(form.workMaterial)}.`);
      rationale.push(`Selección: ${baseChoice.tool} (${baseChoice.family}).`);
      rationale.push(`Por qué: ${baseChoice.why.join(' ')}`);
      rationale.push(`Geometría sugerida: ${baseChoice.geometry}.`);
      rationale.push(`Parámetros aproximados: vc ≈ ${safe(vc)} m/min, rpm ≈ ${rpm !== null ? rpm : '—'} rpm, fz ≈ ${fz} mm/diente, avance ≈ ${feed !== null ? feed : '—'} mm/min.`);
      rationale.push(`Condiciones: ap ≈ ${ap} mm, ae ≈ ${ae_mm} mm.`);
      rationale.push(`MRR ≈ ${mrr !== null ? mrr : '—'} mm³/min. Potencia ≈ ${power_kW !== null ? power_kW : '—'} kW.`);
      rationale.push(`Tiempo de corte ≈ ${cycle_min !== null ? cycle_min + ' min' : '—'} (${cycle_sec !== null ? cycle_sec + ' s' : '—'}) para ${cutLen} mm.`);
      if (vibRisk !== 'BAJA') rationale.push(`Precaución: ${vibRisk} riesgo de vibración (porte/diametro = ${safe(vibRatio, 2)}).`);

      return {
        selection: {
          tool: baseChoice.tool,
          tool_family: baseChoice.family,
          recommended_material: baseChoice.family,
          recommended_coating: recommendedCoating,
          geometry: baseChoice.geometry
        },
        parameters: {
          vc_mmin: safe(vc),
          rpm: rpm !== null ? rpm : null,
          fz,
          feed_mm_per_min: feed !== null ? feed : null,
          ap_mm: ap,
          ae_mm,
          mrr_mm3_per_min: mrr !== null ? mrr : null,
          power_kW: power_kW !== null ? power_kW : null,
          cycle_min: cycle_min !== null ? cycle_min : null,
          cycle_sec: cycle_sec !== null ? cycle_sec : null,
          cut_length_mm: cutLen
        },
        rationale_text: rationale.join(' '),
        heuristics: { vibrationRisk: vibRisk, vibRatio: safe(vibRatio,2) }
      };
    }

    // Heurística simple de selección (mantenemos)
    function chooseToolForProcess({operation, machine, material, diameter, priority}) {
      const out = { tool:'Fresa de extremo', family:'Carburo', coating:'AlTiN', geometry:'hélice estándar', why:[] };
      if (operation === 'drill') {
        out.tool = (diameter && diameter > 12) ? 'Broca sólida (carburo macizo)' : 'Broca insertable';
        out.family = (diameter && diameter <= 6) ? 'HSS o Carburo' : 'Carburo';
        out.coating = (material === 'al') ? 'Ninguno / Pulido' : 'AlTiN';
        out.geometry = 'ángulo punta 118-140°, flauta para evacuación';
        out.why.push('Taladrado requiere evacuación y rigidez; carburo para diámetros grandes.');
      } else if (operation === 'turning' || machine === 'lathe') {
        out.tool = 'Porta-insertos (torneado)';
        out.family = 'Carburo (placas)';
        out.coating = (material === 'st' || material === 'ss') ? 'AlTiN/TiCN' : 'AlTiN';
        out.geometry = 'radio 0.2-0.8 mm para acabado';
        out.why.push('Insertos permiten cambios rápidos y vida de herramienta');
      } else {
        if (['face','pocket','contour','slot'].includes(operation)) {
          if (priority === 'cycle') {
            out.tool = 'Fresa de desbaste';
            out.geometry = 'hélice baja, arista robusta';
            out.why.push('Optimiza tiempo de ciclo con mayor ap/ae.');
          } else {
            out.tool = 'Fresa de acabado';
            out.geometry = 'hélice alta, filo pulido';
            out.why.push('Mejor acabado y vida de herramienta.');
          }
          if (material === 'al') { out.family='Carburo pulido / PCD'; out.coating='Sin recubrimiento / pulido'; out.why.push('Aluminio necesita filo pulido.'); }
          if (material === 'ti') { out.family='Carburo alta tenacidad'; out.coating='AlTiN'; out.why.push('Titanio: baja ap y diente pulido.'); }
          if (material === 'ss') { out.family='Carburo / Cermet'; out.coating='AlTiN / TiCN'; out.why.push('Inoxidable: avances bajos y recubrimiento duro.'); }
        } else if (operation === 'thread') {
          out.tool = 'Herramienta de roscar';
          out.family = 'Carburo o HSS según hilo';
          out.coating = (material === 'al') ? 'Ninguno' : 'AlTiN';
          out.geometry = 'perfil de rosca correspondiente';
          out.why.push('Roscar exige control de avance por paso.');
        }
      }
      return out;
    }

    // Render tarjetas
    function renderCards(payload) {
      resultsCards.innerHTML = '';
      const card = createCard(payload);
      resultsCards.appendChild(card);
      jsonOut && (jsonOut.textContent = JSON.stringify(payload, null, 2));
    }

    // createCard con guiones y recubrimiento seguro
    // reemplazar la función createCard existente por esta
function createCard(payload) {
  const form = payload.form;
  const det = payload.detailed_recommendation;
  const p = det.parameters || {};
  const show = (v, u='') => (v === null || v === undefined) ? '—' : `${v}${u ? ' ' + u : ''}`;

  const wrapper = document.createElement('article');
  wrapper.className = 'result-card';

  const h = document.createElement('h4');
  h.innerHTML = `<strong>${det.selection.tool}</strong> — ${det.selection.tool_family} <span class="badge-small">${det.selection.recommended_coating || '—'}</span>`;
  wrapper.appendChild(h);

  const meta = document.createElement('div');
  meta.className = 'result-meta';
  meta.innerHTML = `<div class="kv">${displayMaterial(form.workMaterial)}</div>
                    <div class="kv">Máquina: ${form.machine}</div>
                    <div class="kv">Operación: ${form.operation}</div>
                    <div class="kv">Longitud: ${show(form.cutLength, 'mm')}</div>`;
  wrapper.appendChild(meta);

  const params = document.createElement('div');
  params.innerHTML = `<div><strong>Parámetros</strong></div>
    <div class="kv">vc ≈ ${show(p.vc_mmin, 'm/min')} · rpm ≈ ${show(p.rpm, 'rpm')}</div>
    <div class="kv">fz ≈ ${show(p.fz, 'mm/diente')} · Avance ≈ ${show(p.feed_mm_per_min, 'mm/min')}</div>
    <div class="kv">ap ${show(p.ap_mm, 'mm')} · ae ${show(p.ae_mm, 'mm')}</div>
    <div class="kv">MRR ≈ ${show(p.mrr_mm3_per_min, 'mm³/min')} · Potencia ≈ ${show(p.power_kW, 'kW')}</div>
    <div class="kv">Tiempo de corte ≈ ${show(p.cycle_min, 'min')} (${show(p.cycle_sec, 's')})</div>`;
  wrapper.appendChild(params);

  const r = document.createElement('div');
  r.innerHTML = `<div><strong>Por qué</strong></div><div class="kv">${det.rationale_text}</div>`;
  wrapper.appendChild(r);

  const actions = document.createElement('div');
  actions.className = 'result-actions';
  const printBtn = document.createElement('button');
  printBtn.className = 'px-3 py-1 bg-gray-600 rounded text-sm';
  printBtn.innerText = 'Imprimir tarjeta';
  printBtn.addEventListener('click', ()=> printCard(wrapper));
  actions.appendChild(printBtn);

  wrapper.appendChild(actions);
  return wrapper;
}


    // print single card
    function buildPrintHtml(innerHTML) {
      return `
        <!doctype html>
        <html>
        <head>
          <meta charset="utf-8">
          <title>Imprimir tarjeta</title>
          <style>
            body{ background:#0b1220; color:#e6eef8; font-family:Inter,Arial; padding:12px; }
            .result-card{ background:#0f172a; border:1px solid rgba(255,255,255,0.03); padding:12px; border-radius:8px; color:#e6eef8; margin-bottom:12px; }
            h4{ margin:0 0 6px 0; }
            .kv{ font-size:13px; color:#c8d6e3; margin-top:4px; }
          </style>
        </head>
        <body>
          <div id="print-shell">
            ${innerHTML}
          </div>
        </body>
        </html>
      `;
    }

    function printCard(cardEl) {
      const win = window.open('', '_blank', 'width=800,height=1000');
      if (!win) return alert('Popups bloqueados. Habilita popups para imprimir.');
      const html = buildPrintHtml(cardEl.outerHTML);
      win.document.open(); win.document.write(html); win.document.close();
      setTimeout(()=> { win.print(); }, 500);
    }

    // export PDF single card
    async function exportCardPdf(cardEl, filename='card.pdf') {
      const clone = cardEl.cloneNode(true);
      const shell = document.createElement('div');
      shell.style.background = '#0b1220';
      shell.style.padding = '12px';
      shell.appendChild(clone);
      document.body.appendChild(shell);
      const canvas = await html2canvas(shell, {scale:2, backgroundColor:'#0b1220'});
      const imgData = canvas.toDataURL('image/png');
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({orientation:'portrait', unit:'pt', format:'a4'});
      const pageWidth = pdf.internal.pageSize.getWidth();
      const imgProps = pdf.getImageProperties(imgData);
      const pdfH = (imgProps.height * pageWidth) / imgProps.width;
      pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pdfH);
      pdf.save(filename);
      shell.remove();
    }

    // Print all cards (uses current resultsCards.innerHTML)
    const printAllBtn = $('printAllBtn');
    printAllBtn && printAllBtn.addEventListener('click', ()=> {
      const htmlCards = resultsCards.innerHTML;
      if (!htmlCards) return alert('Calcula primero para generar tarjetas.');
      const win = window.open('', '_blank', 'width=1000,height=1200');
      if (!win) return alert('Popups bloqueados. Habilita popups para imprimir.');
      const html = buildPrintHtml(htmlCards);
      win.document.open(); win.document.write(html); win.document.close();
      setTimeout(()=> win.print(), 500);
    });

    // Export JSON
    exportBtn && exportBtn.addEventListener('click', ()=> {
      if (!jsonOut || !jsonOut.textContent) return alert('Calcula primero.');
      const blob = new Blob([jsonOut.textContent], {type:'application/json'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'tool-selection.json'; document.body.appendChild(a); a.click(); a.remove();
    });

    // Calc
    calcBtn.addEventListener('click', ()=> {
      const form = {
        machine: machineTypeEl.value,
        units: unitsEl.value,
        workMaterial: workMaterialEl.value,
        operation: operationEl.value,
        toolType: toolTypeEl.value,
        toolMaterial: toolMaterialEl.value,
        coating: $('coating') ? $('coating').value : '',
        diameter: (diameterEl && diameterEl.value) ? Number(diameterEl.value) : null,
        flutes: (flutesEl && flutesEl.value) ? Number(flutesEl.value) : null,
        ap: (apEl && apEl.value) ? Number(apEl.value) : null,
        ae: aeEl && aeEl.value ? aeEl.value : null,
        stickout: (stickoutEl && stickoutEl.value) ? Number(stickoutEl.value) : null,
        cooling: coolingEl ? coolingEl.value : '',
        priority: priorityEl ? priorityEl.value : 'balance',
        cutLength: (cutLengthEl && cutLengthEl.value) ? Number(cutLengthEl.value) : null,
        notes: notesEl ? notesEl.value : ''
      };
      const detailed = buildDetailedRecommendation(form);
      const payload = { form, detailed_recommendation: detailed, timestamp: new Date().toISOString() };
      renderCards(payload);
    });

    // Expose API
    window.getToolRecommendation = function(form){ return buildDetailedRecommendation(form); };
    window.getToolPayload = buildPayload;
    function buildPayload(){ const form = {
      machine: machineTypeEl.value,
      units: unitsEl.value,
      workMaterial: workMaterialEl.value,
      operation: operationEl.value,
      toolType: toolTypeEl.value,
      toolMaterial: toolMaterialEl.value,
      coating: $('coating') ? $('coating').value : '',
      diameter: (diameterEl && diameterEl.value) ? Number(diameterEl.value) : null,
      flutes: (flutesEl && flutesEl.value) ? Number(flutesEl.value) : null,
      ap: (apEl && apEl.value) ? Number(apEl.value) : null,
      ae: aeEl && aeEl.value ? aeEl.value : null,
      stickout: (stickoutEl && stickoutEl.value) ? Number(stickoutEl.value) : null,
      cooling: coolingEl ? coolingEl.value : '',
      priority: priorityEl ? priorityEl.value : 'balance',
      cutLength: (cutLengthEl && cutLengthEl.value) ? Number(cutLengthEl.value) : null,
      notes: notesEl ? notesEl.value : ''
    }; return { form, detailed_recommendation: buildDetailedRecommendation(form), timestamp: new Date().toISOString() }; }
  });
}();
