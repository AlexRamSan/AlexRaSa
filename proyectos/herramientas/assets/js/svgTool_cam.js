// /proyectos/herramientas/assets/js/svgTool_cam.js
// Dibujo tipo “tabla de herramienta”.
// - Ancho del cuerpo depende de D; ancho del zanco depende de AD.
// - Hélice = líneas diagonales únicas: ángulo = helix, cantidad = Z.
// - D y AD con cotas horizontales; TL, OHL, SL, CL, H con cotas verticales.
// - Top extra cuando la punta es bola/chaflán para que no se recorte.

import { materialColor } from './svgTool.js';

export function renderSVG(svg, s){
  const W = 1100, H = 520, margin = 28;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = '';

  // ---------- utils ----------
  const mk = n => document.createElementNS('http://www.w3.org/2000/svg', n);
  const line = (x1,y1,x2,y2,st='#6ee7ff',w=2)=>{
    const e=mk('line'); e.setAttribute('x1',x1); e.setAttribute('y1',y1);
    e.setAttribute('x2',x2); e.setAttribute('y2',y2);
    e.setAttribute('stroke',st); e.setAttribute('stroke-width',w);
    e.setAttribute('stroke-linecap','round'); svg.appendChild(e); return e;
  };
  const rect = (x,y,w,h,fill,st='#93c5fd')=>{
    const e=mk('rect'); e.setAttribute('x',x); e.setAttribute('y',y);
    e.setAttribute('width',w); e.setAttribute('height',h);
    e.setAttribute('rx',8); e.setAttribute('fill',fill);
    if(st) e.setAttribute('stroke',st); svg.appendChild(e); return e;
  };
  const text = (x,y,t,fill='#9fb3c8',fs=12)=>{
    const e=mk('text'); e.setAttribute('x',x); e.setAttribute('y',y);
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

  // ---------- grid ----------
  for(let y=margin; y<=H-margin; y+=10){
    const g=mk('line'); g.setAttribute('x1','0'); g.setAttribute('x2',String(W));
    g.setAttribute('y1',String(y)); g.setAttribute('y2',String(y));
    g.setAttribute('stroke','#1f2a3a'); g.setAttribute('opacity','0.15'); svg.appendChild(g);
  }

  // ---------- layout y escala ----------
  // aire extra arriba si punta es bola/chaflán
  const topExtra = s.tip==='ball' ? Math.max(16, s.D*0.15) : (s.tip==='chamfer' ? 8 : 0);
  const availableH = H - margin*2 - topExtra;
  const scale = availableH / s.TL;

  // ancho dinámico por zona
  const WIDTH_BASE = 700, DIAM_REF = 12;
  const widthFromDia = diaMm => clamp(WIDTH_BASE * (diaMm / DIAM_REF), 320, 900);
  const WIDTH_BODY  = widthFromDia(s.D);   // CL, SL, H
  const WIDTH_SHANK = widthFromDia(s.AD);  // OHL

  const cx = 150;                       // borde izquierdo
  const top = margin + topExtra;
  const centerX_body  = cx + WIDTH_BODY/2;
  const centerX_shank = cx + WIDTH_SHANK/2;
  const xRight = cx + Math.max(WIDTH_BODY, WIDTH_SHANK) + 20;

  // ---------- colores ----------
  const fillBody   = '#0f2238';
  const fillShank  = '#0e2034';
  const strokeBody = '#2a4f7a';
  const accent     = materialColor(s.material)+'14';

  // ---------- CL (cuerpo) ----------
  let y = top;
  rect(cx, y, WIDTH_BODY, s.D*scale, fillBody, strokeBody);

  // punta
  if(s.tip==='flat'){ line(cx, y, cx+WIDTH_BODY, y, '#86e7ff', 3); }
  else if(s.tip==='ball'){
    const r=(s.D*scale)/2; const p=mk('path');
    p.setAttribute('d',`M ${cx} ${y+r} A ${r} ${r} 0 0 1 ${cx+WIDTH_BODY} ${y+r}`);
    p.setAttribute('stroke','#86e7ff'); p.setAttribute('fill','none'); svg.appendChild(p);
  }else if(s.tip==='chamfer'){
    const off=Math.tan((90-s.chamferAngle)*Math.PI/180)*(s.D*scale/2);
    const hTip=Math.min(s.CL*scale, s.D*scale*0.25);
    const p=mk('path');
    p.setAttribute('d',`M ${cx} ${y} L ${cx+off} ${y+hTip} L ${cx+WIDTH_BODY-off} ${y+hTip} L ${cx+WIDTH_BODY} ${y}`);
    p.setAttribute('stroke','#86e7ff'); p.setAttribute('fill','none'); svg.appendChild(p);
  }

  // HÉLICE = líneas diagonales únicas (ángulo=helix, cantidad=Z), recortadas al alto D
  {
    const defs = mk('defs');
    const clip = mk('clipPath'); clip.setAttribute('id','clipCL');
    const clipRect = mk('rect');
    clipRect.setAttribute('x', cx);
    clipRect.setAttribute('y', y);
    clipRect.setAttribute('width', WIDTH_BODY);
    clipRect.setAttribute('height', s.D * scale);
    clip.appendChild(clipRect); defs.appendChild(clip); svg.appendChild(defs);

    const g = mk('g'); g.setAttribute('clip-path','url(#clipCL)'); svg.appendChild(g);

    const sw = clamp((s.D * scale) * 0.08, 1, 6);
    const bandH = s.D * scale;
    const k = Math.tan(s.helix * Math.PI / 180); // pendiente

    // posiciones iniciales distribuidas a lo ancho del cuerpo
    for(let i=0; i<Math.max(1,s.Z); i++){
      const x0 = cx + ( (i + 0.5) * (WIDTH_BODY / s.Z) );
      const x1 = x0 + k * bandH;

      const l = mk('line');
      l.setAttribute('x1', x0); l.setAttribute('y1', y);
      l.setAttribute('x2', x1); l.setAttribute('y2', y + bandH);
      l.setAttribute('stroke', '#2aaae2'); l.setAttribute('stroke-width', sw);
      l.setAttribute('stroke-linecap', 'round');
      g.appendChild(l);
    }
  }

  // avanza CL
  y += s.CL*scale;

  // ---------- SL ----------
  rect(cx, y, WIDTH_BODY, s.D*scale, fillBody, strokeBody);
  y += s.SL*scale;

  // ---------- H (cuello) ----------
  rect(cx, y, WIDTH_BODY, s.D*scale, fillBody, strokeBody);
  y += s.H*scale;

  // ---------- OHL (zanco) ----------
  rect(cx, y, WIDTH_SHANK, s.AD*scale, fillShank, '#1f2a3a');

  // overlay material
  const ov=rect(cx, top, Math.max(WIDTH_BODY, WIDTH_SHANK), s.TL*scale, accent, 'none');
  ov.setAttribute('stroke','none');

  // ---------- COTAS ----------
  // Verticales
  dimV(xRight,         top, top + s.TL*scale,           `TL ${fmtUnit(s.TL, s.unit)}`);
  const yOHL0 = top + (s.CL + s.SL + s.H)*scale;
  dimV(xRight - 40,    yOHL0, yOHL0 + s.OHL*scale,      `OHL ${fmtUnit(s.OHL, s.unit)}`);
  const ySL0  = top + s.CL*scale;
  dimV(xRight - 80,    ySL0,  ySL0 + s.SL*scale,        `SL ${fmtUnit(s.SL, s.unit)}`);
  dimV(xRight - 120,   top,   top + s.CL*scale,         `CL ${fmtUnit(s.CL, s.unit)}`);
  const yH0   = top + (s.CL)*scale;
  dimV(xRight - 160,   yH0,   yH0 + s.H*scale,          `H ${fmtUnit(s.H, s.unit)}`);

  // Horizontales (centradas en cada ancho)
  const halfD  = (s.D  * scale) / 2;
  const halfAD = (s.AD * scale) / 2;
  const yD  = top + s.CL*scale + 24;
  dimH(yD,  centerX_body  - halfD,  centerX_body  + halfD,  `D ${fmtUnit(s.D, s.unit)}`);
  const yAD = yOHL0 + (s.OHL*scale)/2;
  dimH(yAD, centerX_shank - halfAD, centerX_shank + halfAD, `AD ${fmtUnit(s.AD, s.unit)}`);
}
