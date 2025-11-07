// Escalones CL con chaflán DxLxAxC. Validación: C = Δradio / tan(A).
// Hélices siguen cada tramo con Ø local. Inician 1×Ø izq y terminan 2×Ø der.
// Nº de filos = round(Z*1.5). Cotas: der (CL, SL, OHL), izq (TL), D arriba, AD abajo.
// Punta (flat/ball/chamfer) se dibuja al final para quedar por encima del cuerpo.
// Cotas derechas se empujan dinámicamente según el ancho de las etiquetas de escalones.

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
  const path = (d, st='#2a4f7a', fill='none', w=2)=>{
    const p=mk('path'); p.setAttribute('d',d);
    if(fill && fill!=='none') p.setAttribute('fill',fill);
    if(st){ p.setAttribute('stroke',st); p.setAttribute('stroke-width',w); if(fill==='none') p.setAttribute('fill','none'); }
    p.setAttribute('pointer-events','none'); svg.appendChild(p); return p;
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
      p.setAttribute('fill',st); p.setAttribute('pointer-events','none'); svg.appendChild(p);
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

  // === CL con escalones y chaflán validado ===
  let y = top;
  const steps = Array.isArray(s.steps) ? s.steps : [];
  const firstD = (steps[0]?.d ?? s.D);
  let lastD = firstD;

  for(let idx=0; idx<steps.length; idx++){
    const st = steps[idx];
    let dThis = Math.max(0.01, st.d ?? lastD);
    let Lseg  = Math.max(0, st.l ?? 0);
    const hasNext = (idx < steps.length - 1);
    const nextD = hasNext ? Math.max(0.01, steps[idx+1].d ?? dThis) : dThis;

    // Validación C = Δr / tan(A)
    let cLenDesired = 0;
    if (hasNext && st.a != null && st.a > 0){
      const aRad = (st.a*Math.PI/180);
      const tanA = Math.tan(aRad);
      if (tanA > 1e-6){
        const deltaR = Math.abs(nextD - dThis)/2;
        cLenDesired = deltaR / tanA;
      }
    }
    let cLen = Math.min(Lseg, cLenDesired || 0);

    // parte recta
    const straightL = Math.max(0, Lseg - cLen);
    if (straightL > 0){
      const w = dThis * scale;
      const left = cx - w/2;
      const hpx = straightL * scale;
      rect(left, y, w, hpx, fillCL, strokeAll);
      text(left + w + 10, y + hpx/2, `${dThis}×${straightL}`, '#bcd7f5', 12, 'start');
      drawFlutesSegment(y, hpx, dThis);
      y += hpx;
    }

    // chaflán como trapecio
    if (cLen > 0){
      const w1 = dThis * scale;
      const w2 = nextD * scale;
      const left1 = cx - w1/2;
      const left2 = cx - w2/2;
      const hpx = cLen * scale;

      const dPath = [
        `M ${left1} ${y}`,
        `L ${left1 + w1} ${y}`,
        `L ${left2 + w2} ${y + hpx}`,
        `L ${left2} ${y + hpx}`,
        'Z'
      ].join(' ');
      path(dPath, '#2a4f7a', fillCL, 2);
      text(Math.max(left1+w1, left2+w2) + 10, y + hpx/2, `${nextD} (∠${(st.a||0)}°)×${cLen.toFixed(2)}`, '#bcd7f5', 12, 'start');

      const dMid = (dThis + nextD)/2;
      drawFlutesSegment(y, hpx, dMid, {left1,w1,left2,w2,hpx});
      y += hpx;
      dThis = nextD;
    }

    lastD = dThis;
  }

  // remanente de CL
  const usedL = steps.reduce((a,t)=> a + Math.max(0,t.l||0), 0);
  const rem = Math.max(0, s.CL - usedL);
  if (rem > 0){
    const w = lastD * scale;
    const left = cx - w/2;
    const hpx = rem * scale;
    rect(left, y, w, hpx, fillCL, strokeAll);
    text(left + w + 10, y + hpx/2, `${lastD}×${rem}`, '#bcd7f5', 12, 'start');
    drawFlutesSegment(y, hpx, lastD);
    y += hpx;
  }

  // === SL: bloque Ø=D ===
  { const w = s.D * scale; const left = cx - w/2; rect(left, y, w, s.SL * scale, fillSL, strokeAll); y += s.SL * scale; }

  // === OHL: bloque Ø=AD ===
  { const w = s.AD * scale; const left = cx - w/2; rect(left, y, w, s.OHL * scale, fillOHL, strokeAll); }

  // === COTAS (con padding dinámico a la derecha) ===
  const maxDiaSteps = Math.max(s.D, ...(steps.map(st=>Math.max(0.01, st.d||s.D))));
  const maxW = Math.max(maxDiaSteps, s.AD) * scale;
  const leftGeom  = cx - maxW/2;
  const rightGeom = cx + maxW/2;

  // Estimar ancho de etiquetas de escalones y reservar gutter
  function estCLen(st, nextD){
    if (!(st && st.a > 0 && nextD != null)) return 0;
    const aRad = st.a * Math.PI/180;
    const tanA = Math.tan(aRad);
    if (tanA <= 1e-6) return 0;
    const deltaR = Math.abs((nextD - (st.d ?? s.D)))/2;
    return Math.min(st.l || 0, deltaR / tanA);
  }
  const stepLabelStrs = steps.map((st, i) => {
    const d = (st?.d ?? s.D);
    const l = (st?.l ?? 0);
    const nextD = (i < steps.length-1) ? (steps[i+1]?.d ?? d) : d;
    const c = estCLen(st, nextD);
    const base = `${d}×${l}`;
    if (c > 0) return `${base}  (∠${(st.a||0)}°)×${c.toFixed(2)}`;
    return base;
  });
  const maxChars = Math.max(0, ...stepLabelStrs.map(t => String(t).length));
  const labelPadPx = maxChars * 7 + 20;   // ≈7px por carácter + 20px margen

  const basePad = 28;
  const xRight = Math.min(W - 10, rightGeom + basePad + labelPadPx);
  const xLeft  = Math.max(10, leftGeom  - 28);

  const topCL  = top;
  const botCL  = top + s.CL*scale;
  const topSL  = botCL;
  const botSL  = botCL + s.SL*scale;
  const topOHL = botSL;
  const botOHL = botSL + s.OHL*scale;

  line(rightGeom, topCL, xRight, topCL, '#6ee7ff', 1.5);
  line(rightGeom, botCL, xRight, botCL, '#6ee7ff', 1.5);
  dimVRight(xRight, topCL, botCL, `CL ${fmt(s.CL, s.unit)}`);

  line(rightGeom, topSL, xRight, topSL, '#6ee7ff', 1.5);
  line(rightGeom, botSL, xRight, botSL, '#6ee7ff', 1.5);
  dimVRight(xRight, topSL, botSL, `SL ${fmt(s.SL, s.unit)}`);

  line(rightGeom, topOHL, xRight, topOHL, '#6ee7ff', 1.5);
  line(rightGeom, botOHL, xRight, botOHL, '#6ee7ff', 1.5);
  dimVRight(xRight, topOHL, botOHL, `OHL ${fmt(s.OHL, s.unit)}`);

  dimVLeft(xLeft, top, top + (s.CL + s.SL + s.OHL)*scale, `TL ${fmt(s.CL + s.SL + s.OHL, s.unit)}`);

  const yD  = top - 12;
  dimH(yD,  cx - (s.D*scale)/2,  cx + (s.D*scale)/2,  `D ${fmt(s.D, s.unit)}`);
  const yAD = top + (s.CL + s.SL + s.OHL)*scale + 18;
  dimH(yAD, cx - (s.AD*scale)/2, cx + (s.AD*scale)/2, `AD ${fmt(s.AD, s.unit)}`);

  // === PUNTA ENCIMA DEL CUERPO (AL FINAL) ===
  {
    const firstW = firstD * scale;
    const left0  = cx - firstW/2;
    const yTop   = top;

    if (s.tip === 'flat') {
      const L = mk('line');
      L.setAttribute('x1', left0); L.setAttribute('y1', yTop);
      L.setAttribute('x2', left0 + firstW); L.setAttribute('y2', yTop);
      L.setAttribute('stroke', '#86e7ff'); L.setAttribute('stroke-width', 3);
      L.setAttribute('stroke-linecap', 'round');
      L.setAttribute('pointer-events','none');
      svg.appendChild(L);
    } else if (s.tip === 'ball') {
      const r = firstW/2;
      const P = mk('path');
      P.setAttribute('d', `M ${cx - r} ${yTop + r} A ${r} ${r} 0 0 1 ${cx + r} ${yTop + r}`);
      P.setAttribute('stroke', '#86e7ff'); P.setAttribute('fill','none');
      P.setAttribute('stroke-width', 2.5); P.setAttribute('stroke-linejoin','round');
      P.setAttribute('pointer-events','none');
      svg.appendChild(P);
    } else if (s.tip === 'chamfer') {
      const off  = Math.tan((90 - s.chamferAngle)*Math.PI/180)*(firstW/2);
      const hTip = Math.min(s.CL*scale, firstW*0.25);
      const P = mk('path');
      P.setAttribute('d', `M ${left0} ${yTop} L ${left0+off} ${yTop+hTip} L ${left0+firstW-off} ${yTop+hTip} L ${left0+firstW} ${yTop}`);
      P.setAttribute('stroke', '#86e7ff'); P.setAttribute('fill','none');
      P.setAttribute('stroke-width', 2.5); P.setAttribute('stroke-linejoin','round');
      P.setAttribute('pointer-events','none');
      svg.appendChild(P);
    }
  }

  // ---- flautas por tramo ----
  function drawFlutesSegment(yTop, hpx, dLocal, clipTrap){
    const baseW = dLocal * scale;
    const leftBody = cx - baseW/2;

    let g;
    if (clipTrap){
      const id = `clip_${yTop}_${baseW}`;
      const defs = mk('defs');
      const cp = mk('clipPath'); cp.setAttribute('id', id);
      const poly = mk('polygon');
      const pts = [
        `${clipTrap.left1},${yTop}`,
        `${clipTrap.left1 + clipTrap.w1},${yTop}`,
        `${clipTrap.left2 + clipTrap.w2},${yTop + clipTrap.hpx}`,
        `${clipTrap.left2},${yTop + clipTrap.hpx}`,
      ].join(' ');
      poly.setAttribute('points', pts);
      cp.appendChild(poly); defs.appendChild(cp); svg.appendChild(defs);
      g = mk('g'); g.setAttribute('clip-path', `url(#${id})`); svg.appendChild(g);
    }else{
      const defs = mk('defs');
      const clip = mk('clipPath'); clip.setAttribute('id','clipRect_'+yTop+'_'+baseW);
      const r = mk('rect'); r.setAttribute('x', leftBody); r.setAttribute('y', yTop);
      r.setAttribute('width', baseW); r.setAttribute('height', hpx);
      clip.appendChild(r); defs.appendChild(clip); svg.appendChild(defs);
      g = mk('g'); g.setAttribute('clip-path','url(#clipRect_'+yTop+'_'+baseW+')'); svg.appendChild(g);
    }

    const k = -Math.tan(s.helix*Math.PI/180);
    const Zdraw = Math.max(1, Math.round(s.Z * 1.5));
    const spanStart = leftBody - 1*baseW;          // 1×Ø izq
    const spanEnd   = leftBody + baseW + 2*baseW;  // 2×Ø der
    const stepX     = (spanEnd - spanStart) / Zdraw;
    const strokeW   = Math.max(1, Math.min(6, (dLocal*scale)*0.08));

    for(let i=0;i<Zdraw;i++){
      const x0 = spanStart + (i+0.5)*stepX;
      const x1 = x0 + k*hpx;
      const l = mk('line');
      l.setAttribute('x1',x0); l.setAttribute('y1',yTop);
      l.setAttribute('x2',x1); l.setAttribute('y2',yTop + hpx);
      l.setAttribute('stroke','#2aaae2'); l.setAttribute('stroke-width',strokeW);
      l.setAttribute('stroke-linecap','round'); l.setAttribute('pointer-events','none');
      g.appendChild(l);
    }
  }
}
