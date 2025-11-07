// Materiales y presets de ejemplo
export const MATERIALS = [
  { id:'carbide', name:'Carburo', color:'#87f7ff' },
  { id:'hss',     name:'HSS',     color:'#a7b7ff' },
  { id:'pcd',     name:'PCD',     color:'#ffe38f' },
  { id:'cbn',     name:'CBN',     color:'#ffb3c1' }
];

export const PRESETS = {
  "Fresa Cilíndrica": [
    { name:"Ø12 Z4 L100 lc30 Dz12 lz60 35° plana", params:{ diameter:12, length:100, cutLength:30, shankDia:12, shankLen:60, flutes:4, helix:35, tip:'flat', chamferAngle:45, steps:"", material:'carbide' } },
    { name:"Ø6 Z2 L60 lc12 Dz6 lz40 40° bola",    params:{ diameter:6,  length:60,  cutLength:12, shankDia:6,  shankLen:40, flutes:2, helix:40, tip:'ball',  chamferAngle:45, steps:"", material:'hss' } }
  ],
  "Fresa Escalonada": [
    { name:"Ø12→10→8 Z4", params:{ diameter:12, length:95, cutLength:18, shankDia:12, shankLen:60, flutes:4, helix:30, tip:'flat', chamferAngle:45, steps:"10x12,8x10", material:'carbide' } }
  ],
  "Broca": [
    { name:"Ø10 L120 lc70 cono 118°", params:{ diameter:10, length:120, cutLength:70, shankDia:10, shankLen:50, flutes:2, helix:28, tip:'chamfer', chamferAngle:59, steps:"", material:'hss' } }
  ]
};
