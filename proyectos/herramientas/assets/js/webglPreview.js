// Vista pseudo-3D en canvas 2D con hélice animada
export function preview3D(canvas, state){
  const ctx = canvas.getContext('2d');
  const {D,L,lc,Dz,lz,helix,material} = state;
  const W = canvas.width, H = canvas.height;
  const pad = 40; const scale = (H - pad*2)/L;
  const left = 120, top = pad;
  const color = matColor(material);

  let t = 0; cancelAnimationFrame(canvas._raf);
  const loop = ()=>{
    t += 0.02; ctx.clearRect(0,0,W,H);

    // Fondo
    const g = ctx.createLinearGradient(0,0,0,H); g.addColorStop(0,'#0c1627'); g.addColorStop(1,'#0b1322'); ctx.fillStyle=g; ctx.fillRect(0,0,W,H);

    // Zanco
    const zY = top + (L - lz)*scale; const zH = Dz*scale;
    ctx.fillStyle = '#0e2034'; ctx.strokeStyle = '#1f2a3a'; roundRect(ctx, left, zY, 700, zH, 8, true, true);

    // Cuerpo
    const bodyY = top; const bodyD = D*scale;
    ctx.fillStyle = '#0f2238'; ctx.strokeStyle = '#2a4f7a'; roundRect(ctx, left, bodyY, 700, bodyD, 8, true, true);

    // Hélice animada
    const pitch = Math.max(30, 220 - helix*2);
    for(let x=-400; x<1100; x+=pitch){
      const phase = t*50; const x1 = left + x + Math.sin((x+phase)/80)*10; const x2 = x1 + 700;
      ctx.strokeStyle = '#1e3a5f'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x1, bodyY); ctx.lineTo(x2, bodyY+bodyD); ctx.stroke();
    }

    // Overlay por material
    ctx.fillStyle = hexWithAlpha(color, 0.08); roundRect(ctx, left, bodyY, 700, bodyD, 10, true, false);

    // Cotas
    ctx.fillStyle = '#9fb3c8'; ctx.font = '12px system-ui';
    ctx.fillText(`L ${L} mm`, left+720, top + (L*scale - lz*scale)/2);
    ctx.fillText(`D ${D} mm`, left-70, top + (lc*scale)/2);

    canvas._raf = requestAnimationFrame(loop);
  };
  loop();
}

function roundRect(ctx, x, y, w, h, r, fill, stroke){
  ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); if(fill) ctx.fill(); if(stroke) { ctx.stroke(); }
}
function matColor(id){ const m={carbide:'#87f7ff',hss:'#a7b7ff',pcd:'#ffe38f',cbn:'#ffb3c1'}; return m[id]||'#bfe7ff'; }
function hexWithAlpha(hex, a){ const c=parseInt(hex.slice(1),16); const r=(c>>16)&255,g=(c>>8)&255,b=c&255; return `rgba(${r},${g},${b},${a})`; }
