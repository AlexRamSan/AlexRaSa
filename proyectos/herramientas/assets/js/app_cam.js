import { MATERIALS } from './presets.js';
import { renderSVG } from './svgTool_cam.js';
import { exportDXF } from './dxf.js';
import { preview3D } from './webglPreview.js';

export function initApp(){
  const $ = id => document.getElementById(id);
  const svg = $('view'); const canvas = $('preview3d');

  // Materiales
  const materialSel = $('material');
  for(const m of MATERIALS){ const o=document.createElement('option'); o.value=m.id; o.textContent=m.name; materialSel.appendChild(o); }
  materialSel.value='carbide';

  // Unidades
  let unit = 'mm';
  document.querySelectorAll('input[name="unit"]').forEach(r => {
    r.addEventListener('change', () => {
      unit = r.value; drawAll();
    });
  });

  // Bind
  const ids = ['D','AD','TL','OHL','SL','CL','H','Z','helix','tip','chamferAngle','steps','material'];
  ids.forEach(id=>{
    const el = $(id);
    el.addEventListener('input', onChange);
    el.addEventListener('change', onChange);
  });

  function onChange(){
    enforceRule(); // TL = OHL+SL+CL+H
    drawAll();
  }

  function read(){
    // factor de unidad
    const f = (unit==='inch') ? 25.4 : 1;
    return {
      unit,
      D: +$('D').value * f,
      AD: +$('AD').value * f,
      TL: +$('TL').value * f,
      OHL: +$('OHL').value * f,
      SL: +$('SL').value * f,
      CL: +$('CL').value * f,
      H: +$('H').value * f,
      Z: Math.max(1, +$('Z').value|0),
      helix: +$('helix').value,
      tip: $('tip').value,
      chamferAngle: +$('chamferAngle').value,
      steps: parseSteps($('steps').value, f),
      material: $('material').value
    };
  }

  function enforceRule(){
    const TL = +$('TL').value, sum = (+$('OHL').value) + (+$('SL').value) + (+$('CL').value) + (+$('H').value);
    if(Number.isFinite(TL) && Number.isFinite(sum) && Math.abs(TL - sum) > 0.001){
      // Ajusta H para cerrar igualdad
      const newH = Math.max(0, TL - ((+$('OHL').value)+(+$('SL').value)+(+$('CL').value)));
      $('H').value = newH.toFixed(3);
    }
    // AD por defecto igual a D si está vacío
    if(!$('AD').value) $('AD').value = $('D').value;
  }

  function parseSteps(str, f){
    if(!str) return [];
    return str.split(',').map(s=>s.trim()).filter(Boolean).map(s=>{
      const [d,l]=s.toLowerCase().split('x').map(Number);
      return { d:(d||0)*f, l:(l||0)*f };
    }).filter(s=>s.d>0 && s.l>0);
  }

  // Acciones
  $('btnJson').addEventListener('click',()=>{
    const s = read();
    const blob = new Blob([JSON.stringify(s,null,2)],{type:'application/json'});
    download(blob, `herramienta_${Date.now()}.json`);
  });
  $('btnSvg').addEventListener('click',()=>{
    const svgStr = svg.outerHTML.replaceAll('><','>\n<');
    const blob=new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n`+svgStr],{type:'image/svg+xml'});
    download(blob, `herramienta_${Date.now()}.svg`);
  });
  $('btnDxf').addEventListener('click',()=>{ const blob=exportDXF(camToLegacy(read())); download(blob, `herramienta_${Date.now()}.dxf`); });
  $('btnShare').addEventListener('click',()=>{ const url=new URL(location.href); navigator.clipboard?.writeText(url.toString()); alert('URL copiada'); });

  function camToLegacy(s){
    // Mapea al motor DXF existente (usa D,L,lc,Dz,lz,steps)
    const stepsLen = s.steps.reduce((a,b)=>a+b.l,0);
    return {
      D: s.D,
      L: s.TL,
      lc: s.CL,
      Dz: s.AD,
      lz: s.OHL,           // OHL = largo de zanco visible
      steps: s.steps       // se dibujan después de CL
    };
  }

  function drawAll(){
    const s = read();
    renderSVG(svg, s);
    preview3D(canvas, camToLegacy(s));
  }

  // init
  enforceRule();
  drawAll();

  function download(blob, filename){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 1000); }
}
