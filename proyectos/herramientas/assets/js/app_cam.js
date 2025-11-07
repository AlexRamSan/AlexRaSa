// app_cam.js — inicializa UI, parsea escalones (en CL) con chaflán opcional y renderiza
import { renderSVG } from './svgTool_cam.js';

export function initApp(){
  const $ = s => document.querySelector(s);
  const view = $('#view');

  const el = {
    unit:  document.querySelectorAll('input[name="unit"]'),
    D:     $('#D'),
    AD:    $('#AD'),
    TL:    $('#TL'),
    OHL:   $('#OHL'),
    SL:    $('#SL'),
    CL:    $('#CL'),
    Z:     $('#Z'),
    helix: $('#helix'),
    tip:   $('#tip'),
    cham:  $('#chamferAngle'),
    steps: $('#steps'),         // formato: DxL[,DxLxAxC,...]
    material: $('#material'),
    btnJson: $('#btnJson'),
    btnSvg:  $('#btnSvg'),
    btnDxf:  $('#btnDxf'),
    btnShare:$('#btnShare'),
  };

  // Materiales mínimos para no romper selects
  const MATERIALS = [
    { id:'carbide', label:'Carbide' },
    { id:'hss',     label:'HSS' },
    { id:'pcd',     label:'PCD' },
    { id:'cbn',     label:'CBN' },
  ];
  if (el.material) {
    el.material.innerHTML = MATERIALS.map(m=>`<option value="${m.id}">${m.label}</option>`).join('');
    el.material.value = 'carbide';
  }

  const s = {
    unit: 'mm',
    D: 12, AD: 12,
    TL: 100, OHL: 60, SL: 10, CL: 30,
    Z: 4, helix: 35, tip: 'flat', chamferAngle: 45,
    material: 'carbide',
    steps: [], // [{d,l,a?,c?}] en CL; a=ángulo°, c=largo chaflán
  };

  const toNum = v => Number.isFinite(+v) ? +v : 0;

  // "20x15" -> {d:20,l:15},  "20x15x30x4" -> {d:20,l:15,a:30,c:4}
  function parseSteps(str){
    if(!str) return [];
    return str
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)
      .map(pair => {
        const parts = pair.toLowerCase().split('x').map(x=>toNum(x));
        const [d,l,a,c] = parts;
        const obj = { d: Math.max(0.01, d||0), l: Math.max(0, l||0) };
        if (parts.length >= 4) {
          obj.a = Math.max(0, a||0);
          obj.c = Math.max(0, c||0);
        }
        return obj;
      });
  }

  function clampGeometry(){
    // TL = CL + SL + OHL
    s.CL  = Math.max(0, s.CL);
    s.SL  = Math.max(0, s.SL);
    s.OHL = Math.max(0, s.OHL);
    s.D   = Math.max(0.01, s.D);
    s.AD  = Math.max(0.01, s.AD);

    // Recortar escalones contra CL
    if(Array.isArray(s.steps) && s.steps.length){
      let rem = s.CL;
      s.steps = s.steps.map(st => {
        const segL = Math.min(st.l, Math.max(0, rem));
        rem = Math.max(0, rem - segL);
        const out = {
          d: Math.max(0.01, st.d || s.D),
          l: segL
        };
        if (st.a != null && st.c != null) {
          out.a = Math.max(0, st.a);
          // chaflán no puede exceder el tramo
          out.c = Math.max(0, Math.min(st.c, segL));
        }
        return out;
      });
    }

    s.TL = s.CL + s.SL + s.OHL;
    el.TL.value = s.TL.toFixed(2);
  }

  function readUI(){
    for(const r of el.unit){ if(r.checked) s.unit = r.value; }
    s.D  = toNum(el.D.value);
    s.AD = toNum(el.AD.value);
    s.OHL= toNum(el.OHL.value);
    s.SL = toNum(el.SL.value);
    s.CL = toNum(el.CL.value);
    s.Z   = Math.max(1, Math.round(toNum(el.Z.value)));
    s.helix = toNum(el.helix.value);
    s.tip   = el.tip.value;
    s.chamferAngle = toNum(el.cham.value);
    if (el.material) s.material = el.material.value;

    s.steps = parseSteps(el.steps.value); // en CL
    clampGeometry();
  }

  function writeUI(){
    el.D.value  = s.D;
    el.AD.value = s.AD;
    el.OHL.value= s.OHL;
    el.SL.value = s.SL;
    el.CL.value = s.CL;
    el.Z.value  = s.Z;
    el.helix.value = s.helix;
    el.tip.value   = s.tip;
    el.cham.value  = s.chamferAngle;
    if (el.material) el.material.value = s.material;
    el.TL.value = s.TL.toFixed(2);
  }

  function render(){
    renderSVG(view, {
      unit: s.unit,
      D: s.D,
      AD: s.AD,
      TL: s.TL,
      OHL: s.OHL,
      SL: s.SL,
      CL: s.CL,
      Z: s.Z,
      helix: s.helix,
      tip: s.tip,
      chamferAngle: s.chamferAngle,
      material: s.material,
      steps: s.steps, // [{d,l,a?,c?}] en CL
    });
  }

  function update(){ readUI(); render(); }

  el.unit.forEach(r => r.addEventListener('change', update));
  [el.D, el.AD, el.OHL, el.SL, el.CL, el.Z, el.helix, el.tip, el.cham, el.steps, el.material]
    .forEach(inp => inp && inp.addEventListener('input', update));

  el.btnJson?.addEventListener('click', ()=>{
    readUI();
    const payload = JSON.stringify(s, null, 2);
    navigator.clipboard?.writeText(payload).catch(()=>{});
    alert('Copiado JSON al portapapeles.');
  });

  el.btnSvg?.addEventListener('click', ()=>{
    const blob = new Blob([view.outerHTML], {type:'image/svg+xml'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'herramienta.svg';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  el.btnShare?.addEventListener('click', ()=>{
    readUI();
    const q = new URLSearchParams({
      unit: s.unit,
      D: s.D, AD: s.AD,
      OHL: s.OHL, SL: s.SL, CL: s.CL,
      Z: s.Z, helix: s.helix,
      tip: s.tip, chamfer: s.chamferAngle,
      mat: s.material,
      steps: (el.steps.value || '').trim(),
    }).toString();
    const url = `${location.origin}/proyectos/herramientas/?${q}`;
    navigator.clipboard?.writeText(url).catch(()=>{});
    alert('URL copiada.');
  });

  (function loadFromQuery(){
    const p = new URLSearchParams(location.search);
    if(p.has('unit')) s.unit = p.get('unit');
    if(p.has('D')) s.D = toNum(p.get('D'));
    if(p.has('AD')) s.AD = toNum(p.get('AD'));
    if(p.has('OHL')) s.OHL = toNum(p.get('OHL'));
    if(p.has('SL')) s.SL = toNum(p.get('SL'));
    if(p.has('CL')) s.CL = toNum(p.get('CL'));
    if(p.has('Z')) s.Z = Math.max(1, Math.round(toNum(p.get('Z'))));
    if(p.has('helix')) s.helix = toNum(p.get('helix'));
    if(p.has('tip')) s.tip = p.get('tip');
    if(p.has('chamfer')) s.chamferAngle = toNum(p.get('chamfer'));
    if(p.has('mat')) s.material = p.get('mat');
    if(p.has('steps')){
      el.steps.value = p.get('steps'); // mantiene el texto original
      s.steps = parseSteps(el.steps.value);
    }
    clampGeometry();
    writeUI();
  })();

  render();
}
