// TL derivado = CL + SL + OHL. Sin H.
import { MATERIALS } from './presets.js';
import { renderSVG } from './svgTool_cam.js';
import { exportDXF } from './dxf.js';
import { preview3D } from './webglPreview.js';

export function initApp(){
  const $ = id => document.getElementById(id);
  const svg = $('view');
  const canvas = $('preview3d');

  // Materiales
  const materialSel = $('material');
  for (const m of MATERIALS){
    const o = document.createElement('option');
    o.value = m.id; o.textContent = m.name;
    materialSel.appendChild(o);
  }
  materialSel.value = 'carbide';

  // Unidades
  let unit = 'mm';
  document.querySelectorAll('input[name="unit"]').forEach(r => {
    r.addEventListener('change', () => { unit = r.value; drawAll(); });
  });

  // Bind (sin H, TL es readonly)
  const ids = ['D','AD','OHL','SL','CL','Z','helix','tip','chamferAngle','steps','material'];
  ids.forEach(id=>{
    const el = $(id);
    el.addEventListener('input', onChange);
    el.addEventListener('change', onChange);
  });

  function onChange(){ enforceRule(); drawAll(); }

  function enforceRule(){
    // TL = CL + SL + OHL
    const f = v => Math.max(0, +v || 0);
    const CL = f($('CL').value);
    const SL = f($('SL').value);
    const OHL = f($('OHL').value);
    const TL = CL + SL + OHL;
    $('TL').value = TL.toFixed(3);

    // AD por defecto igual a D si está vacío
    if(!$('AD').value) $('AD').value = $('D').value;
  }

  function read(){
    const k = (unit==='inch') ? 25.4 : 1;
    const CL  = (+$('CL').value||0)  * k;
    const SL  = (+$('SL').value||0)  * k;
    const OHL = (+$('OHL').value||0) * k;
    const TL  = CL + SL + OHL;

    return {
      unit,
      D:  (+$('D').value||0)  * k,
      AD: (+$('AD').value||0) * k,
      TL, OHL, SL, CL,
      Z: Math.max(1, +$('Z').value|0),
      helix: +$('helix').value || 0,
      tip: $('tip').value,
      chamferAngle: +$('chamferAngle').value || 45,
      steps: parseSteps($('steps').value, k),
      material: $('material').value
    };
  }

  function parseSteps(str, k){
    if(!str) return [];
    return str.split(',')
      .map(s=>s.trim()).filter(Boolean)
      .map(s=>{
        const [d,l] = s.toLowerCase().split('x').map(Number);
        return { d:(d||0)*k, l:(l||0)*k };
      })
      .filter(s=>s.d>0 && s.l>0);
  }

  // Acciones
  $('btnJson').addEventListener('click',()=>{
    const s = read();
    const blob = new Blob([JSON.stringify(s,null,2)],{type:'application/json'});
    download(blob, `herramienta_${Date.now()}.json`);
  });

  $('btnSvg').addEventListener('click',()=>{
    const svgStr = svg.outerHTML.replaceAll('><','>\n<');
    const blob = new Blob(
      [`<?xml version="1.0" encoding="UTF-8"?>\n`, svgStr],
      {type:'image/svg+xml'}
    );
    download(blob, `herramienta_${Date.now()}.svg`);
  });

  $('btnDxf').addEventListener('click',()=>{
    const blob = exportDXF(camToLegacy(read()));
    download(blob, `herramienta_${Date.now()}.dxf`);
  });

  $('btnShare').addEventListener('click',()=>{
    const url = new URL(location.href);
    navigator.clipboard?.writeText(url.toString());
    alert('URL copiada');
  });

  function camToLegacy(s){
    // Map al DXF
    return { D:s.D, L:s.TL, lc:s.CL, Dz:s.AD, lz:s.OHL, steps:s.steps };
  }

  function drawAll(){
    const s = read();
    renderSVG(svg, s);
    preview3D(canvas, camToLegacy(s));
  }

  // init
  enforceRule();
  drawAll();

  function download(blob, filename){
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href), 1000);
  }
}
