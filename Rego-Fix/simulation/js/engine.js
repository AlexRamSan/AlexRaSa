/**
 * REGO-FIX® Machining & Deflection Calculation Engine
 * Basado en el modelo empírico de Kienzle y elasticidad de vigas Euler-Bernoulli.
 */

const MATERIAL_DATABASE = {
  '4140': {
    name: 'Acero Aleado 4140 (30 HRC)',
    kc1_1: 2150,  // N/mm² a espesor h = 1mm
    mc: 0.25,     // Exponente de Kienzle
    density: 7.85 // g/cm³
  },
  '1018': {
    name: 'Acero Dulce 1018',
    kc1_1: 1650,
    mc: 0.22,
    density: 7.87
  },
  '316L': {
    name: 'Acero Inoxidable 316L',
    kc1_1: 2450,
    mc: 0.28,
    density: 8.00
  },
  '6061': {
    name: 'Aluminio 6061-T6',
    kc1_1: 750,
    mc: 0.18,
    density: 2.70
  },
  'ti6al4v': {
    name: 'Titanio Grado 5 (Ti6Al4V)',
    kc1_1: 2850,
    mc: 0.26,
    density: 4.43
  },
  'inconel718': {
    name: 'Inconel 718',
    kc1_1: 3400,
    mc: 0.32,
    density: 8.19
  }
};

const HOLDER_SYSTEMS = {
  'pg': {
    name: 'powRgrip® PG25',
    stiffnessFactor: 1.0,     // 100% rigidez de referencia
    dampingRatio: 0.08,      // 8% absorción armónica de vibraciones
    tirNominal: 2.5          // < 3 µm alabeo garantizado
  },
  'er': {
    name: 'ER Standard Collet',
    stiffnessFactor: 0.58,   // Menor rigidez por juego y pared delgada
    dampingRatio: 0.02,      // 2% absorción (mayor tendencia a chatter)
    tirNominal: 8.5          // ~8-10 µm alabeo típico en taller
  }
};

class MachiningEngine {
  constructor() {
    this.youngModulusCarbide = 600000; // MPa (N/mm²) para Carburo de Tungsteno
  }

  calculate({
    materialKey = '4140',
    holderKey = 'pg',
    toolDiameter = 12, // mm
    flutes = 4,
    stickout = 40,      // mm
    ap = 12,            // mm (profundidad axial)
    ae = 3,             // mm (ancho radial)
    fz = 0.08,          // mm/diente
    vc = 180            // m/min
  }) {
    const mat = MATERIAL_DATABASE[materialKey] || MATERIAL_DATABASE['4140'];
    const holder = HOLDER_SYSTEMS[holderKey] || HOLDER_SYSTEMS['pg'];

    // 1. Cinemática de corte
    // RPM: n = (vc * 1000) / (pi * d)
    const rpm = Math.round((vc * 1000) / (Math.PI * toolDiameter));
    // Velocidad de avance vf = fz * z * n (mm/min)
    const vf = Math.round(fz * flutes * rpm);

    // 2. Espesor medio de viruta (hm) para fresado periférico
    // hm = fz * sqrt(ae / d)
    const immersionRatio = Math.min(1.0, ae / toolDiameter);
    const hm = fz * Math.sqrt(immersionRatio);

    // 3. Fuerza de corte específica según Kienzle: kc = kc1.1 * hm^(-mc)
    const hmClamped = Math.max(0.005, hm);
    const kc = mat.kc1_1 * Math.pow(hmClamped, -mat.mc);

    // 4. Fuerza Tangencial Principal (Fc): Fc = ap * ae * (vf / (d * n * pi)) * kc ...
    // O simplificada precisa: Fc = ap * hm * kc (por diente activo promedio)
    const activeTeeth = Math.max(0.5, (flutes * Math.acos(1 - (2 * ae / toolDiameter))) / (2 * Math.PI));
    const fc = Math.round(ap * hm * kc * activeTeeth);

    // 5. Fuerza Radial (Fr) - Genera la flexión transversal de la herramienta
    // Típicamente Fr ≈ 0.35 * Fc en carburo con desahogo normal
    const fr = Math.round(fc * 0.38);

    // 6. Potencia de Corte Neta (kW): Pc = (Fc * vc) / (60000)
    const powerKw = Math.max(0.1, Number(((fc * vc) / 60000).toFixed(2)));

    // 7. Par de torsión (Nm): Mc = (Fc * (d / 2)) / 1000
    const torqueNm = Number(((fc * (toolDiameter / 2)) / 1000).toFixed(2));

    // 8. Tasa de Remoción de Viruta (MRR en cm³/min): (ap * ae * vf) / 1000
    const mrr = Number(((ap * ae * vf) / 1000).toFixed(1));

    // 9. Cálculo Elástico de Deflexión de la Herramienta (Viga Cantilever)
    // I = (pi * d^4) / 64 (Momento de Inercia mm^4)
    const inertia = (Math.PI * Math.pow(toolDiameter, 4)) / 64;

    // y = (Fr * L^3) / (3 * E * I) en milímetros
    // Modulado por el factor de rigidez del portaherramientas (holder.stiffnessFactor)
    const rawDeflectionMm = (fr * Math.pow(stickout, 3)) / (3 * this.youngModulusCarbide * inertia * holder.stiffnessFactor);
    
    // Convertir a micras (µm)
    const deflectionMicrons = Number((rawDeflectionMm * 1000).toFixed(2));

    // 10. Evaluación de estabilidad y Chatter
    let stabilityStatus = 'ESTABLE';
    let stressLevel = 'LOW'; // LOW, MEDIUM, CRITICAL
    let stressRatio = deflectionMicrons / 20.0; // Umbral de alerta ~20µm

    if (deflectionMicrons > 25.0 || (holderKey === 'er' && deflectionMicrons > 15.0)) {
      stabilityStatus = 'CHATTER CRÍTICO';
      stressLevel = 'CRITICAL';
    } else if (deflectionMicrons > 10.0) {
      stabilityStatus = 'VIBRACIÓN MODERADA';
      stressLevel = 'MEDIUM';
    }

    return {
      materialName: mat.name,
      holderName: holder.name,
      rpm,
      vf,
      kc: Math.round(kc),
      fc,
      fr,
      powerKw,
      torqueNm,
      mrr,
      deflectionMicrons,
      stressRatio: Math.min(2.5, stressRatio),
      stabilityStatus,
      stressLevel,
      dampingRatio: holder.dampingRatio
    };
  }
}

window.machiningEngine = new MachiningEngine();
