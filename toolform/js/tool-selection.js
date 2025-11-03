// tool-selection.js (coloca en /toolform/js/tool-selection.js)
(() => {
  // --- Datos base (editar data/cutting-data.json si quieres parametrizar) ---
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

  // --- helpers ---
  const inToMm = i => i*25.4;
  function computeRPM(vc_mmin, D_mm) { if (!vc_mmin || !D_mm) return null; return Math.round((1000 * vc_mmin) / (Math.PI * D_mm)); }
  function computeFeed(rpm, fz, z) { if (!rpm || !fz || !z) return null; return Math.round(rpm * fz * z * 100)/100; }
  function computeMRR(ap, ae_mm, feed) { if (!ap || !ae_mm || !feed) return null; return Math.round(ap * ae_mm * feed); }
  function safe(n, dp=3){ return (n===null || n===undefined) ? null : Math.round(n * Math.pow(10,dp))/Math.pow(10,dp); }

  // Try load external data if available
  fetch('data/cutting-data.json').then(r=>r.ok? r.json(): null).then(json => {
    if (!json) return;
    if (json.vc_table) VC_TABLE = json.vc_table;
    if (json.kc_table) Object.assign(KC_TABLE, json.kc_table);
  }).catch(()=>{});

  // DOM ready
  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('tool-selection-root');
    if (!root) { console.error('tool-selection root no encontrado. Añade <div id="tool-selection-root"></div>'); return; }

    // Get elements
    const get = id => document.getElementById(id);
    const machineTypeEl = get('machineType'), unitsEl = get('units'), workMaterialEl = get('workMaterial'),
          operationEl = get('operation'), toolTypeEl = get('toolType'), toolMaterialEl = get('toolMaterial'),
          diameterEl = get('diameter'), flutesEl = get('flutes'), apEl = get('ap'), aeEl = get('ae'),
          stickoutEl = get('stickout'), coolingEl = get('cooling'), priorityEl = get('priority'),
          cutLengthEl = get('cutLength'), notesEl = get('notes'), calcBtn = get('calcBtn'),
          jsonOut = get('jsonOut'), pdfBtn = get('pdfBtn'), exportBtn = get('exportBtn'),
          addVendorBtn = get('addVendorBtn'), vendorsList = get('vendorsList');

    // Ensure required elements exist
    const required = [machineTypeEl, workMaterialEl, operationEl, toolTypeEl, toolMaterialEl, diameterEl, calcBtn, jsonOut];
    if (required.some(x=>!x)) {
      console.error('Faltan elementos necesarios en el DOM. Reemplaza index.html por la versión proporcionada.');
      return;
    }

    // Populate select options initial
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
    function renderExtras() {
      const v = operationEl.value;
      const opExtra = get('opExtra');
      opExtra.innerHTML = '';
      if (v === 'drill') {
        opExtra.innerHTML = `<div class="grid grid-cols-2 gap-3"><div><label class="text-xs muted">Ángulo punta</label><input id="pointAngle" value="118" class="w-full mt-1 p-2 rounded bg-slate-800"></div><div><label class="text-xs muted">Peck</label><select id="peck" class="w-full mt-1 p-2 rounded bg-slate-800"><option>No</option><option>Sí</option></select></div></div>`;
      } else if (v === 'thread') {
        opExtra.innerHTML = `<div class="grid grid-cols-2 gap-3"><div><label class="text-xs muted">Paso</label><input id="threadPitch" class="w-full mt-1 p-2 rounded bg-slate-800"></div><div><label class="text-xs muted">Tipo</label><input id="threadType" class="w-full mt-1 p-2 rounded bg-slate-800"></div></div>`;
      }
    }
    renderExtras();
    operationEl.addEventListener('change', renderExtras);

    // Vendors (in-memory)
    let vendors = [{id:1,name:'Proveedor A',contact:'ventas@provA.com', commissionPct:8},{id:2,name:'Proveedor B',contact:'ventas@provB.com', commissionPct:10}];
    function renderVendors() {
      vendorsList.innerHTML = vendors.map(v => `
        <div class="flex items-center justify-between p-2 rounded bg-slate-800">
          <div><div class="font-medium">${v.name} <span class="text-xs muted">(${v.commissionPct}% comisión)</span></div><div class="text-xs muted">${v.contact}</div></div>
          <div class="flex gap-2">
            <button class="px-2 py-1 bg-indigo-600 rounded text-sm" data-oid="${v.id}">Solicitar</button>
            <button class="px-2 py-1 bg-rose-500 rounded text-sm" data-rid="${v.id}">Eliminar</button>
          </div>
        </div>
      `).join('');
      vendorsList.querySelectorAll('button[data-oid]').forEach(b => b.addEventListener('click', (e) => {
        const id = Number(e.currentTarget.getAttribute('data-oid')); orderFromVendor(id);
      }));
      vendorsList.querySelectorAll('button[data-rid]').forEach(b => b.addEventListener('click', (e) => {
        const id = Number(e.currentTarget.getAttribute('data-rid')); removeVendor(id);
      }));
    }
    renderVendors();
    addVendorBtn.addEventListener('click', ()=> {
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
    function removeVendor(id) { vendors = vendors.filter(x=>x.id!==id); renderVendors(); }

    // Read form
    function readForm() {
      return {
        machine: machineTypeEl.value,
        units: unitsEl.value,
        workMaterial: workMaterialEl.value,
        operation: operationEl.value,
        toolType: toolTypeEl.value,
        toolMaterial: toolMaterialEl.value,
        coating: get('coating').value,
        diameter: Number(diameterEl.value) || null,
        flutes: Number(flutesEl.value) || 1,
        ap: Number(apEl.value) || null,
        ae: aeEl.value || null,
        stickout: Number(stickoutEl.value) || null,
        cooling: coolingEl.value,
        priority: priorityEl.value,
        cutLength: Number(cutLengthEl.value) || null,
        notes: notesEl.value || ''
      };
    }

    // Recommendation engine
    function recommendedFz(operation, materialCode, diameter) {
      const D = Number(diameter) || 6;
      const small = D <= 3, med = D > 3 && D <= 12;
      if (operation === 'drill') return small ? 0.02 : med ? 0.06 : 0.12;
      if (operation === 'turning') return small ? 0.04 : med ? 0.12 : 0.18;
      if (materialCode === 'al') return small ? 0.06 : med ? 0.12 : 0.2;
      if (materialCode === 'ss' || materialCode === 'ti') return small ? 0.02 : med ? 0.05 : 0.08;
      return small ? 0.04 : med ? 0.09 : 0.14;
    }
    function parseAe(aeVal, diameter) {
      if (!aeVal) return null;
      if (typeof aeVal === 'string' && aeVal.trim().endsWith('%')) {
        const p = Number(aeVal.replace('%',''))/100;
        return diameter ? Math.round(diameter * p * 100)/100 : null;
      }
      return Number(aeVal);
    }

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

    function buildDetailedRecommendation(form) {
      const baseChoice = chooseToolForProcess({ operation: form.operation, machine: form.machine, material: form.workMaterial, diameter: form.diameter, priority: form.priority });
      let toolFamily = (form.toolMaterial || '').toLowerCase() || 'carbide';
      if (toolFamily.includes('hss')) toolFamily='hss';
      if (toolFamily.includes('pcd')) toolFamily='pcd';
      if (toolFamily.includes('cbn')) toolFamily='cbn';
      if (toolFamily.includes('cermet')) toolFamily='cermet';

      const vcRow = VC_TABLE[form.workMaterial] || VC_TABLE['st'];
      let vc = (vcRow && vcRow[toolFamily]) ? vcRow[toolFamily] : (vcRow && vcRow['carbide'] ? vcRow['carbide'] : 100);
      if (form.priority === 'toollife') vc *= 0.75;
      if (form.priority === 'cycle') vc *= 1.05;

      let D_mm = form.diameter;
      if (form.units === 'imperial' && form.diameter) D_mm = inToMm(form.diameter);

      const rpm = computeRPM(vc, D_mm);
      const fz = recommendedFz(form.operation, form.workMaterial, D_mm || 6);
      const feed = computeFeed(rpm, fz, form.flutes || 1);
      const ae_mm = parseAe(form.ae, D_mm) || (D_mm ? safe(0.5 * D_mm,2) : null);
      const ap = form.ap || (form.operation==='face' ? safe(2) : safe(1));
      const mrr = computeMRR(ap, ae_mm, feed);
      const kc = KC_TABLE[form.workMaterial] || KC_TABLE.other;
      const power_kW = (mrr && kc) ? safe((kc * mrr) / 60000000, 3) : null;
      const cutLen = form.cutLength || 100;
      const cycle_min = (feed && cutLen) ? safe(cutLen / feed, 3) : null;
      const cycle_sec = cycle_min ? safe(cycle_min * 60, 2) : null;
      const vibRatio = form.stickout && D_mm ? (form.stickout / D_mm) : 0;
      const vibRisk = vibRatio>3 ? 'ALTA' : vibRatio>1.5 ? 'MEDIA' : 'BAJA';

      const rationale = [];
      rationale.push(`Material pieza: ${displayMaterial(form.workMaterial)}.`);
      rationale.push(`Selección: ${baseChoice.tool} (${baseChoice.family}).`);
      rationale.push(`Por qué: ${baseChoice.why.join(' ')}`);
      rationale.push(`Geometría sugerida: ${baseChoice.geometry}.`);
      rationale.push(`Parámetros aproximados: vc ≈ ${safe(vc)} m/min, rpm ≈ ${rpm} rpm, fz ≈ ${fz} mm/diente, avance ≈ ${feed} mm/min.`);
      rationale.push(`Condiciones: ap ≈ ${ap} mm, ae ≈ ${ae_mm} mm.`);
      rationale.push(`MRR ≈ ${mrr} mm³/min. Potencia ≈ ${power_kW} kW.`);
      rationale.push(`Tiempo de corte ≈ ${cycle_min} min (${cycle_sec} s) para ${cutLen} mm.`);
      if (vibRisk!=='BAJA') rationale.push(`Precaución: ${vibRisk} riesgo de vibración (porte/diametro = ${safe(vibRatio,2)}).`);

      return {
        selection: {
          tool: baseChoice.tool,
          tool_family: baseChoice.family,
          recommended_material: baseChoice.family,
          recommended_coating: baseChoice.coating,
          geometry: baseChoice.geometry
        },
        parameters: {
          vc_mmin: safe(vc),
          rpm, fz, feed_mm_per_min: feed, ap_mm: ap, ae_mm, mrr_mm3_per_min: mrr, power_kW, cycle_min, cycle_sec, cut_length_mm: cutLen
        },
        rationale_text: rationale.join(' '),
        heuristics: { vibrationRisk: vibRisk, vibRatio: safe(vibRatio,2) }
      };
    }

    // Utility
    function inToMm(i){ return i*25.4; }
    function displayMaterial(code){ const map={al:'Aluminio',st:'Acero',ss:'Inoxidable',ti:'Titanio',ci:'Fundición',pl:'Plástico',cm:'Composite',other:'Otro'}; return map[code]||code; }

    // Build payload and display
    function buildPayload(){
      const form = readForm();
      const detailed = buildDetailedRecommendation(form);
      return { form, detailed_recommendation: detailed, timestamp: new Date().toISOString() };
    }

    // Buttons
    calcBtn.addEventListener('click', ()=> {
      const out = buildPayload();
      jsonOut.textContent = JSON.stringify(out, null, 2);
      // expose to rpm calculator if exists
      if (window.integrateWithRpmCalculator) {
        try { window.integrateWithRpmCalculator(out); } catch(e){ console.warn(e); }
      }
    });

    exportBtn.addEventListener('click', ()=> {
      if (!jsonOut.textContent) return alert('Calcula primero.');
      const blob = new Blob([jsonOut.textContent], {type:'application/json'});
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'tool-selection.json'; document.body.appendChild(a); a.click(); a.remove();
    });

    pdfBtn.addEventListener('click', async ()=> {
      calcBtn.click();
      const node = get('toolForm');
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
      pdf.save('tool-selection.pdf');
      clone.remove();
    });

    // CSV order quick-generate
    get('orderCsvBtn') && get('orderCsvBtn').addEventListener('click', ()=> {
      if (!jsonOut.textContent) return alert('Calcula primero.');
      const payload = JSON.parse(jsonOut.textContent);
      const rows = [['item','diameter','toolType','toolMaterial','coating','qty','notes'], [payload.detailed_recommendation.selection.geometry || 'Recomendado', payload.form.diameter||'', payload.form.toolType, payload.form.toolMaterial, payload.form.coating, 1, payload.form.notes||'']];
      const csv = rows.map(r=>r.map(cell => `"${String(cell||'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
      const blob = new Blob([csv], {type:'text/csv'}); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'pedido_herramienta.csv'; document.body.appendChild(a); a.click(); a.remove();
    });

    // expose manual call
    window.getToolRecommendation = function(form){ return buildDetailedRecommendation(form); };
  });

})();
