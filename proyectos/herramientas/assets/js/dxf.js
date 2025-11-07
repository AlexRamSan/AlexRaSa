// Export DXF de perfil lateral como polilínea cerrada
export function exportDXF(state){
  const {D,L,lc,Dz,lz,steps} = state;
  const pts = [];
  const half = v => v/2;
  let y = 0;

  // Inicio en punta superior derecha
  pts.push([half(D), y]);

  // Zona de corte
  const lcLen = Math.min(lc, L-10);
  y += lcLen; pts.push([half(D), y]);

  // Escalones
  let curD = D; let rem = Math.max(0, L - lz - lcLen);
  for(const s of steps){ const len = Math.min(s.l, rem); if(len<=0) break; curD = s.d; y += len; pts.push([half(curD), y]); rem -= len; }

  // Cuello
  if(rem>0){ y += rem; pts.push([half(curD), y]); }

  // Bajar a eje, cerrar al origen
  pts.push([0, y]);
  pts.push([0, 0]);

  const dxf = buildDXF(pts);
  return new Blob([dxf], {type:'application/dxf'});
}

function buildDXF(points){
  const header = `0
SECTION
2
HEADER
0
ENDSEC
0
SECTION
2
TABLES
0
ENDSEC
0
SECTION
2
ENTITIES
`;
  const footer = `0
ENDSEC
0
EOF
`;
  const poly = [
    '0','LWPOLYLINE','8','0','90', String(points.length),'70','1' // closed
  ];
  for(const [x,y] of points){ poly.push('10',String(x),'20',String(y)); }
  return header + poly.join('\n') + '\n' + footer;
}
