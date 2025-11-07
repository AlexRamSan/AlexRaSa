// /proyectos/herramientas/assets/js/svgTool_cam.js
// Dibujo estilo “tabla de herramienta”: D y AD horizontales; TL, OHL, CL, SL, H verticales.
// Incluye hélice recortada al ancho del diámetro y grosor de trazo proporcional a D.

import { materialColor } from './svgTool.js'; // paleta ya existente

export function renderSVG(svg, s){
  const W = 1100, H = 520, margin = 28;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = '';

  // ---- utilidades SVG
  const mk = n => document.createElementNS('http://www.w3.org/2000/svg', n);
  const line = (x1,y1,x2,y2,st='#6ee7ff',w=2)=>{
    const e=mk('line');
    e.setAttribute('x1',x1); e.setAttribute('y1',y1);
    e.setAttribute('x2',x2); e.setAttribute('y2',y2);
    e.setAttribute('stroke',st); e.setAttribute('stroke-width',w);
    svg.appendChild(e); return e;
  };
  const rect = (x,y,w,h,fill,st='#93c5fd')=>{
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
  function arrow(x1,y1,x2,y2,st='#6ee7ff',w=2){
    const l = line(x1,y1,x2,y2,st,w);
    const ang = Math.atan2(y2-y1, x2-x1);
    const sz = 6;
    const mkTri = (x,y,a)=>{
      const p = mk('path');
      const xA = x - sz*Math.cos(a) + (sz*0.6)*Math.cos(a+Math.PI/2);
      const yA = y - sz*Math.sin(a) + (sz*0.6)*Math.sin(a+Math.PI/2);
      const xB = x - sz*Math.cos(a) - (sz*0.6)*Math.cos(a+Math.PI/2);
      const yB = y - sz*Math.sin(a) - (sz*0.6)*Math.sin(a+Math.PI/2);
      p.setAttribute('d',`M ${x} ${y} L ${xA} ${yA} L ${xB} ${yB} Z`);
      p.setAttribute('fill',st);
      svg.appendChild(p);
    };
    mkTri(x1,y1,ang+Math.PI); mkTri(x2,y2,ang);
    return l;
  }
  function dimV(x, y0, y1, label){
    const yA = Math.min(y0,y1), yB = Math.max(y0,y1);
    arrow(x, yA, x, yB);
    line(x, yA, x-8, yA);
    line(x, yB, x-8, yB);
    text(x+6, yA + (yB-yA)/2, label);
  }
  function dimH(y, x0, x1, label){
    const xA = Math.min(x0,x1), xB = Math.max(x0,x1);
    arrow(xA, y, xB, y);
    line(xA, y, xA, y-8);
    line(xB, y, xB, y-8);
    // centra el texto sobre la cota
    const approx = (xA + xB)/2 - 30;
    text(approx, y-6, label);
  }
  const fmtUnit = (v, unit)=> unit==='inch' ? (v/25.4).toFixed(3)+' in' : v.toFixed(2)+' mm';

  // ---- fondo de grilla
  for(let y=margin; y<=H-margin; y+=10){
    const g=mk('line');
    g.setAttribute('x1','0'); g.setAttribute('x2',String(W));
    g.setAttribute('y1',String(y)); g.setAttribute('y2',String(y));
    g.setAttribute('stroke','#1f2a3a'); g.setAttribute('opacity','0.15');
    svg.appendChild(g);
  }

  // ---- layout y escala
  const cx = 150;                 // borde izquierdo del perfil
  const top = margin;
  const scale = (H - margin*2) / s.TL;

  // ---- colores
  const fillBody = '#0f2238';
  const fillShank = '#0e2034';
  const strokeBody = '#2a4f7a';
  const accent = materialColor(s.material)+'14';

  // ---- segmentos (arriba->abajo): CL, SL, H, OHL
  let y = top;

  // Zona de corte CL (cuerpo)
  rect(cx, y, 700, s.D*scale, fillBody, strokeBody);

  // punta (opcional)
  if(s.tip==='flat'){ line(cx, y, cx+700, y, '#86e7ff', 3); }
  else if(s.tip==='ball'){
    const r=(s.D*scale)/2; const p=mk('path');
    p.setAttribute('d',`M ${cx} ${y+r} A ${r} ${r} 0 0 1 ${cx+700} ${y+r}`);
    p.setAttribute('stroke','#86e7ff'); p.setAttribute('fill','none'); svg.appendChild(p);
  }else if(s.tip==='chamfer'){
    const off=Math.tan((90-s.chamferAngle)*Math.PI/180)*(s.D*scale/2);
    const p=mk('path');
    p.setAttribute('d',`M ${cx} ${y} L ${cx+off} ${y + Math.min(s.CL*scale, s.D*scale*0.25)} L ${cx+700-off} ${y + Math.min(s.CL*scale, s.D*scale*0.25)} L ${cx+700} ${y}`);
    p.setAttribute('stroke','#86e7ff'); p.setAttribute('fill','none'); svg.appendChild(p);
  }

  // --- hélice dentro de CL, recortada por clipPath y con grosor proporcional a D
  {
    const defs = mk('defs');
    const clip = mk('clipPath'); clip.setAttribute('id','clipCL');
    const clipRect = mk('rect');
    clipRect.setAttribute('x', cx);
    clipRect.setAttribute('y', y);
    clipRect.setAttribute('width', 700);
    clipRect.setAttribute('height', s.D * scale);
    clip.appendChild(clipRect); defs.appendChild(clip); svg.appendChild(defs);

    const sw = Math.max(1, Math.min(6, (s.D * scale) * 0.08)); // 1–6 px
    const g = mk('g'); g.setAttribute('clip-path','url(#clipCL)'); svg.appendChild(g);

    const pitch = Math.max(10, 200 - s.helix*2);
    for(let x=cx-400; x<cx+1100; x+=pitch){
      const k = Math.tan(s.helix*Math.PI/180);
      const x2 = x + k * (s.D * scale);
      const l = mk('line');
      l.setAttribute('x1', x); l.setAttribute('y1', y);
      l.setAttribute('x2', x2); l.setAttribute('y2', y + s.D*scale);
      l.setAttribute('stroke', '#1e6aa0');
      l.setAttribute('stroke-width', sw);
      l.setAttribute('stroke-linecap', 'round');
      g.appendChild(l);
    }

    // marcas de filos también recortadas
    const gF = mk('g'); gF.setAttribute('clip-path','url(#clipCL)'); svg.appendChild(gF);
    const swFlute = Math.max(1, Math.min(4, (s.D * scale) * 0.06));
    for(let i=0;i<s.Z;i++){
      const fx = cx + 20 + i*(660/Math.max(1, s.Z-1));
      const l = mk('line');
      l.setAttribute('x1', fx); l.setAttribute('y1', y);
      l.setAttribute('x2', fx); l.setAttribute('y2', y + s.D*scale);
      l.setAttribute('stroke', '#2aaae2'); l.setAttribute('stroke-width', swFlute);
      l.setAttribute('stroke-linecap', 'round');
      gF.appendChild(l);
    }
  }

  // avanza CL
  y += s.CL*scale;

  // SL
  rect(cx, y, 700, s.D*scale, fillBody, strokeBody); y += s.SL*scale;

  // H (cuello)
  rect(cx, y, 700, s.D*scale, fillBody, strokeBody); y += s.H*scale;

  // OHL (zanco)
  rect(cx, y, 700, s.AD*scale, fillShank, '#1f2a3a');

  // Overlay por material
  const ov=rect(cx, top, 700, s.TL*scale, accent, 'none'); ov.setAttribute('stroke','none');

  // ==== COTAS ====
  const xRight = cx + 720;

  // Verticales: TL, OHL, SL, CL, H
  dimV(xRight, top, top + s.TL*scale, `TL ${fmtUnit(s.TL, s.unit)}`);

  const yOHL0 = top + (s.CL + s.SL + s.H)*scale;
  const yOHL1 = yOHL0 + s.OHL*scale;
  dimV(xRight - 40, yOHL0, yOHL1, `OHL ${fmtUnit(s.OHL, s.unit)}`);

  const ySL0 = top + s.CL*scale;
  dimV(xRight - 80, ySL0, ySL0 + s.SL*scale, `SL ${fmtUnit(s.SL, s.unit)}`);

  dimV(xRight - 120, top, top + s.CL*scale, `CL ${fmtUnit(s.CL, s.unit)}`);

  const yH0 = top + (s.CL)*scale;
  dimV(xRight - 160, yH0, yH0 + s.H*scale, `H ${fmtUnit(s.H, s.unit)}`);

  // Horizontales: D y AD
  const yD  = top + s.CL*scale + 24;            // bajo la banda de CL
  dimH(yD, cx, cx + 700, `D ${fmtUnit(s.D, s.unit)}`);

  const yAD = yOHL0 + (s.OHL*scale)/2;          // centrado en zanco
  dimH(yAD, cx, cx + 700, `AD ${fmtUnit(s.AD, s.unit)}`);
}
