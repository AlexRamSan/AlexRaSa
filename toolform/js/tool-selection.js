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
          <div><label class="text-xs muted">Material pieza *</label><select id="workMa*
