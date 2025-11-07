// Vista alzada, sin callouts.
// Z hélices exacto. Hélices: largo = CL, arrancan D/2 a la izq y terminan D/2 a la der.
// Rectángulos del modelo:
//  - CL:  width = D,  height = CL
//  - SL:  width = D,  height = SL
//  - OHL: width = AD, height = OHL
// Cotas: derecha (CL, SL, OHL), izquierda (TL), arriba (D), abajo (AD).

import { materialColor } from './svgTool.js';

export function renderSVG(svg, s){
  const W = 1100, H = 520, margin = 28;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = '';

  // utils
  const mk = n => document.createElementNS('http://www.w3.org/2000/svg', n);
  const line = (x1,y1,x2,y2,st='#6ee7ff',w=2)=>{
    const e=mk('line'); e.setAttribute('x1',x1); e.setAttribute('y1',y1);
    e.setAttribute('x2',x2); e.setAttribute('y2',y2);
    e.setAttribute('stroke',st); e.setAttribute('stroke-width',w);
    e.setAttribute('stroke-linecap','round'); e.setAttribute('pointer-events','none');
    svg.appendChild(e); return e;
  };
  const rect = (x,y,w,h,fill,st='#2a4f7a')=>{
    const e=mk('rect'); e.setAttribute('x',x); e.setAttribute('y',y);
    e.setAttribute('width',w); e.setAttribute('height',h);
    e.setAttribute('rx',8); e.setAttribute('fill',fill);
    if(st) e.setAttribute('stroke',st);
    e.setAttribute('pointer-events','none'); svg.appendChild(e); return e;
  };
  const text = (x,y,t,fill='#9fb3c8',fs=12)=>{
    const e=mk('text'); e.setAttribute('x',x); e.setAttribute('y',y);
    e.setAttribute('fill',fill); e.setAttribute('font-size',fs);
    e.setAttribute('pointer-events','none'); e.textContent=t; svg.appendChild(e); return e;
  };
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
      p.setAttribute('fill',st); p.setAttribute('pointer-events','none'); svg.appendChild(p);
    };
    tip(x1,y1,ang+Math.PI); tip(x2,y2,ang); return l;
  };
  const dimV = (x, y0, y1, label)=>{
    const yA = Math.min(y0,y1), yB = Math.max(y0,y1);
    arrow(x, yA, x, yB); line(x, yA, x-8, yA); line(x, yB, x-8, yB);
    text(x+6, yA + (yB-yA)/2, label);
  };
  const dimH = (y, x0, x1, label)=>{
    const xA = Math.min(x0,x1), xB = Math.max(x0,x1);
    arrow(xA, y, xB, y); line(xA, y, xA, y-8); line(xB, y, xB, y-8);
    text((xA+xB)/2 - 30, y-6, label);
  };
  const fmt = (v,u)=> u==='inch' ? (v/25.4).toFixed(3)+' in' : v.toFixed(2)+' mm';
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

  // fondo
  for(let gy=margin; gy<=H-margin; gy+=10){
    const g=mk('line'); g.setAttribute('x1','0'); g.setAttribute('x2',String(W));
    g.setAttribute('y1',String(gy)); g.setAttribute('y2',String(gy));
    g.setAttribute('stroke','#1f2a3a'); g.setAttribute('opacity','0.12'); svg.appendChild(g);
  }

  // derivadas
  const topExtra = s.tip==='ball' ? Math.max(16, s.D*0.15) : (s.tip==='chamfer' ? 8 : 0);
  const TL = s.TL ?? (s.CL + s.SL + s.OHL); // por si llega calculado
  const availableH = H - margin*2 - topExtra;
  const scale = availableH / TL;

  const WIDTH_BODY  = s.D  * scale;   // ancho
  const WIDTH_SHANK = s.AD * scale;

  // centrado horizontal del modelo
  const cx = (margin + (W - margin)) / 2;
  const leftBody  = cx - WIDTH_BODY/2;
  const leftShank = cx - WIDTH_SHANK/2;
  const top = margin + topExtra;

  const strokeAll = '#2a4f7a';
  const fillCL='#17314d', fillSL='#132a45', fillOHL='#0f2238';

  // === MODELO: rectángulos con altura = CL/SL/OHL ===
  let y = top;

  // CL
  rect(leftBody, y, WIDTH_BODY, s.CL * scale, fillCL, strokeAll);

  // punta
  if(s.tip==='flat'){ line(leftBody, y, leftBody+WIDTH_BODY, y, '#86e7ff', 3); }
  else if(s.tip==='ball'){
    const r=(s.D*scale)/2; const p=mk('path');
    p.setAttribute('d',`M ${leftBody} ${y+r} A ${r} ${r} 0 0 1 ${leftBody+WIDTH_BODY} ${y+r}`);
    p.setAttribute('stroke','#86e7ff'); p.setAttribute('fill','none'); p.setAttribute('pointer-events','none'); svg.appendChild(p);
  }else if(s.tip==='chamfer'){
    const off=Math.tan((90-s.chamferAngle)*Math.PI/180)*(s.D*scale/2);
    const hTip=Math.min(s.CL*scale, s.D*scale*0.25);
    const p=mk('path');
    p.setAttribute('d',`M ${leftBody} ${y} L ${leftBody+off} ${y+hTip} L ${leftBody+WIDTH_BODY-off} ${y+hTip} L ${leftBody+WIDTH_BODY} ${y}`);
    p.setAttribute('stroke','#86e7ff'); p.setAttribute('fill','none'); p.setAttribute('pointer-events','none'); svg.appendChild(p);
  }

  // ---------- HÉLICE / FILOS ----------
{
  const defs = mk('defs');
  const clip = mk('clipPath'); clip.setAttribute('id','clipCL');
  const clipRect = mk('rect');
  clipRect.setAttribute('x', leftBody);
  clipRect.setAttribute('y', y);
  clipRect.setAttribute('width', WIDTH_BODY);
  clipRect.setAttribute('height', s.CL * scale);
  clip.appendChild(clipRect); defs.appendChild(clip); svg.appendChild(defs);

  const g = mk('g'); g.setAttribute('clip-path','url(#clipCL)'); svg.appendChild(g);

  const bandH = s.CL * scale;                       // alto visible = CL
  const k     = -Math.tan(s.helix * Math.PI / 180); // inclinación contraria
  const Z     = Math.max(1, Math.round(s.Z));       // TODOS los filos
  const halfD = (s.D * scale) / 2;

  // rango completo: desde D/2 a la IZQ hasta D/2 a la DER del cuerpo
  const spanStart = leftBody - WIDTH_BODY;
  const spanEnd   = leftBody + WIDTH_BODY + WIDTH_BODY + WIDTH_BODY;
  const stepX     = (spanEnd - spanStart) / Z;      // separación uniforme

  const strokeW = Math.max(1, Math.min(6, (s.D * scale) * 0.08));

  for (let i = 0; i < Z; i++) {
    // punto de arranque uniforme en el borde superior (y)
    const x0 = spanStart + (i + 0.5) * stepX;
    // punto final en el borde inferior (y + CL) desplazado para terminar D/2 a la derecha
    const x1 = x0 + k * bandH;

    const l = mk('line');
    l.setAttribute('x1', x0); l.setAttribute('y1', y);
    l.setAttribute('x2', x1); l.setAttribute('y2', y + bandH);
    l.setAttribute('stroke', '#2aaae2');
    l.setAttribute('stroke-width', strokeW);
    l.setAttribute('stroke-linecap', 'round');
    l.setAttribute('pointer-events','none');
    g.appendChild(l);
  }
}


  y += s.CL*scale;

  // SL
  rect(leftBody, y, WIDTH_BODY, s.SL * scale, fillSL, strokeAll);
  y += s.SL*scale;

  // OHL (zanco)
  rect(leftShank, y, WIDTH_SHANK, s.OHL * scale, fillOHL, strokeAll);

  // === COTAS ===
  const rightGeom = Math.max(leftBody + WIDTH_BODY, leftShank + WIDTH_SHANK);
  const leftGeom  = Math.min(leftBody, leftShank);
  const xRight = Math.min(W-10, rightGeom + 28);
  const xLeft  = Math.max(10, leftGeom  - 28);

  // Derecha: CL, SL, OHL
  const topCL  = top;
  const botCL  = top + s.CL*scale;
  const topSL  = botCL;
  const botSL  = botCL + s.SL*scale;
  const topOHL = botSL;
  const botOHL = botSL + s.OHL*scale;

  const rightBody = leftBody + WIDTH_BODY;
  const rightShank = leftShank + WIDTH_SHANK;

  line(rightBody, topCL, xRight, topCL, '#6ee7ff', 1.5);
  line(rightBody, botCL, xRight, botCL, '#6ee7ff', 1.5);
  dimV(xRight, topCL, botCL, `CL ${fmt(s.CL, s.unit)}`);

  line(rightBody, topSL, xRight, topSL, '#6ee7ff', 1.5);
  line(rightBody, botSL, xRight, botSL, '#6ee7ff', 1.5);
  dimV(xRight, topSL, botSL, `SL ${fmt(s.SL, s.unit)}`);

  line(rightShank, topOHL, xRight, topOHL, '#6ee7ff', 1.5);
  line(rightShank, botOHL, xRight, botOHL, '#6ee7ff', 1.5);
  dimV(xRight, topOHL, botOHL, `OHL ${fmt(s.OHL, s.unit)}`);

  // Izquierda: TL
  line(xLeft, top, leftGeom, top, '#6ee7ff', 1.5);
  line(xLeft, top + TL*scale, leftGeom, top + TL*scale, '#6ee7ff', 1.5);
  dimV(xLeft, top, top + TL*scale, `TL ${fmt(TL, s.unit)}`);

  // Horizontales: D arriba, AD abajo
  const yD  = top - 12;
  dimH(yD,  cx - (s.D*scale)/2,  cx + (s.D*scale)/2,  `D ${fmt(s.D, s.unit)}`);
  const yAD = top + TL*scale + 18;
  dimH(yAD, cx - (s.AD*scale)/2, cx + (s.AD*scale)/2, `AD ${fmt(s.AD, s.unit)}`);
}
