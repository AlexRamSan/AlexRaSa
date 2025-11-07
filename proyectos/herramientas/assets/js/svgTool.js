// Render SVG con hélice paramétrica y anotaciones
export function materialColor(id){
  const map={carbide:'#87f7ff',hss:'#a7b7ff',pcd:'#ffe38f',cbn:'#ffb3c1'}; return map[id]||'#bfe7ff';
}

export function renderSVG(svg, state){
  const {D,L,lc,Dz,lz,Z,helix,tip,chamferAngle,steps,material} = state;
  const W = 1100, H = 480; svg.setAttribute('viewBox',`0 0 ${W} ${H}`);
  const margin = 28; const scale = (H - margin*2)/L; const cx = 120; const top = margin;
  svg.innerHTML = '';

  const bodyStroke = '#93c5fd', bodyFill = '#0f2238', shankFill = '#0e2034', accent = materialColor(material);
  const mk = n => document.createElementNS('http://www.w3.org/2000/svg', n);
  const R = (x,y,w,h,fill,stroke,rx=6)=>{ const r=mk('rect'); r.setAttribute('x',x); r.setAttribute('y',y); r.setAttribute('width',w); r.setAttribute('height',h); r.setAttribute('rx',rx); r.setAttribute('fill',fill); if(stroke) r.setAttribute('stroke',stroke); svg.appendChild(r); return r; };
  const Ln = (x1,y1,x2,y2,stroke,w=2)=>{ const l=mk('line'); l.setAttribute('x1',x1); l.setAttribute('y1',y1); l.setAttribute('x2',x2); l.setAttribute('y2',y2); l.setAttribute('stroke',stroke); l.setAttribute('stroke-width',w); svg.appendChild(l); return l; };
  const Path = (d,fill,stroke,w=2)=>{ const p=mk('path'); p.setAttribute('d',d); if(fill) p.setAttribute('fill',fill); if(stroke){ p.setAttribute('stroke',stroke); p.setAttribute('stroke-width',w); p.setAttribute('fill','none'); } svg.appendChild(p); return p; };
  const Text = (x,y,t)=>{ const e=mk('text'); e.setAttribute('x',x); e.setAttribute('y',y); e.setAttribute('fill','#9fb3c8'); e.setAttribute('font-size','12'); e.textContent=t; svg.appendChild(e); return e; };

  // Grid
  for(let y=top; y<=H-top; y+=10){ const line=mk('line'); line.setAttribute('x1','0'); line.setAttribute('x2',String(W)); line.setAttribute('y1',String(y)); line.setAttribute('y2',String(y)); line.setAttribute('stroke','#1f2a3a'); line.setAttribute('opacity','0.15'); svg.appendChild(line); }

  // Zanco
  const shY = top + (L - lz)*scale; const shH = Dz*scale; R(cx, shY, 700, shH, shankFill, '#1f2a3a', 8);

  // Segmentos cuerpo
  const safeLc = Math.min(lc, L-10); let remaining = Math.max(0, L - lz); let curD = D; const segs=[];
  if(safeLc>0){ segs.push({d:curD,l:safeLc,type:'cut'}); remaining-=safeLc; }
  for(const s of steps){ const len = Math.min(s.l, Math.max(0,remaining)); if(len<=0) break; segs.push({d:s.d,l:len,type:'step'}); curD=s.d; remaining-=len; }
  if(remaining>0) segs.push({d:curD,l:remaining,type:'neck'});

  // Dibujar segmentos
  let y = top;
  for(const s of segs){ const h=s.l*scale; const diaPx=s.d*scale; R(cx, y, 700, diaPx, bodyFill, bodyStroke, 8); y += h; }

  // Punta
  const tipTop=top; const tipH = Math.min(Math.max(2, D*0.2), safeLc)*scale;
  if(tip==='flat'){ Ln(cx, tipTop, cx+700, tipTop, accent, 3); }
  else if(tip==='ball'){ const r=(D*scale)/2; const d=`M ${cx} ${tipTop+r} A ${r} ${r} 0 0 1 ${cx+700} ${tipTop+r}`; Path(d,null,accent,2); }
  else if(tip==='chamfer'){ const off=Math.tan((90-chamferAngle)*Math.PI/180)*(D*scale/2); const d=`M ${cx} ${tipTop} L ${cx+off} ${tipTop+tipH} L ${cx+700-off} ${tipTop+tipH} L ${cx+700} ${tipTop} Z`; Path(d,accent+'22',accent,1.5); }

  // Hélice paramétrica sugerida
  const bandTop=top, bandBot=top+safeLc*scale, bandH=D*scale; const pitch = Math.max(10, 200 - helix*2);
  for(let x=cx-400; x<cx+1100; x+=pitch){
    const k = Math.tan(helix*Math.PI/180);
    const x2 = x + k*bandH;
    Ln(Math.max(cx,x), bandTop, Math.min(cx+700,x2), bandBot, '#20476b', 1);
  }
  // Marcas de filos
  for(let i=0;i<Z;i++){ const fx = cx + 20 + i*(660/Math.max(1,Z-1)); Ln(fx, bandTop, fx, bandBot, '#2aaae2', 1); }

  // Dimensiones
  Ln(cx+720, top, cx+720, top+L*scale, '#6ee7ff', 2); Ln(cx+720, top, cx+712, top, '#6ee7ff', 2); Ln(cx+720, top+L*scale, cx+712, top+L*scale, '#6ee7ff', 2); Text(cx+728, top+(L*scale)/2, `L ${L} mm`);
  const mid = top + (safeLc*scale)/2; Ln(cx-8, mid-(D*scale/2), cx-8, mid+(D*scale/2), '#6ee7ff', 2); Ln(cx-8, mid-(D*scale/2), cx-16, mid-(D*scale/2), '#6ee7ff', 2); Ln(cx-8, mid+(D*scale/2), cx-16, mid+(D*scale/2), '#6ee7ff', 2); Text(cx-84, mid+4, `D ${D} mm`);
  const zMid = top + (L-lz)*scale + (Dz*scale)/2; Ln(cx-8, zMid-(Dz*scale/2), cx-8, zMid+(Dz*scale/2), '#6ee7ff', 2); Ln(cx-8, zMid-(Dz*scale/2), cx-16, zMid-(Dz*scale/2), '#6ee7ff', 2); Ln(cx-8, zMid+(Dz*scale/2), cx-16, zMid+(Dz*scale/2), '#6ee7ff', 2); Text(cx-110, zMid+4, `Dz ${Dz} mm`);

  // Overlay por material
  R(cx, top, 700, L*scale, accent+'14', 'none', 10);
}
 
