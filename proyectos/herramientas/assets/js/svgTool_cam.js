// Vista alzada.
// Implementa:
// - Z hélices = exactamente lo pedido, largo = CL.
// - Inclinación contraria. Inician D/2 a la izquierda y TERMINAN D/2 a la derecha.
// - Zonas: CL, SL, OHL (rectángulos en tonos distintos). Anchos: CL usa D; SL/OHL usan AD.
// - Cotas: derecha (CL, SL, OHL) alineadas; izquierda (TL); arriba (D); abajo (AD).
// - Callouts azules a la izquierda: alturas = CL/SL/OHL; anchos: CL = D, SL/OHL = AD; centrados y apilados.

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
  const rect = (x,y,w,h,fill,st='#2a4f7a')=>{
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

  // ---------- grid suave ----------
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

  // Anchos exactos (coinciden con D/AD)
  const WIDTH_BODY  = s.D  * scale;      // CL y SL
  const WIDTH_SHANK = s.AD * scale;      // OHL

  // Centrados
  const cxCanvas = (margin + (W - margin)) / 2;
  const leftBody  = cxCanvas - WIDTH_BODY  / 2;
  const leftShank = cxCanvas - WIDTH_SHANK / 2;
  const top = margin + topExtra;

  const centerX_body  = cxCanvas;
  const centerX_shank = cxCanvas;

  // límites para cotas fuera
  const rightGeom = Math.max(leftBody + WIDTH_BODY, leftShank + WIDTH_SHANK);
  const leftGeom  = Math.min(leftBody, leftShank);
  const xRight    = Math.min(W - 10, rightGeom + 28); // columna derecha de cotas
  const xLeft     = Math.max(10, leftGeom  - 28);     // cota TL izquierda

  // ---------- colores ----------
  const fillCL  = '#17314d';
  const fillSL  = '#132a45';
  const fillOHL = '#0f2238';
  const strokeAll = '#2a4f7a';

  // ---------- CL ----------
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

  // ---------- HÉLICE / FILOS ----------
  {
    const defs = mk('defs');
    const clip = mk('clipPath'); clip.setAttribute('id','clipCL');
    const clipRect = mk('rect');
    clipRect.setAttribute('x', leftBody);
    clipRect.setAttribute('y', y);
    clipRect.setAttribute('width', WIDTH_BODY);
    clipRect.setAttribute('height', s.CL * scale); // solo sobre CL
    clip.appendChild(clipRect); defs.appendChild(clip); svg.appendChild(defs);

    const g = mk('g'); g.setAttribute('clip-path','url(#clipCL)'); svg.appendChild(g);

    const sw      = clamp((s.D * scale) * 0.08, 1, 6);
    const bandH   = s.CL * scale;
    const k       = -Math.tan(s.helix * Math.PI / 180); // inclinación contraria
    const Zvis    = Math.max(1, Math.round(s.Z));       // TODAS
    const halfDpx = (s.D * scale) / 2;

    for (let i = 0; i < Zvis; i++) {
      // arranque D/2 a la izquierda del cuerpo
      const x0 = (leftBody - halfDpx) + ((i + 0.5) * (WIDTH_BODY / Zvis));
      // término D/2 a la derecha del cuerpo
      const x1 = x0 + k * bandH + halfDpx;

      const l = mk('line');
      l.setAttribute('x1', x0); l.setAttribute('y1', y);
      l.setAttribute('x2', x1); l.setAttribute('y2', y + bandH);
      l.setAttribute('stroke', '#2aaae2'); l.setAttribute('stroke-width', sw);
      l.setAttribute('stroke-linecap', 'round');
      g.appendChild(l);
    }
  }

  // avanzar CL
  y += s.CL*scale;

  // ---------- SL ----------
  rect(leftBody, y, WIDTH_BODY, s.D*scale, fillSL, strokeAll);
  y += s.SL*scale;

  // ---------- OHL ----------
  rect(leftShank, y, WIDTH_SHANK, s.AD*scale, fillOHL, strokeAll);

  // ---------- CALLOUTS IZQUIERDA (alturas ligadas a CL/SL/OHL; anchos por D/AD) ----------
  {
    const leftMost   = Math.min(leftBody, leftShank);
    const colLeft    = xLeft + 6;
    const colRight   = leftMost - 6;
    const colCenter  = (colLeft + colRight) / 2;
    const colAvail   = Math.max(24, colRight - colLeft);

    const wCL_req  = s.D  * scale;                  // CL sigue D
    const wADS_req = s.AD * scale;                  // SL/OHL siguen AD
    const wCL  = Math.min(wCL_req,  colAvail);
    const wADS = Math.min(wADS_req, colAvail);

    const yCL  = top;
    const ySL0 = top + s.CL * scale;
    const yOHL0= top + (s.CL + s.SL) * scale;

    const callStroke = '#2a4f7a';
    rect(colCenter - wCL/2,  yCL,   wCL,  s.CL  * scale, '#18324e', callStroke);
    rect(colCenter - wADS/2, ySL0,  wADS, s.SL  * scale, '#142b46', callStroke);
    rect(colCenter - wADS/2, yOHL0, wADS, s.OHL * scale, '#10223a', callStroke);
  }

  // ---------- COTAS ----------
  // Derecha: CL, SL, OHL con guías desde el modelo
  const rightBody = leftBody + WIDTH_BODY;
  const rightShank = leftShank + WIDTH_SHANK;

  // CL
  line(rightBody, top, xRight, top, '#6ee7ff', 1.5);
  line(rightBody, top + s.CL*scale, xRight, top + s.CL*scale, '#6ee7ff', 1.5);
  dimV(xRight, top, top + s.CL*scale, `CL ${fmtUnit(s.CL, s.unit)}`);

  // SL
  const ySL0 = top + s.CL*scale;
  line(rightBody, ySL0, xRight, ySL0, '#6ee7ff', 1.5);
  line(rightBody, ySL0 + s.SL*scale, xRight, ySL0 + s.SL*scale, '#6ee7ff', 1.5);
  dimV(xRight, ySL0, ySL0 + s.SL*scale, `SL ${fmtUnit(s.SL, s.unit)}`);

  // OHL
  const yOHL0 = ySL0 + s.SL*scale;
  line(rightShank, yOHL0, xRight, yOHL0, '#6ee7ff', 1.5);
  line(rightShank, yOHL0 + s.OHL*scale, xRight, yOHL0 + s.OHL*scale, '#6ee7ff', 1.5);
  dimV(xRight, yOHL0, yOHL0 + s.OHL*scale, `OHL ${fmtUnit(s.OHL, s.unit)}`);

  // Izquierda: TL
  const leftMost = Math.min(leftBody, leftShank);
  line(xLeft, top, leftMost, top, '#6ee7ff', 1.5);
  line(xLeft, top + s.TL*scale, leftMost, top + s.TL*scale, '#6ee7ff', 1.5);
  dimV(xLeft, top, top + s.TL*scale, `TL ${fmtUnit(s.TL, s.unit)}`);

  // Horizontales: D arriba y AD abajo
  const halfD  = (s.D  * scale) / 2;
  const halfAD = (s.AD * scale) / 2;
  const yD  = top - 12;                      // arriba del modelo
  dimH(yD,  centerX_body  - halfD,  centerX_body  + halfD,  `D ${fmtUnit(s.D, s.unit)}`);
  const yAD = top + s.TL*scale + 18;         // abajo del modelo
  dimH(yAD, centerX_shank - halfAD, centerX_shank + halfAD, `AD ${fmtUnit(s.AD, s.unit)}`);
}
