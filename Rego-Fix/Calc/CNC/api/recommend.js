export const COMPATIBLE_TOOLS_BY_OP = {
  'shoulder': [
    { id: 'endmill', title: 'Endmill Plano', sub: 'Fresado cilíndrico estándar', z: 4 },
    { id: 'facemill', title: 'Fresa de Escuadrar', sub: 'Con insertos intercambiables', z: 5 }
  ],
  'hpc_dynamic': [
    { id: 'endmill_trochoidal', title: 'Endmill HPC / Trocoidal', sub: 'Hélice variable z=4 a 7', z: 5 },
    { id: 'endmill', title: 'Endmill Sólido', sub: 'Gavilanes pulidos', z: 4 }
  ],
  'slotting': [
    { id: 'endmill_3flute', title: 'Endmill 3 Filos', sub: 'Máximo desalojo de viruta', z: 3 },
    { id: 'endmill', title: 'Endmill 4 Filos', sub: 'Ranurado convencional', z: 4 }
  ],
  'hfm_feed': [
    { id: 'high_feed_mill', title: 'Fresa High Feed (HFM)', sub: 'Radio toroidal / gran avance', z: 4 }
  ],
  'finishing': [
    { id: 'endmill_finishing', title: 'Endmill Acabado', sub: 'Multi-filos z=6 a 8', z: 6 },
    { id: 'endmill', title: 'Endmill Plano', sub: 'Paredes verticales', z: 4 }
  ],
  'facemilling': [
    { id: 'facemill', title: 'Plato de Carear (Face Mill)', sub: 'Insertos a 45° o 90°', z: 5 }
  ],
  'drilling': [
    { id: 'drill', title: 'Broca de Carburo / HSS', sub: 'Taladrado z=2 con refrigeración interna', z: 2 },
    { id: 'step_drill', title: 'Broca Escalonada', sub: 'Taladro + chaflán simultáneo', z: 2 }
  ],
  'tapping': [
    { id: 'tap_cutting', title: 'Machuelo de Corte', sub: 'Gavilanes rectos o helicoidales', z: 4 },
    { id: 'tap_forming', title: 'Machuelo de Laminación / Roll', sub: 'Sin viruta (laminado en frío)', z: 4 }
  ],
  'reaming': [
    { id: 'reamer', title: 'Escariador de Precisión (Reamer)', sub: 'Corte multi-filo z=6 a 8 para H7', z: 6 }
  ],
  '3d_contouring': [
    { id: 'ballnose', title: 'Fresa Esférica (Ball Nose)', sub: 'Copiado y superficies orgánicas', z: 2 },
    { id: 'bullnose', title: 'Fresa Tórica (Bull Nose)', sub: 'Punta con radio de esquina', z: 4 }
  ],
  'thread_milling': [
    { id: 'thread_mill', title: 'Fresa de Roscar por Interpolación', sub: 'Rosca CNC helicoidal', z: 4 }
  ],
  'chamfering': [
    { id: 'chamfer_mill', title: 'Fresa de Chaflanar (45° / 60°)', sub: 'Desbarbado y biselado de bordes', z: 4 }
  ]
};

export function generateDiagnostics(state, results, dict) {
  const tips = [];
  
  if (state.holder.startsWith('pg')) {
    tips.push(dict.tip_pg);
  } else if (state.holder === 'mr_all') {
    tips.push(dict.tip_mr);
  } else {
    tips.push(dict.tip_er);
  }

  if (state.operation === 'tapping') {
    tips.push(`<b>Roscado Sincronizado:</b> Paso configurado a ${state.pitch} mm/hilo. Avance programado estrictamente como F = S × Paso.`);
  }

  if (results.ratioLD > 3.5) {
    tips.push(`${dict.tip_proj_warn} (L/D = ${results.ratioLD.toFixed(1)}).`);
  }

  if (results.rpmTeorico > state.max_rpm) {
    tips.push(dict.tip_rpm_limit);
  }

  return tips;
}
