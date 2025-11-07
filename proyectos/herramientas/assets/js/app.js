import { PRESETS, MATERIALS } from './presets.js';
import { renderSVG } from './svgTool.js';
import { exportDXF } from './dxf.js';
import { preview3D } from './webglPreview.js';

export function initApp(){
  const $ = id => document.getElementById(id);
  const svg = $('view'); const canvas = $('preview3d');

  // Materiales
  const materialSel = $('material');
  for(const m of MATERIALS){ const o=document.createElement('option'); o.value=m.id; o.textContent=m.name; materialSel.appendChild(o); }
  materialSel.value='carbide';

  // Presets
  const familySel = $('family'); const modelSel = $('model');
  for(const fam of Object.keys(PRESETS)){ const o=document.createElement('option'); o.value=fam; o.textContent=fam; familySel.appendChild(o); }
  familySel.addEventListener('change', ()=> fillModels()); fillModels();
  function fillModels(){ modelSel.innerHTML=''; const list = PRESETS[familySel.value]||[]; list.forEach((m,i)=>{ const o=document.createElement('option'); o.value=String(i); o.textContent=m.name; modelSel.appendChild(o); }); }

  // Tabs
  document.querySelectorAll('.tab').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(b=>b.classList.remove('active'));
    document.querySelectorAll('.pane').forEach(p=>p.classList.remove('active'));
    btn.classList.add('active'); document.getElementById(`pane-${btn.dataset.tab}`).classList.add('active');
  }));

  const state = bindState();
  hookActions(state);
  applyUrlParams(state);
  drawAll();

  function bindState(){
    const ids=["diameter","length","cutLength","shankDia","shankLen","flutes","helix","tip","chamferAngle","steps","material"];
    ids.forEach(id=>{
      const el = $(id); const handler = ()=>{ stChanged(); };
      el.addEventListener('input', handler); el.addEventListener('change', handler);
    });
    function read(){
      return {
        D:+$('diameter').value,
        L:+$('length').value,
        lc:+$('cutLength').value,
        Dz:+$('shankDia').value,
        lz:+$('shankLen').value,
        Z:Math.max(1,+$('flutes').value|0),
        helix:+$('helix').value,
        tip:$('tip').value,
        chamferAngle:+$('chamferAngle').value,
        steps:parseSteps($('steps').value),
        material:$('material').value
      };
    }
    function write(p){
      if(p.D!=null) $('diameter').value=p.D;
      if(p.L!=null) $('length').value=p.L;
      if(p.lc!=null) $('cutLength').value=p.lc;
      if(p.Dz!=null) $('shankDia').value=p.Dz;
      if(p.lz!=null) $('shankLen').value=p.lz;
      if(p.Z!=null) $('flutes').value=p.Z;
      if(p.helix!=null) $('helix').value=p.helix;
      if(p.tip!=null) $('tip').value=p.tip;
      if(p.chamferAngle!=null) $('chamferAngle').value=p.chamferAngle;
      if(p.steps!=null) $('steps').value=stepsToStr(p.steps);
      if(p.material!=null) $('material').value=p.material;
    }
    function stChanged(){ drawAll(); updateUrl(read()); }
    return { read, write };
  }

  function hookActions(st){
    $('applyPreset').addEventListener('click',()=>{
      const fam = $('family').value; const idx = +$('model').value|0; const item = PRESETS[fam]?.[idx]; if(!item) return;
      st.write(mapPreset(item.params)); drawAll(); updateUrl(st.read());
    });
    $('btnJson').addEventListener('click',()=>{
      const blob = new Blob([JSON.stringify(st.read(),null,2)],{type:'application/json'}); download(blob, `herramienta_${Date.now()}.json`);
    });
    $('btnSvg').addEventListener('click',()=>{
      const svgStr = svg.outerHTML.replaceAll('><','>\n<'); const blob=new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n`+svgStr],{type:'image/svg+xml'}); download(blob, `herramienta_${Date.now()}.svg`);
    });
    $('btnDxf').addEventListener('click',()=>{ const blob=exportDXF(st.read()); download(blob, `herramienta_${Date.now()}.dxf`); });
    $('btnShare').addEventListener('click',()=>{ const url=new URL(location.href); updateUrl(st.read(), url); navigator.clipboard?.writeText(url.toString()); alert('URL copiada'); });
  }

  function drawAll(){ const s = state.read(); renderSVG(svg, s); preview3D(canvas, s); }

  function parseSteps(str){ if(!str) return []; return str.split(',').map(s=>s.trim()).filter(Boolean).map(s=>{ const [d,l]=s.toLowerCase().split('x').map(Number); return {d:Math.max(0,d||0), l:Math.max(0,l||0)} }).filter(s=>s.d>0 && s.l>0); }
  function stepsToStr(arr){ return (arr||[]).map(s=>`${s.d}x${s.l}`).join(','); }
  function mapPreset(p){ return {...p, steps: typeof p.steps==='string'? parseSteps(p.steps): p.steps}; }

  // URL params
  function applyUrlParams(st){ const q=new URLSearchParams(location.search); if(!q.size) return; const p={};
    for(const k of ['D','L','lc','Dz','lz','Z','helix','tip','chamferAngle','material']) if(q.has(k)) p[k]= isNaN(+q.get(k))? q.get(k): +q.get(k);
    if(q.get('steps')) p.steps = parseSteps(q.get('steps'));
    st.write(p);
  }
  function updateUrl(s, url=new URL(location.href)){ url.search=''; const q=url.searchParams;
    q.set('D',s.D); q.set('L',s.L); q.set('lc',s.lc); q.set('Dz',s.Dz); q.set('lz',s.lz); q.set('Z',s.Z); q.set('helix',s.helix); q.set('tip',s.tip); q.set('chamferAngle',s.chamferAngle); q.set('material',s.material); if(s.steps?.length) q.set('steps', (s.steps||[]).map(x=>`${x.d}x${x.l}`).join(','));
    history.replaceState(null,'',url.toString());
  }

  function download(blob, filename){ const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href), 1000); }
}
 
