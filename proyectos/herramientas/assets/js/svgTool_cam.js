// Vista alzada (sin H).
// Cambios:
// - Z hélices = exactamente el valor pedido (no mitad).
// - Cada zona con tono distinto: CL, SL, OHL.
// - Cotas fijas:
//   • Derecha: CL, SL, OHL
//   • Izquierda: TL
//   • Horizontal arriba del modelo: D
//   • Horizontal abajo del modelo: AD
// - Hélices: largo = CL, arrancan medio D a la izquierda, inclinación contraria.

import { materialColor } from './svgTool.js';

export function renderSVG(svg, s){
  const W = 1100, H = 520, margin = 28;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = '';

  // ---------- utils ----------
  const mk = n => document.createElementNS('http://www.w3.org/2000/svg', n);
  const line = (x1,y1,x2,y2,st='#6ee7ff',w=2)=>{
    const e=mk('line');
    e.setAttribute('x1',x1); e.setAttribute('y1',y1);
    e.setAttribute('x2',x2); e.setAttribute('y2',y2);
    e.setAttribute('stroke',st); e.setAttribute('stroke-width',w);
    e.setAttribute('stroke-linecap','round');
    svg.appendChild(e); return e;
  };
  const rect = (x,y,w,h,fill,st='#2a3f58')=>{
    const e=mk('rect');
    e.setAttribute('x',x); e.setAttribute('y',y);
    e.setAttribute('width',w); e.setAttribute('height',h);
    e.setAttribute('rx',8); e.setAttribute('fill',fill);
    if(st) e.setAttribute('stroke',st);
    svg.appendChild(e); return e;
  };
  const text = (x,y,t,fill='#9fb3c8',fs=12)=>{
    const e=mk('text');
    e.setAttribute('x',x); e.setAttribute('y',y);
    e.setAttribute('fill',fill); e.setAttribute('font-size',fs);
    e.textContent=t; svg.appendChild(e); return e;
  };

  // flechas y cotas
  const arrow = (x1,y1,x2,y2,st='#6ee7ff',w=2)=>{
    const l = line(x1,y1,x2,y2,st,w);
    const ang = Math.atan2(y2-y1, x2-x1), sz = 6;
    const tip = (x,y,a)=>{
      const p = mk('path');
      const xA = x - sz*Math.cos(a) + (sz*0.6)*Math.cos(a+Math.PI/2);
      const yA = y - sz*Math.sin(a) + (sz*0.6)*Math.sin(a+Math.PI/2);
      const xB = x - sz*Math.cos(a) - (sz*0.6)*Math.cos(a+Math.PI/2);
      const yB = y - sz*Math.sin(a) - (sz*0.6)*Math.sin(a+Math.PI/2);
      p.setAttribute('d',`M ${x} ${y} L ${xA} ${yA} L ${xB} ${yB} Z`);
      p.setAttribute('fill',st); svg.appendChild(p);
    };
    tip(x1,y1,ang+Math.PI); tip(x2,y2,ang); return l;
  };
  const dimV = (x, y0, y1, label)=>{
    const yA = Math.min(y0,y1), yB = Math.max(y0,y1);
    arrow(x, yA, x, yB);
    line(x, yA, x-8, yA); line(x, yB, x-8, yB);
    text(x+6, yA + (yB-yA)/2, label);
  };
  const dimH = (y, x0, x1, label)=>{
    const xA = Math.min(x0,x1), xB = Math.max(x0,x1);
    arrow(xA, y, xB, y);
    line(xA, y, xA, y-8); line(xB, y, xB, y-8);
    text((xA+xB)/2 - 30, y-6, label);
  };
  const fmtUnit = (v, unit)=> unit==='inch' ? (v/25.4).toFixed(3)+' in' : v.toFixed(2)+' mm';
  const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));

  // ---------- grid (suave) ----------
  for(let gy=margin; gy<=H-margin; gy+=10){
    const g=mk('line');
    g.setAttribute('x1','0'); g.setAttribute('x2',String(W));
    g.setAttribute('y1',String(gy)); g.setAttribute('y2',String(gy));
    g.setAttribute('stroke','#1f2a3a'); g.setAttribute('opacity','0.12');
    svg.appendChild(g);
  }

  // ---------- layout / escala ----------
  const topExtra = s.tip==='ball' ? Math.max(16, s.D*0.15) : (s.tip==='chamfer' ? 8 : 0);
  const availableH = H - margin*2 - topExtra;
  const scale = availableH / s.TL;

  // Anchos EXACTOS por diámetro (coinciden con cotas)
  const WIDTH_BODY  = s.D  * scale;  // CL y SL
  const WIDTH_SHANK = s.AD * scale;  // OHL

  // Centrados en el lienzo
  const centerX_canvas = (margin + (W - margin)) / 2;
  const leftBody   = centerX_canvas - WIDTH_BODY  / 2;
  const leftShank  = centerX_canvas - WIDTH_SHANK / 2;
  const top = margin + topExtra;

  const centerX_body  = centerX_canvas;
  const centerX_shank = centerX_canvas;

  // límites para ubicar cotas externas
  const rightGeom = Math.max(leftBody + WIDTH_BODY, leftShank + WIDTH_SHANK);
  const leftGeom  = Math.min(leftBody, leftShank);
  const xRight    = Math.min(W - 10, rightGeom + 24);   // cotas derechas fuera
  const xLeft     = Math.max(10, leftGeom  - 24);       // TL a la izquierda fuera

  // ---------- colores por zona ----------
  const tone = materialColor(s.material);
  const fillCL  = '#17314d';   // zona de corte
  const fillSL  = '#132a45';   // hombro
  const fillOHL = '#0f2238';   // zanco
  const strokeAll = '#2a4f7a';

  // ---------- dibujo: CL ----------
  let y = top;
  rect(leftBody, y, WIDTH_BODY, s.D*scale, fillCL, strokeAll);

  // punta
  if(s.tip==='flat'){
    line(leftBody, y, leftBody+WIDTH_BODY, y, '#86e7ff', 3);
  }else if(s.tip==='ball'){
    const r=(s.D*scale)/2; const p=mk('path');
    p.setAttribute('d',`M ${leftBody} ${y+r} A ${r} ${r} 0 0 1 ${leftBody+WIDTH_BODY} ${y+r}`);
    p.setAttribute('stroke','#86e7ff'); p.setAttribute('fill','none'); svg.appendChild(p);
  }else if(s.tip==='chamfer'){
    const off=Math.tan((90-s.chamferAngle)*Math.PI/180)*(s.D*scale/2);
    const hTip=Math.min(s.CL*scale, s.D*scale*0.25);
    const p=mk('path');
    p.setAttribute('d',`M ${leftBody} ${y} L ${leftBody+off} ${y+hTip} L ${leftBody+WIDTH_BODY-off} ${y+hTip} L ${leftBody+WIDTH_BODY} ${y}`);
    p.setAttribute('stroke','#86e7ff'); p.setAttribute('fill','none'); svg.appendChild(p);
  }

  // --- HÉLICE / FILOS ---
  {
    const defs = mk('defs');
    const clip = mk('clipPath'); clip.setAttribute('id','clipCL');
    const clipRect = mk('rect');
    clipRect.setAttribute('x', leftBody);
    clipRect.setAttribute('y', y);
    clipRect.setAttribute('width', WIDTH_BODY);
    clipRect.setAttribute('height', s.CL * scale); // largo visible = CL
    clip.appendChild(clipRect); defs.appendChild(clip); svg.appendChild(defs);

    const g = mk('g'); g.setAttribute('clip-path','url(#clipCL)'); svg.appendChild(g);

    const sw    = clamp((s.D * scale) * 0.08, 1, 6);
    const bandH = s.CL * scale;
    const k     = -Math.tan(s.helix * Math.PI / 180);   // inclinación contraria
    const Zvis  = Math.max(1, Math.round(s.Z));         // mostrar todas
    const halfDpx = (s.D * scale) / 2;                  // arranque medio D a la izquierda

    for(let i=0; i<Zvis; i++){
      const x0 = (leftBody - halfDpx) + ((i + 0.5) * (WIDTH_BODY / Zvis));
      const x1 = x0 + k * bandH;

      const l = mk('line');
      l.setAttribute('x1', x0); l.setAttribute('y1', y);
      l.setAttribute('x2', x1); l.setAttribute('y2', y + bandH);
      l.setAttribute('stroke', '#2aaae2');
      l.setAttribute('stroke-width', sw);
      l.setAttribute('stroke-linecap', 'round');
      g.appendChild(l);
    }
  }

  // avanzar CL
  y += s.CL*scale;

  // ---------- SL ----------
  rect(leftBody, y, WIDTH_BODY, s.D*scale, fillSL, strokeAll);
  y += s.SL*scale;

  // ---------- OHL (zanco) ----------
  rect(leftShank, y, WIDTH_SHANK, s.AD*scale, fillOHL, strokeAll);

  // ---------- COTAS ----------
  // Derecha: CL, SL, OHL (no se enciman con el modelo)
  dimV(xRight, top, top + s.CL*scale,         `CL ${fmtUnit(s.CL, s.unit)}`);
  const ySL0 = top + s.CL*scale;
  dimV(xRight - 40, ySL0, ySL0 + s.SL*scale,  `SL ${fmtUnit(s.SL, s.unit)}`);
  const yOHL0 = ySL0 + s.SL*scale;
  dimV(xRight - 80, yOHL0, yOHL0 + s.OHL*scale, `OHL ${fmtUnit(s.OHL, s.unit)}`);

  // Izquierda: TL (vertical completa)
  dimV(xLeft, top, top + s.TL*scale,          `TL ${fmtUnit(s.TL, s.unit)}`);

  // Horizontales: D arriba del modelo, AD abajo del modelo
  const halfD  = (s.D  * scale) / 2;
  const halfAD = (s.AD * scale) / 2;
  const yD  = top - 10;                               // arriba
  dimH(yD,  centerX_body  - halfD,  centerX_body  + halfD,  `D ${fmtUnit(s.D, s.unit)}`);
  const yAD = top + s.TL*scale + 18;                  // abajo
  dimH(yAD, centerX_shank - halfAD, centerX_shank + halfAD, `AD ${fmtUnit(s.AD, s.unit)}`);
}
