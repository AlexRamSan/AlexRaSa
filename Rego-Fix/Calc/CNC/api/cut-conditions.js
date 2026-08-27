// Base de datos de Materiales (kc en N/mm2, Vc base en m/min, fz base en mm/z)
export const MATERIALS_DB = {
  // Automotriz
  'al_a356': { name: 'Aluminio Fundición A356 / A380', kc: 850, vc: 600, fz: 0.14, cat: 'auto' },
  'cgi_iron': { name: 'Hierro Compactado Vermicular (CGI)', kc: 1900, vc: 140, fz: 0.10, cat: 'auto' },
  'nodular_iron': { name: 'Hierro Dúctil / Nodular (GGG40/60)', kc: 1600, vc: 180, fz: 0.12, cat: 'auto' },
  'gray_iron': { name: 'Fundición Gris (GG25 / Clase 30)', kc: 1350, vc: 220, fz: 0.14, cat: 'auto' },
  'forged_steel': { name: 'Acero Forjado (4340 / 8620)', kc: 2100, vc: 160, fz: 0.08, cat: 'auto' },

  // Aeroespacial
  'al_7075': { name: 'Aluminio Aeronáutico (7075-T6 / 2024)', kc: 700, vc: 800, fz: 0.16, cat: 'aero' },
  'al_li': { name: 'Aluminio-Litio (Al-Li 2099)', kc: 750, vc: 650, fz: 0.14, cat: 'aero' },
  'ti_6al4v': { name: 'Titanio Grado 5 (Ti-6Al-4V)', kc: 2800, vc: 55, fz: 0.055, cat: 'aero' },
  'ti_5553': { name: 'Titanio Beta (Ti-5553)', kc: 3100, vc: 40, fz: 0.045, cat: 'aero' },
  'inconel_718': { name: 'Inconel 718 / 625 (HRSA)', kc: 3300, vc: 35, fz: 0.038, cat: 'aero' },
  'waspaloy': { name: 'Waspaloy / René 41', kc: 3500, vc: 28, fz: 0.032, cat: 'aero' },

  // Médico
  'ss_316lvm': { name: 'Inox Quirúrgico 316LVM / 1.4441', kc: 2400, vc: 110, fz: 0.050, cat: 'med' },
  'cocr_alloy': { name: 'Cobalto-Cromo (ASTM F75)', kc: 3400, vc: 35, fz: 0.035, cat: 'med' },
  'ss_174ph': { name: 'Inoxidable 17-4 PH / 15-5 PH', kc: 2600, vc: 95, fz: 0.050, cat: 'med' },
  'peek_med': { name: 'PEEK Médico Biocompatible', kc: 380, vc: 350, fz: 0.12, cat: 'med' },

  // Taller / Moldes
  'al_6061': { name: 'Aluminio Estándar (6061-T6 / 6082)', kc: 700, vc: 700, fz: 0.15, cat: 'general' },
  'steel_1018': { name: 'Acero al Carbón Dulce (1018 / A36)', kc: 1800, vc: 190, fz: 0.085, cat: 'general' },
  'steel_1045': { name: 'Acero Medio Carbón (1045 / 4140)', kc: 2000, vc: 160, fz: 0.075, cat: 'general' },
  'tool_p20': { name: 'Acero Moldes P20 (1.2311)', kc: 2200, vc: 130, fz: 0.065, cat: 'general' },
  'tool_h13': { name: 'Acero Herramientas H13 / D2', kc: 2400, vc: 110, fz: 0.055, cat: 'general' },
  'hardened_steel': { name: 'Aceros Templados (>52 HRC)', kc: 3200, vc: 75, fz: 0.035, cat: 'general' },
  'brass_bronze': { name: 'Latón / Bronce / Cobre', kc: 800, vc: 350, fz: 0.14, cat: 'general' },

  // No Metales
  'cfrp_carbon': { name: 'Fibra de Carbono (CFRP)', kc: 500, vc: 180, fz: 0.05, cat: 'nonmetal' },
  'acetal_pom': { name: 'Plásticos Técnicos (POM / Delrin)', kc: 350, vc: 450, fz: 0.16, cat: 'nonmetal' }
};

// Factores de corrección por sustrato de herramienta
export const SUBSTRATES_DB = {
  'pcd': { name: 'PCD (Diamante)', fVc: 2.4, fFz: 1.5 },
  'carbide_dlc': { name: 'Carburo + DLC', fVc: 1.3, fFz: 1.15 },
  'carbide_coated': { name: 'Carburo Recubierto', fVc: 1.0, fFz: 1.0 },
  'carbide_uncoated': { name: 'Carburo sin Recubrir', fVc: 0.85, fFz: 0.95 },
  'cbn': { name: 'CBN (Nitruro de Boro)', fVc: 2.0, fFz: 0.85 },
  'ceramic': { name: 'Cerámica / Cermet', fVc: 2.5, fFz: 0.70 },
  'hss_pm': { name: 'PM HSS / HSS-Co8', fVc: 0.45, fFz: 0.85 },
  'hss_std': { name: 'HSS Estándar (M2)', fVc: 0.30, fFz: 0.75 }
};

// Motor principal de física de corte
export function calculateCuttingPhysics(params) {
  const { holder, material, operation, tool_type, tool_mat, dia, z, pitch, stickout, max_rpm } = params;
  
  const matData = MATERIALS_DB[material] || MATERIALS_DB['al_a356'];
  const subData = SUBSTRATES_DB[tool_mat] || SUBSTRATES_DB['pcd'];

  let vc = matData.vc * subData.fVc;
  let fz = matData.fz * subData.fFz;
  let kc = matData.kc;

  let ap = dia * 0.5;
  let ae = dia * 0.4;

  if (operation === 'drilling' || tool_type.includes('drill')) {
    ap = dia * 3.0;
    ae = dia;
    vc *= 0.70;
    fz = dia * 0.018;
  } else if (operation === 'tapping' || tool_type.includes('tap')) {
    ap = dia * 2.0;
    ae = dia;
    vc = (material.includes('al') ? 25 : (material.includes('inconel') ? 6 : 14)) * (tool_mat === 'carbide_coated' ? 1.8 : 1.0);
  } else if (operation === 'reaming' || tool_type === 'reamer') {
    ap = dia * 2.5;
    ae = dia * 0.05;
    vc *= 0.35;
    fz *= 1.5;
  } else if (operation === 'facemilling' || tool_type === 'facemill') {
    ap = 2.5;
    ae = dia * 0.75;
    fz *= 1.3;
  } else if (operation === '3d_contouring' || tool_type.includes('ball')) {
    ap = dia * 0.10;
    ae = dia * 0.15;
    fz *= 0.75;
  } else if (operation === 'hpc_dynamic') {
    ap = dia * 1.8;
    ae = dia * 0.10;
    fz *= 1.35;
  } else if (operation === 'slotting') {
    ap = dia * 0.4;
    ae = dia * 1.0;
    fz *= 0.75;
  } else if (operation === 'hfm_feed') {
    ap = Math.min(1.2, dia * 0.06);
    ae = dia * 0.65;
    fz *= 2.8;
  } else if (operation === 'finishing') {
    ap = dia * 1.2;
    ae = dia * 0.05;
    fz *= 0.50;
  } else if (operation === 'thread_milling') {
    ap = dia * 1.5;
    ae = dia * 0.15;
    vc *= 0.8;
  } else if (operation === 'chamfering') {
    ap = 1.0;
    ae = 1.0;
    fz *= 0.8;
  }

  // Factor de rigidez del portaherramientas REGO-FIX
  let fHolder = 1.0;
  if (holder === 'pg48' || holder === 'pg32') {
    fHolder = 1.18;
  } else if (holder === 'pg25' || holder === 'pg15' || holder === 'pg10' || holder === 'pg6') {
    fHolder = 1.12;
  } else if (holder === 'mr_all') {
    fHolder = 1.10;
  } else if (holder === 'er_up') {
    fHolder = 1.0;
  } else if (holder === 'er_std') {
    fHolder = 0.85;
  }

  // Penalización por voladizo (Stickout L/D)
  const ratioLD = stickout / dia;
  let fLD = 1.0;
  if (ratioLD > 3.5) fLD = 0.85;
  if (ratioLD > 5.0) fLD = 0.70;

  // Cinemática
  const rpmTeorico = (vc * 1000) / (Math.PI * dia);
  const rpmFinal = Math.min(rpmTeorico, max_rpm);
  const fzFinal = fz * fHolder * fLD;
  
  let vf_mm_min = (operation === 'tapping' || tool_type.includes('tap'))
    ? (rpmFinal * pitch)
    : (rpmFinal * z * fzFinal);

  const vf_m_min = vf_mm_min / 1000;
  const vf_ipm = vf_mm_min / 25.4;
  const vf_ips = vf_ipm / 60;

  const fz_in = fzFinal / 25.4;
  const fn_mm = (operation === 'tapping') ? pitch : fzFinal * z;
  const fn_in = fn_mm / 25.4;

  const vc_m_min = Math.round((rpmFinal * Math.PI * dia) / 1000);
  const vc_sfm = Math.round((rpmFinal * (dia / 25.4)) / 3.82);

  const ratioAe = Math.min(ae / dia, 1.0);
  const hex_mm = (ratioAe < 0.5 && !tool_type.includes('drill') && !tool_type.includes('tap'))
    ? fzFinal * (2 * Math.sqrt(ratioAe * (1 - ratioAe)))
    : fzFinal;

  const q_cm3 = (ap * ae * vf_mm_min) / 1000;
  const powerKw = (q_cm3 * kc) / (60 * 1000 * 0.80);
  const tpf = (rpmFinal * z) / 60;

  return {
    rpmTeorico, rpmFinal, vc_m_min, vc_sfm,
    vf_mm_min, vf_m_min, vf_ipm, vf_ips,
    fzFinal, fz_in, fn_mm, fn_in, hex_mm,
    ap, ae, q_cm3, powerKw, tpf, ratioLD
  };
}
