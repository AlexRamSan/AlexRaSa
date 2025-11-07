// app_cam.js — inicializa UI, parsea escalones y renderiza
import { renderSVG } from './svgTool_cam.js';
import { materialColor } from './svgTool.js';

export function initApp(){
  // ---------- DOM ----------
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
    steps: $('#steps'),
    material: $('#material'),
    btnJson: $('#btnJson'),
    btnSvg:  $('#btnSvg'),
    btnDxf:  $('#btnDxf'),
    btnShare:$('#btnShare'),
  };

  // ---------- Materiales ----------
  const MATERIALS = [
    { id:'carbide', label:'Carbide' },
    { id:'hss',     label:'HSS' },
    { id:'pcd',     label:'PCD' },
    { id:'cbn',     label:'CBN' },
  ];
  el.material.innerHTML = MATERIALS.map(m=>`<option value="${m.id}">${m.label}</option>`).join('');
  el.material.value = 'carbide';

  // ---------- Estado ----------
  const s = {
    unit: 'mm',
    D: 12, AD: 12,
    TL: 100, OHL: 60, SL: 10, CL: 30,
    Z: 4, helix: 35, tip: 'flat', chamferAngle: 45,
    material: 'carbide',
    steps: [],         // [{d,l}, ...] dentro de SL
    // extras opcionales para “filos”
    // flutePhase: 0, fluteMarginPx: 6, fluteWidthPx: 3, occludeBack: true,
  };

  // ---------- Utilidades ----------
  const toNum = v => Number.isFinite(+v) ? +v : 0;

  function parseSteps(str, unit){
    // "10x12,8x10" => [{d:10,l:12},{d:8,l:10}]
    if(!str) return [];
    return str
      .split(',')
      .map(t => t.trim())
      .filter(Boolean)
      .map(pair => {
        const [d,l] = pair.toLowerCase().split('x').map(x=>toNum(x));
        return { d: Math.max(0,d), l: Math.max(0,l) };
      });
  }

  function clampGeometry(){
    // Regla de oro: TL = CL + SL + OHL (TL no editable)
    const sum = s.CL + s.SL + s.OHL;
    s.TL = sum;
    el.TL.value = s.TL.toFixed(2);

    // Limitar negativos
    s.D  = Math.max(0.01, s.D);
    s.AD = Math.max(0.01, s.AD);
    s.CL = Math.max(0, s.CL);
    s.SL = Math.max(0, s.SL);
    s.OHL= Math.max(0, s.OHL);

    // Recortar escalones si exceden SL
    if(Array.isArray(s.steps) && s.steps.length){
      let rem = s.SL;
      s.steps = s.steps.map(st => {
        const l = Math.min(st.l, Math.max(0, rem));
        rem = Math.max(0, rem - l);
        return { d: Math.max(0.01, st.d || s.D), l };
      });
    }
  }

  function readUI(){
    // Unidad
    for(const r of el.unit){ if(r.checked) s.unit = r.value; }

    // Geometría base
    s.D  = toNum(el.D.value);
    s.AD = toNum(el.AD.value);
    s.OHL= toNum(el.OHL.value);
    s.SL = toNum(el.SL.value);
    s.CL = toNum(el.CL.value);

    // Z, hélice, punta
    s.Z   = Math.max(1, Math.round(toNum(el.Z.value)));
    s.helix = toNum(el.helix.value);
    s.tip   = el.tip.value;
    s.chamferAngle = toNum(el.cham.value);

    // Material
    s.material = el.material.value;

    // Escalones
    s.steps = parseSteps(el.steps.value, s.unit);

    // Reglas de consistencia
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
    el.material.value = s.material;
    el.TL.value = s.TL.toFixed(2);
    // steps: dejar el texto del usuario tal cual
  }

  function render(){
    // Pasar a svgTool_cam.js
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
      steps: s.steps,
      // Si quieres probar acomodadores:
      // flutePhase: 0,
      // fluteMarginPx: 6,
      // fluteWidthPx: 3,
      // occludeBack: true,
    });
  }

  function update(){
    readUI();
    render();
  }

  // ---------- Listeners ----------
  el.unit.forEach(r => r.addEventListener('change', update));
  [el.D, el.AD, el.OHL, el.SL, el.CL, el.Z, el.helix, el.tip, el.cham, el.steps, el.material]
    .forEach(inp => inp.addEventListener('input', update));

  // Botones
  el.btnJson.addEventListener('click', ()=>{
    readUI();
    const payload = JSON.stringify(s, null, 2);
    navigator.clipboard?.writeText(payload).catch(()=>{});
    alert('Copiado JSON al portapapeles.');
  });

  el.btnSvg.addEventListener('click', ()=>{
    const blob = new Blob([view.outerHTML], {type:'image/svg+xml'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'herramienta.svg';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  el.btnShare.addEventListener('click', ()=>{
    readUI();
    const q = new URLSearchParams({
      unit: s.unit,
      D: s.D, AD: s.AD,
      OHL: s.OHL, SL: s.SL, CL: s.CL,
      Z: s.Z, helix: s.helix,
      tip: s.tip, chamfer: s.chamferAngle,
      mat: s.material,
      steps: (el.steps.value || '').trim(), // conservar texto
    }).toString();
    const url = `${location.origin}/proyectos/herramientas/?${q}`;
    navigator.clipboard?.writeText(url).catch(()=>{});
    alert('URL copiada.');
  });

  el.btnDxf.addEventListener('click', ()=>{
    alert('DXF pendiente. Definir exportador de perfil 2D.');
  });

  // ---------- Carga desde URL ----------
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
      el.steps.value = p.get('steps');
      s.steps = parseSteps(el.steps.value, s.unit);
    }
    clampGeometry();
    writeUI();
  })();

  // ---------- Primer render ----------
  render();
}
