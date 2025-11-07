// Vista alzada, sin callouts. Escalones en CL.
// CL: escalonado por steps [{d,l}], sobrante con último d.
// SL: bloque único con ancho D. OHL: bloque con ancho AD.
// Hélices: Z exacto, largo = CL, inician D/2 izq y terminan D/2 der (inclinación contraria).
// Cotas: derecha (CL, SL, OHL), izquierda (TL con texto a la izquierda), D arriba, AD abajo.

export function renderSVG(svg, s){
  const W = 1100, H = 520, margin = 28;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.innerHTML = '';

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
  const text = (x,y,t,fill='#9fb3c8',fs=12,anchor='start')=>{
    const e=mk('text');
    e.setAttribute('x',x); e.setAttribute('y',y);
    e.setAttribute('fill',fill); e.setAttribute('font-size',fs);
    e.setAttribute('text-anchor',anchor);
    e.setAttribute('dominant-baseline','middle');
    e.setAttribute('pointer-events','none');
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
      p.setAttribute('fill',st); p.setAttribute('pointer-events','none');
      svg.appendChild(p);
    };
    tip(x1,y1,ang+Math.PI); tip(x2,y2,ang); return l;
  };
  const dimVRight = (x, y0, y1, label)=>{
    const yA = Math.min(y0,y1), yB = Math.max(y0,y1);
    arrow(x, yA, x, yB); line(x, yA, x-8, yA); line(x, yB, x-8, yB);
    text(x+6, yA + (yB-yA)/2, label, '#9fb3c8', 12, 'start');
  };
  const dimVLeft = (x, y0, y1, label)=>{
    const yA = Math.min(y0,y1), yB = Math.max(y0,y1);
    arrow(x, yA, x, yB); line(x, yA, x+8, yA); line(x, yB, x+8, yB);
    text(x-6, yA + (yB-yA)/2, label, '#9fb3c8', 12, 'end');
  };
  const dimH = (y, x0, x1, label)=>{
    const xA = Math.min(x0,x1), xB = Math.max(x0,x1);
    arrow(xA, y, xB, y); line(xA, y, xA, y-8); line(xB, y, xB, y-8);
    text((xA+xB)/2, y-6, label, '#9fb3c8', 12, 'middle');
  };
  const fmt = (v,u)=> u==='inch' ? (v/25.4).toFixed(3)+' in' : v.toFixed(2)+' mm';
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

  // fondo
  for(let gy=margin; gy<=H-margin; gy+=10){
    const g=mk('line'); g.setAttribute('x1','0'); g.setAttribute('x2',String(W));
    g.setAttribute('y1',String(gy)); g.setAttribute('y2',String(gy));
    g.setAttribute('stroke','#1f2a3a'); g.setAttribute('opacity','0.12'); svg.appendChild(g);
  }

  // escala
  const TL = s.TL ?? (s.CL + s.SL + s.OHL);
  const topExtra = s.tip==='ball' ? Math.max(16, s.D*0.15) : (s.tip==='chamfer' ? 8 : 0);
  const availableH = H - margin*2 - topExtra;
  const scale = availableH / TL;

  const cx = (margin + (W - margin)) / 2;
  const top = margin + topExtra;

  const strokeAll = '#2a4f7a';
  const fillCL='#17314d', fillSL='#132a45', fillOHL='#0f2238';

  // === CL con ESCALONES ===
  let y = top;
  {
    const steps = Array.isArray(s.steps) ? s.steps : [];
    let rem = s.CL;
    let curY = y;
    let lastD = s.D;

    for(const st of steps){
      if(rem <= 0) break;
      const segL = Math.max(0, Math.min(st.l || 0, rem));
      if(segL <= 0) continue;
      const w = (st.d || lastD) * scale;
      const left = cx - w/2;
      rect(left, curY, w, segL*scale, fillCL, strokeAll);
      curY += segL*scale;
      rem  -= segL;
      lastD = st.d || lastD;
    }

    if(rem > 0){
      const w = (lastD) * scale;
      const left = cx - w/2;
      rect(left, curY, w, rem*scale, fillCL, strokeAll);
      curY += rem*scale;
      rem = 0;
    }

    // Punta al inicio del CL
    if(s.tip==='flat'){
      // usa el primer tramo para ancho de línea superior
      const firstW = (steps[0]?.d ?? s.D) * scale;
      const left0 = cx - firstW/2;
      line(left0, y, left0 + firstW, y, '#86e7ff', 3);
    }else if(s.tip==='ball'){
      const firstW = (steps[0]?.d ?? s.D) * scale;
      const r = firstW/2; const p=mk('path');
      p.setAttribute('d',`M ${cx - r} ${y + r} A ${r} ${r} 0 0 1 ${cx + r} ${y + r}`);
      p.setAttribute('stroke','#86e7ff'); p.setAttribute('fill','none'); p.setAttribute('pointer-events','none'); svg.appendChild(p);
    }else if(s.tip==='chamfer'){
      const firstD = (steps[0]?.d ?? s.D);
      const firstW = firstD * scale;
      const left0 = cx - firstW/2;
      const off=Math.tan((90 - s.chamferAngle)*Math.PI/180)*(firstW/2);
      const hTip=Math.min(s.CL*scale, firstW*0.25);
      const p=mk('path');
      p.setAttribute('d',`M ${left0} ${y} L ${left0+off} ${y+hTip} L ${left0+firstW-off} ${y+hTip} L ${left0+firstW} ${y}`);
      p.setAttribute('stroke','#86e7ff'); p.setAttribute('fill','none'); p.setAttribute('pointer-events','none'); svg.appendChild(p);
    }

    // Hélices sobre todo CL, distribuidas D/2 izq a D/2 der usando D base
    {
      const baseW = s.D * scale;
      const leftBody = cx - baseW/2;
      const defs = mk('defs');
      const clip = mk('clipPath'); clip.setAttribute('id','clipCL');
      const r = mk('rect'); r.setAttribute('x', leftBody); r.setAttribute('y', y);
      r.setAttribute('width', baseW); r.setAttribute('height', s.CL*scale);
      clip.appendChild(r); defs.appendChild(clip); svg.appendChild(defs);

      const g = mk('g'); g.setAttribute('clip-path','url(#clipCL)'); svg.appendChild(g);

      const bandH = s.CL*scale;
      const k = -Math.tan(s.helix*Math.PI/180);
      const Z = Math.max(1, Math.round(s.Z));
      const halfD = baseW/2;
      const spanStart = leftBody - halfD;
      const spanEnd   = leftBody + baseW + halfD;
      const stepX     = (spanEnd - spanStart) / Z;
      const strokeW   = Math.max(1, Math.min(6, (s.D*scale)*0.08));

      for(let i=0;i<Z;i++){
        const x0 = spanStart + (i+0.5)*stepX;
        const x1 = x0 + k*bandH;
        const l = mk('line');
        l.setAttribute('x1',x0); l.setAttribute('y1',y);
        l.setAttribute('x2',x1); l.setAttribute('y2',y+bandH);
        l.setAttribute('stroke','#2aaae2'); l.setAttribute('stroke-width',strokeW);
        l.setAttribute('stroke-linecap','round'); l.setAttribute('pointer-events','none');
        g.appendChild(l);
      }
    }

    y = curY; // fin de CL
  }

  // === SL: bloque único con ancho D ===
  {
    const w = s.D * scale;
    const left = cx - w/2;
    rect(left, y, w, s.SL * scale, fillSL, strokeAll);
    y += s.SL * scale;
  }

  // === OHL: bloque con ancho AD ===
  {
    const w = s.AD * scale;
    const left = cx - w/2;
    rect(left, y, w, s.OHL * scale, fillOHL, strokeAll);
  }

  // === COTAS ===
  const maxW = Math.max(s.D, s.AD) * scale;
  const leftGeom  = cx - maxW/2;
  const rightGeom = cx + maxW/2;
  const xRight = Math.min(W-10, rightGeom + 28);
  const xLeft  = Math.max(10, leftGeom  - 28);

  const topCL  = top;
  const botCL  = top + s.CL*scale;
  const topSL  = botCL;
  const botSL  = botCL + s.SL*scale;
  const topOHL = botSL;
  const botOHL = botSL + s.OHL*scale;

  // guías a derecha
  line(rightGeom, topCL, xRight, topCL, '#6ee7ff', 1.5);
  line(rightGeom, botCL, xRight, botCL, '#6ee7ff', 1.5);
  dimVRight(xRight, topCL, botCL, `CL ${fmt(s.CL, s.unit)}`);

  line(rightGeom, topSL, xRight, topSL, '#6ee7ff', 1.5);
  line(rightGeom, botSL, xRight, botSL, '#6ee7ff', 1.5);
  dimVRight(xRight, topSL, botSL, `SL ${fmt(s.SL, s.unit)}`);

  line(rightGeom, topOHL, xRight, topOHL, '#6ee7ff', 1.5);
  line(rightGeom, botOHL, xRight, botOHL, '#6ee7ff', 1.5);
  dimVRight(xRight, topOHL, botOHL, `OHL ${fmt(s.OHL, s.unit)}`);

  // TL izquierda con texto a la izquierda
  dimVLeft(xLeft, top, top + (s.CL + s.SL + s.OHL)*scale, `TL ${fmt(s.CL + s.SL + s.OHL, s.unit)}`);

  // Horizontales D arriba y AD abajo
  const yD  = top - 12;
  dimH(yD,  cx - (s.D*scale)/2,  cx + (s.D*scale)/2,  `D ${fmt(s.D, s.unit)}`);
  const yAD = top + (s.CL + s.SL + s.OHL)*scale + 18;
  dimH(yAD, cx - (s.AD*scale)/2, cx + (s.AD*scale)/2, `AD ${fmt(s.AD, s.unit)}`);
}
