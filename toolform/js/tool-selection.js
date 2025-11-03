// toolfom/js/tool-selection.js
(() => {
  // tablas base y heurísticos
  let VC_TABLE = {
    al: { carbide: 800, hss: 300, pcd: 1200 },
    st: { carbide: 150, hss: 60, cermet: 120 },
    ss: { carbide: 60, cermet: 40, cbn: 30 },
    ti: { carbide: 30, cermet: 20 },
    ci: { carbide: 80 },
    pl: { carbide: 600, pcd: 1000 },
    cm: { carbide: 20 }
  };
  // energía específica kc (N/mm^2) heurística
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

  // helpers unidades y cálculos
  const mmToIn = mm => mm/25.4;
  const inToMm = inch => inch*25.4;
  function computeRPM(vc_mmin, D_mm) { if (!vc_mmin || !D_mm) return null; return Math.round( (1000 * vc_mmin) / (Math.PI * D_mm) ); }
  function computeFeed(rpm, fz, z) { if (!rpm || !fz || !z) return null; return Math.round(rpm * fz * z * 100)/100; }
  function computeMRR(ap, ae_mm, feed) { if (!ap || !ae_mm || !feed) return null; return Math.round(ap * ae_mm * feed); }

  function recommendedFz(operation, materialCode, diameter) {
    const D = Number(diameter) || 6;
    const small = D <= 3; const med = D > 3 && D <= 12;
    if (operation === 'drill') return small ? 0.02 : med ? 0.06 : 0.12;
    if (operation === 'turning') return small ? 0.04 : med ? 0.12 : 0.18;
    if (materialCode === 'al') return small ? 0.06 : med ? 0.12 : 0.2;
    if (materialCode === 'ss' || materialCode === 'ti') return small ? 0.02 : med ? 0.05 : 0.08;
    return small ? 0.04 : med ? 0.09 : 0.14;
  }

  function recommendTooling(materialCode) {
    if (materialCode === 'al') return { toolMaterial: 'Carburo (pulido)', coating: 'Ninguno', geometry: 'hélice alta, radio pequeño' };
    if (materialCode === 'st') return { toolMaterial: 'Carburo', coating: 'AlTiN', geometry: 'hélice mediana, radio 0.4-1.2mm' };
    if (materialCode === 'ss') return { toolMaterial: 'Carburo/Cermet', coating: 'AlTiN/TiCN', geometry: 'cuchillas robustas, avance bajo' };
    if (materialCode === 'ti') return { toolMaterial: 'Carburo alta resistencia', coating: 'AlTiN o sin recubrimiento', geometry: 'dientes pulidos, baja ap' };
    if (materialCode === 'pl') return { toolMaterial: 'PCD', coating: 'PCD', geometry: 'afilado, baja hélice' };
    return { toolMaterial: 'Carburo', coating: 'AlTiN', geometry: 'config estándar' };
  }

  // carga cutting-data si existe
  fetch('data/cutting-data.json').then(r=>r.ok? r.json(): null).then(json => {
    if (json && json.vc_table) VC_TABLE = json.vc_table;
    if (json && json.kc_table) Object.assign(KC_TABLE, json.kc_table);
  }).catch(()=>{});

  // render UI
  const root = document.getElementById('tool-selection-root');
  root.innerHTML = `
    <div class="dark-card">
      <div class="flex items-center justify-between mb-3">
        <h2 class="text-lg font-semibold">Selección de herramienta — AlexRaSa</h2>
        <div class="flex gap-2">
          <button id="pdfBtn" class="px-3 py-1 rounded bg-emerald-600 text-sm">Exportar a PDF</button>
          <button id="orderCsvBtn" class="px-3 py-1 rounded bg-sky-600 text-sm">Generar pedido CSV</button>
        </div>
      </div>

      <form id="toolForm" autocomplete="off">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div><label class="text-xs muted">Máquina *</label><select id="machineType" class="w-full mt-1 p-2 rounded bg-slate-800" required> <option value="vmc">VMC</option><option value="hmc">HMC</option><option value="lathe">Torno</option><option value="turn-mill">Turn-Mill</option><option value="router">Router</option><option value="5axis">5-ejes</option><option value="drill">Taladro</option></select></div>
          <div><label class="text-xs muted">Unidades</label><select id="units" class="w-full mt-1 p-2 rounded bg-slate-800"><option value="metric" selected>Métrico (mm)</option><option value="imperial">Imperial (in)</option></select></div>
          <div><label class="text-xs muted">Material pieza *</label><select id="workMaterial" class="w-full mt-1 p-2 rounded bg-slate-800" required><option value="al">Aluminio</option><option value="st">Acero</option><option value="ss">Inoxidable</option><option value="ti">Titanio</option><option value="ci">Fundición</option><option value="pl">Plástico</option><option value="cm">Composite</option><option value="other">Otro</option></select></div>
          <div><label class="text-xs muted">Operación *</label><select id="operation" class="w-full mt-1 p-2 rounded bg-slate-800" required><option value="face">Fresado frontal</option><option value="contour">Fresado contorno</option><option value="pocket">Bolsillo</option><option value="slot">Ranura</option><option value="drill">Taladrado</option><option value="turning">Torneado</option><option value="thread">Roscar</option><option value="five">5-ejes</option></select></div>
          <div><label class="text-xs muted">Tipo herramienta *</label><select id="toolType" class="w-full mt-1 p-2 rounded bg-slate-800" required></select></div>
          <div><label class="text-xs muted">Material herramienta *</label><select id="toolMaterial" class="w-full mt-1 p-2 rounded bg-slate-800" required></select></div>
          <div><label class="text-xs muted">Recubrimiento</label><select id="coating" class="w-full mt-1 p-2 rounded bg-slate-800"><option value="none">Ninguno</option><option>TiN</option><option>TiAlN</option><option>AlTiN</option><option>DLC</option><option>PCD</option><option>Otro</option></select></div>
          <div><label class="text-xs muted">Diámetro (D) *</label><input id="diameter" type="number" min="0.01" step="0.01" class="w-full mt-1 p-2 rounded bg-slate-800" placeholder="mm"></div>
          <div><label class="text-xs muted"># Faltas / Cortes (z)</label><input id="flutes" type="number" min="1" max="12" value="4" class="w-full mt-1 p-2 rounded bg-slate-800"></div>
          <div><label class="text-xs muted">Profundidad axial (ap)</label><input id="ap" type="number" step="0.01" class="w-full mt-1 p-2 rounded bg-slate-800" placeholder="mm"></div>
          <div><label class="text-xs muted">Ingreso radial (ae)</label><input id="ae" type="text" class="w-full mt-1 p-2 rounded bg-slate-800" placeholder="mm o %D"></div>
          <div><label class="text-xs muted">Stickout (porte)</label><input id="stickout" type="number" step="0.1" class="w-full mt-1 p-2 rounded bg-slate-800" placeholder="mm"></div>
          <div><label class="text-xs muted">Refrigeración</label><select id="cooling" class="w-full mt-1 p-2 rounded bg-slate-800"><option>Soluble</option><option>MQL</option><option>Seco</option><option>Nebulizado</option><option>Aire</option></select></div>
          <div><label class="text-xs muted">Prioridad</label><select id="priority" class="w-full mt-1 p-2 rounded bg-slate-800"><option value="cycle">Min tiempo de ciclo</option><option value="toollife">Max vida de herramienta</option><option value="balance" selected>Balance</option></select></div>

          <div class="col-span-1 md:col-span-2" id="opExtra"></div>

          <div><label class="text-xs muted">Longitud de corte (mm) - opcional</label><input id="cutLength" type="number" min="1" step="1" class="w-full mt-1 p-2 rounded bg-slate-800" placeholder="ej. 120"></div>

          <div class="col-span-1 md:col-span-2">
            <label class="text-xs muted">Notas / Restricciones</label>
            <textarea id="notes" class="w-full mt-1 p-2 rounded bg-slate-800" rows="3"></textarea>
          </div>
        </div>

        <div class="flex gap-2 mt-4">
          <button id="calcBtn" type="button" class="px-4 py-2 bg-indigo-600 rounded">Calcular y Recomendar</button>
          <button id="exportBtn" type="button" class="px-4 py-2 bg-emerald-600 rounded">Exportar JSON</button>
          <button id="submitBtn" type="submit" class="px-4 py-2 bg-sky-600 rounded">Enviar</button>
        </div>

        <pre id="jsonOut" class="mt-3 p-3 bg-slate-800 rounded text-xs overflow-auto" style="max-height:320px"></pre>
      </form>

      <section class="mt-6 p-4 rounded dark-card">
        <div class="flex justify-between items-center">
          <h3 class="font-semibold">Proveedores</h3>
          <button id="addVendorBtn" class="px-2 py-1 bg-rose-500 rounded text-sm">Agregar</button>
        </div>
        <div id="vendorsList" class="mt-3 space-y-2"></div>
      </section>
    </div>
  `;

  // refs
  const machineTypeEl = document.getElementById('machineType');
  const toolTypeEl = document.getElementById('toolType');
  const toolMaterialEl = document.getElementById('toolMaterial');
  const operationEl = document.getElementById('operation');
  const workMaterialEl = document.getElementById('workMaterial');

  // vendors (in-memory)
  let vendors = [{id:1,name:'Proveedor A',contact:'ventas@provA.com', commissionPct:8},{id:2,name:'Proveedor B',contact:'ventas@provB.com', commissionPct:10}];

  function populateToolOptions() {
    const m = machineTypeEl.value;
    const types = TOOL_TYPES_BY_MACHINE[m] || TOOL_TYPES_BY_MACHINE['vmc'];
    toolTypeEl.innerHTML = types.map(t => `<option>${t}</option>`).join('');
    const mats = (m === 'lathe' || m==='turn-mill') ? TOOL_MATERIALS.lathe : TOOL_MATERIALS.default;
    toolMaterialEl.innerHTML = mats.map(x=>`<option>${x}</option>`).join('');
  }
  populateToolOptions();
  machineTypeEl.addEventListener('change', populateToolOptions);

  function renderExtras() {
    const v = operationEl.value;
    const opExtra = document.getElementById('opExtra');
    opExtra.innerHTML = '';
    if (v === 'drill') {
      opExtra.innerHTML = `<div class="grid grid-cols-2 gap-3"><div><label class="text-xs muted">Ángulo punta</label><input id="pointAngle" value="118" class="w-full mt-1 p-2 rounded bg-slate-800"></div><div><label class="text-xs muted">Peck</label><select id="peck" class="w-full mt-1 p-2 rounded bg-slate-800"><option>No</option><option>Sí</option></select></div></div>`;
    } else if (v === 'thread') {
      opExtra.innerHTML = `<div class="grid grid-cols-2 gap-3"><div><label class="text-xs muted">Paso</label><input id="threadPitch" class="w-full mt-1 p-2 rounded bg-slate-800"></div><div><label class="text-xs muted">Tipo</label><input id="threadType" class="w-full mt-1 p-2 rounded bg-slate-800"></div></div>`;
    }
  }
  renderExtras();
  operationEl.addEventListener('change', renderExtras);

  function readForm() {
    return {
      machine: machineTypeEl.value,
      units: document.getElementById('units').value,
      workMaterial: workMaterialEl.value,
      operation: operationEl.value,
      toolType: toolTypeEl.value,
      toolMaterial: document.getElementById('toolMaterial').value,
      coating: document.getElementById('coating').value,
      diameter: Number(document.getElementById('diameter').value) || null,
      flutes: Number(document.getElementById('flutes').value) || 1,
      ap: Number(document.getElementById('ap').value) || null,
      ae: document.getElementById('ae').value || null,
      stickout: Number(document.getElementById('stickout').value) || null,
      cooling: document.getElementById('cooling').value,
      priority: document.getElementById('priority').value,
      cutLength: Number(document.getElementById('cutLength').value) || null,
      notes: document.getElementById('notes').value || ''
    };
  }

  function parseAe(aeVal, diameter) {
    if (!aeVal) return null;
    if (typeof aeVal === 'string' && aeVal.trim().endsWith('%')) {
      const p = Number(aeVal.replace('%',''))/100;
      return diameter ? Math.round(diameter * p * 100)/100 : null;
    }
    return Number(aeVal);
  }

  function computeRecommendations(data) {
    const mat = data.workMaterial;
    const diam = data.diameter;
    let toolFamily = 'carbide';
    const tm = data.toolMaterial ? data.toolMaterial.toLowerCase() : '';
    if (tm.includes('hss')) toolFamily='hss';
    if (tm.includes('pcd')) toolFamily='pcd';
    if (tm.includes('cbn')) toolFamily='cbn';
    if (tm.includes('cermet')) toolFamily='cermet';

    const vcRow = VC_TABLE[mat] || VC_TABLE['st'];
    let vc = (vcRow && vcRow[toolFamily]) ? vcRow[toolFamily] : (vcRow && vcRow['carbide'] ? vcRow['carbide'] : 100);
    if (data.priority === 'toollife') vc *= 0.7;
    if (data.priority === 'cycle') vc *= 1.05;

    let D_mm = diam;
    if (data.units === 'imperial' && diam) D_mm = inToMm(diam);

    const rpm = computeRPM(vc, D_mm);
    const fz = recommendedFz(data.operation, mat, D_mm || 6);
    const feed = computeFeed(rpm, fz, data.flutes || 1);
    const ae_mm = parseAe(data.ae, D_mm) || (D_mm ? Math.round(0.5*D_mm*100)/100 : null);
    const mrr = computeMRR(data.ap || 1, ae_mm || (D_mm?0.5*D_mm:1), feed);

    // potencia estimada (kW)
    const kc = KC_TABLE[mat] || KC_TABLE.other;
    const power_kW = (mrr && kc) ? Math.round( (kc * mrr) / 60000000 * 1000 ) / 1000 : null; // redondeo 3 dec

    // tiempo de ciclo (min) - usa cutLength si está, default 100 mm
    const cutLen = data.cutLength || 100;
    const cycle_min = (feed && cutLen) ? Math.round( (cutLen / feed) * 1000 ) / 1000 : null;

    const rec = recommendTooling(mat);
    const vibRatio = data.stickout && D_mm ? (data.stickout / (D_mm || 1)) : 0;
    const vibRisk = vibRatio>3 ? 'ALTA' : vibRatio>1.5 ? 'MEDIA' : 'BAJA';

    return {
      vc: Math.round(vc),
      rpm, fz, feed, mrr,
      ae_mm,
      power_kW,
      cycle_min,
      recommendation: { toolMaterial: rec.toolMaterial, coating: rec.coating, geometry: rec.geometry },
      heuristics: { vibrationRisk: vibRisk, vibRatio: Math.round(vibRatio*100)/100, notes: 'Heurísticos básicos. Validar en máquina.' }
    };
  }

  // export PDF (igual)
  async function exportPdf() {
    const node = document.querySelector('#toolForm');
    const clone = node.cloneNode(true);
    clone.style.background = '#0b1220';
    clone.classList.add('pdf-shot');
    clone.style.position = 'fixed'; clone.style.left = '-9999px';
    document.body.appendChild(clone);
    const canvas = await html2canvas(clone, {scale:2, backgroundColor: '#0b1220'});
    const imgData = canvas.toDataURL('image/png');
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({orientation:'portrait', unit:'pt', format:'a4'});
    const pageWidth = pdf.internal.pageSize.getWidth();
    const imgProps = pdf.getImageProperties(imgData);
    const pdfH = (imgProps.height * pageWidth) / imgProps.width;
    pdf.addImage(imgData, 'PNG', 0, 0, pageWidth, pdfH);
    pdf.save('tool-selection.pdf');
    clone.remove();
  }

  function exportJSON(dataObj) {
    const blob = new Blob([JSON.stringify(dataObj,null,2)], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'tool-selection.json';
    document.body.appendChild(a); a.click(); a.remove();
  }

  // vendors UI
  function renderVendors() {
    const out = document.getElementById('vendorsList');
    out.innerHTML = vendors.map(v => `
      <div class="flex items-center justify-between p-2 rounded bg-slate-800">
        <div><div class="font-medium">${v.name} <span class="text-xs muted">(${v.commissionPct}% comisión)</span></div><div class="text-xs muted">${v.contact}</div></div>
        <div class="flex gap-2">
          <button class="px-2 py-1 bg-indigo-600 rounded text-sm" data-oid="${v.id}">Solicitar</button>
          <button class="px-2 py-1 bg-rose-500 rounded text-sm" data-rid="${v.id}">Eliminar</button>
        </div>
      </div>
    `).join('');
    out.querySelectorAll('button[data-oid]').forEach(b => b.addEventListener('click', (e) => orderFromVendor(Number(e.currentTarget.getAttribute('data-oid')))));
    out.querySelectorAll('button[data-rid]').forEach(b => b.addEventListener('click', (e) => removeVendor(Number(e.currentTarget.getAttribute('data-rid')))));
  }
  renderVendors();

  function orderFromVendor(id) {
    const v = vendors.find(x=>x.id===id);
    if (!v) return alert('Proveedor no encontrado');
    const data = readForm();
    const rec = computeRecommendations(data);
    const subject = encodeURIComponent(`Solicitud de herramienta - ${v.name}`);
    const body = encodeURIComponent(`Hola ${v.name},\n\nSolicito cotización:\n\n${JSON.stringify({form:data,recommendation:rec},null,2)}\n\nComisión solicitada: ${v.commissionPct}%`);
    window.location.href = `mailto:${v.contact}?subject=${subject}&body=${body}`;
  }
  function removeVendor(id) { vendors = vendors.filter(x=>x.id!==id); renderVendors(); }
  document.getElementById('addVendorBtn').addEventListener('click', ()=> {
    const name = prompt('Nombre proveedor'); if(!name) return;
    const contact = prompt('Email de contacto') || '';
    const commission = Number(prompt('Comisión % (ej. 8)')) || 0;
    const id = Math.max(0,...vendors.map(v=>v.id))+1;
    vendors.push({id,name,contact,commissionPct:commission});
    renderVendors();
  });

  // botones
  document.getElementById('calcBtn').addEventListener('click', ()=> {
    const form = readForm();
    const rec = computeRecommendations(form);
    const out = {...form, recommendation: rec.recommendation, metrics:{vc:rec.vc, rpm:rec.rpm, fz:rec.fz, feed:rec.feed, mrr:rec.mrr, power_kW:rec.power_kW, cycle_min:rec.cycle_min}, heuristics: rec.heuristics, ae_mm: rec.ae_mm};
    document.getElementById('jsonOut').textContent = JSON.stringify(out,null,2);
    if (window.integrateWithRpmCalculator) { try { window.integrateWithRpmCalculator(out); } catch (e) { console.warn('integrateWithRpmCalculator falló', e); } }
  });

  document.getElementById('exportBtn').addEventListener('click', ()=> {
    const txt = document.getElementById('jsonOut').textContent;
    if (!txt) return alert('Calcula primero.');
    const payload = JSON.parse(txt);
    exportJSON(payload);
  });

  document.getElementById('pdfBtn').addEventListener('click', async ()=> {
    document.getElementById('calcBtn').click();
    await exportPdf();
  });

  document.getElementById('orderCsvBtn').addEventListener('click', ()=> {
    const txt = document.getElementById('jsonOut').textContent;
    if (!txt) { alert('Calcula primero.'); return; }
    const payload = JSON.parse(txt);
    const rows = [['item','diameter','toolType','toolMaterial','coating','qty','notes'], [payload.recommendation.geometry||'Recomendado', payload.diameter||'', payload.toolType, payload.toolMaterial, payload.coating, 1, payload.notes||'']];
    const csv = rows.map(r=>r.map(cell => `"${String(cell||'').replace(/"/g,'""')}"`).join(',')).join('\r\n');
    const blob = new Blob([csv], {type:'text/csv'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'pedido_herramienta.csv'; document.body.appendChild(a); a.click(); a.remove();
  });

  // submit ejemplo
  document.getElementById('toolForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = document.getElementById('jsonOut').textContent ? JSON.parse(document.getElementById('jsonOut').textContent) : {...readForm(), timestamp: Date.now()};
    try {
      await fetch('/api/tool-selection', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) });
      alert('Enviado al endpoint.');
    } catch (err) { console.error(err); alert('Error enviando. Revisa la consola.'); }
  });

  // integrador stub
  window.integrateWithRpmCalculator = window.integrateWithRpmCalculator || function(data){
    console.log('integrateWithRpmCalculator stub — recibe:', data);
  };

  // readForm helper (definido abajo para orden)
  function readForm() {
    return {
      machine: machineTypeEl.value,
      units: document.getElementById('units').value,
      workMaterial: workMaterialEl.value,
      operation: operationEl.value,
      toolType: toolTypeEl.value,
      toolMaterial: document.getElementById('toolMaterial').value,
      coating: document.getElementById('coating').value,
      diameter: Number(document.getElementById('diameter').value) || null,
      flutes: Number(document.getElementById('flutes').value) || 1,
      ap: Number(document.getElementById('ap').value) || null,
      ae: document.getElementById('ae').value || null,
      stickout: Number(document.getElementById('stickout').value) || null,
      cooling: document.getElementById('cooling').value,
      priority: document.getElementById('priority').value,
      cutLength: Number(document.getElementById('cutLength').value) || null,
      notes: document.getElementById('notes').value || ''
    };
  }

})();
