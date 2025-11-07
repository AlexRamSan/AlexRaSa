import { materialColor } from './svgTool.js'; // reutiliza paleta

export function renderSVG(svg, s){
  const W=1100,H=520, margin=28; svg.setAttribute('viewBox',`0 0 ${W} ${H}`); svg.innerHTML='';
  const mk = n => document.createElementNS('http://www.w3.org/2000/svg', n);
  const line = (x1,y1,x2,y2,st='#6ee7ff',w=2)=>{ const e=mk('line'); e.setAttribute('x1',x1); e.setAttribute('y1',y1); e.setAttribute('x2',x2); e.setAttribute('y2',y2); e.setAttribute('stroke',st); e.setAttribute('stroke-width',w); svg.appendChild(e); return e; };
  const rect = (x,y,w,h,fill,st='#93c5fd')=>{ const e=mk('rect'); e.setAttribute('x',x); e.setAttribute('y',y); e.setAttribute('width',w); e.setAttribute('height',h); e.setAttribute('rx',8); e.setAttribute('fill',fill); e.setAttribute('stroke',st); svg.appendChild(e); return e; };
  const text = (x,y,t,fill='#9fb3c8',fs=12)=>{ const e=mk('text'); e.setAttribute('x',x); e.setAttribute('y',y); e.setAttribute('fill',fill); e.setAttribute('font-size',fs); e.textContent=t; svg.appendChild(e); return e; };

  // Escalado vertical por TL
  const scale = (H - margin*2)/s.TL;
  const cx = 150, top = margin;

  // Fondo de grilla
  for(let y=top; y<=H-top; y+=10){ const g=mk('line'); g.setAttribute('x1','0'); g.setAttribute('x2',String(W)); g.setAttribute('y1',String(y)); g.setAttribute('y2',String(y)); g.setAttribute('stroke','#1f2a3a'); g.setAttribute('opacity','0.15'); svg.appendChild(g); }

  // Colores
  const fillBody = '#0f2238', fillShank='#0e2034', stroke='#2a4f7a', accent = materialColor(s.material)+'14';

  // Segmentos verticales (de arriba hacia abajo): CL, SL, H, OHL
  const seg = {
    CL: {h:s.CL*scale, d:s.D},
    SL: {h:s.SL*scale, d:s.D},
    H:  {h:s.H*scale,  d:s.D},
    OHL:{h:s.OHL*scale,d:s.AD}
  };

  let y=top;
  // Punta y zona de corte (CL)
  rect(cx, y, 700, s.D*scale, fillBody, stroke);
  // punta
  if(s.tip==='flat'){ line(cx, y, cx+700, y, '#86e7ff', 3); }
  else if(s.tip==='ball'){ const r=(s.D*scale)/2; const p=mk('path'); p.setAttribute('d',`M ${cx} ${y+r} A ${r} ${r} 0 0 1 ${cx+700} ${y+r}`); p.setAttribute('stroke','#86e7ff'); p.setAttribute('fill','none'); svg.appendChild(p); }
  else if(s.tip==='chamfer'){ const off=Math.tan((90-s.chamferAngle)*Math.PI/180)*(s.D*scale/2); const p=mk('path'); p.setAttribute('d',`M ${cx} ${y} L ${cx+off} ${y+seg.CL.h*0.25} L ${cx+700-off} ${y+seg.CL.h*0.25} L ${cx+700} ${y}`); p.setAttribute('fill','none'); p.setAttribute('stroke','#86e7ff'); svg.appendChild(p); }

  // Hélice sugerida en CL
  const pitch = Math.max(10, 200 - s.helix*2);
  for(let x=cx-400; x<cx+1100; x+=pitch){
    const k=Math.tan(s.helix*Math.PI/180), x2=x+k*(s.D*scale);
    line(Math.max(cx,x), y, Math.min(cx+700,x2), y + seg.CL.h, '#20476b', 1);
  }
  // marcas de filos
  for(let i=0;i<s.Z;i++){ const fx = cx + 20 + i*(660/Math.max(1,s.Z-1)); line(fx, y, fx, y+seg.CL.h, '#2aaae2', 1); }

  // Avanza CL
  y += seg.CL.h;

  // SL
  rect(cx, y, 700, s.D*scale, fillBody, stroke); y += seg.SL.h;

  // H (cuello)
  rect(cx, y, 700, s.D*scale, fillBody, stroke); y += seg.H.h;

  // OHL (zanco)
  rect(cx, y, 700, s.AD*scale, fillShank, '#1f2a3a');

  // Overlay por material
  const ov=rect(cx, top, 700, s.TL*scale, accent, 'none'); ov.setAttribute('stroke','none');

  // Cotas verticales a la derecha
  const xDim = cx+720;
  // TL
  line(xDim, top, xDim, top + s.TL*scale, '#6ee7ff', 2);
  line(xDim, top, xDim-8, top, '#6ee7ff', 2);
  line(xDim, top + s.TL*scale, xDim-8, top + s.TL*scale, '#6ee7ff', 2);
  text(xDim+6, top + (s.TL*scale)/2, `TL ${fmtUnit(s.TL, s.unit)}`);

  // OHL (zanco)
  const yOHL = top + (s.CL + s.SL + s.H)*scale;
  line(xDim-40, yOHL, xDim-40, yOHL + s.OHL*scale, '#6ee7ff', 2);
  line(xDim-40, yOHL, xDim-48, yOHL, '#6ee7ff', 2);
  line(xDim-40, yOHL + s.OHL*scale, xDim-48, yOHL + s.OHL*scale, '#6ee7ff', 2);
  text(xDim-34, yOHL + (s.OHL*scale)/2, `OHL ${fmtUnit(s.OHL, s.unit)}`);

  // SL
  const ySL = top + s.CL*scale;
  line(xDim-80, ySL, xDim-80, ySL + s.SL*scale, '#6ee7ff', 2);
  line(xDim-80, ySL, xDim-88, ySL, '#6ee7ff', 2);
  line(xDim-80, ySL + s.SL*scale, xDim-88, ySL + s.SL*scale, '#6ee7ff', 2);
  text(xDim-74, ySL + (s.SL*scale)/2, `SL ${fmtUnit(s.SL, s.unit)}`);

  // CL
  line(xDim-120, top, xDim-120, top + s.CL*scale, '#6ee7ff', 2);
  line(xDim-120, top, xDim-128, top, '#6ee7ff', 2);
  line(xDim-120, top + s.CL*scale, xDim-128, top + s.CL*scale, '#6ee7ff', 2);
  text(xDim-114, top + (s.CL*scale)/2, `CL ${fmtUnit(s.CL, s.unit)}`);

  // H
  const yH = top + (s.CL + s.SL)*scale;
  line(xDim-160, yH, xDim-160, yH + s.H*scale, '#6ee7ff', 2);
  line(xDim-160, yH, xDim-168, yH, '#6ee7ff', 2);
  line(xDim-160, yH + s.H*scale, xDim-168, yH + s.H*scale, '#6ee7ff', 2);
  text(xDim-154, yH + (s.H*scale)/2, `H ${fmtUnit(s.H, s.unit)}`);

  // Cotas horizontales D y AD a la izquierda
  const midCL = top + (s.CL*scale)/2;
  const midOHL = top + (s.CL + s.SL + s.H)*scale + (s.OHL*scale)/2;
  // D
  line(cx-8, midCL - (s.D*scale/2), cx-8, midCL + (s.D*scale/2), '#6ee7ff', 2);
  line(cx-8, midCL - (s.D*scale/2), cx-16, midCL - (s.D*scale/2), '#6ee7ff', 2);
  line(cx-8, midCL + (s.D*scale/2), cx-16, midCL + (s.D*scale/2), '#6ee7ff', 2);
  text(cx-92, midCL+4, `D ${fmtUnit(s.D, s.unit)}`);
  // AD
  line(cx-8, midOHL - (s.AD*scale/2), cx-8, midOHL + (s.AD*scale/2), '#6ee7ff', 2);
  line(cx-8, midOHL - (s.AD*scale/2), cx-16, midOHL - (s.AD*scale/2), '#6ee7ff', 2);
  line(cx-8, midOHL + (s.AD*scale/2), cx-16, midOHL + (s.AD*scale/2), '#6ee7ff', 2);
  text(cx-110, midOHL+4, `AD ${fmtUnit(s.AD, s.unit)}`);
}

function fmtUnit(v, unit){ return unit==='inch' ? (v/25.4).toFixed(3)+' in' : v.toFixed(2)+' mm'; }
