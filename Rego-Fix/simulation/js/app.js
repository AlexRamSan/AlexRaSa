/**
 * REGO-FIX® 3D Visualizer & UI Controller
 */

let scene, camera, renderer, controls;
let toolGroup, toolMesh, holderMesh, workpieceMesh, chipParticles;
let currentResults = {};

// Paleta de esfuerzos
const COLOR_STABLE = new THREE.Color(0x10b981);
const COLOR_MEDIUM = new THREE.Color(0xf59e0b);
const COLOR_CRITICAL = new THREE.Color(0xE30613);

function init3D() {
  const container = document.getElementById('canvas-container');
  const width = container.clientWidth;
  const height = container.clientHeight;

  // Escena
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0c0f14);
  scene.fog = new THREE.FogExp2(0x0c0f14, 0.005);

  // Cámara
  camera = new THREE.PerspectiveCamera(40, width / height, 1, 1000);
  camera.position.set(120, 80, 160);

  // Renderizador
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // Controles
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 10, 0);
  controls.maxPolarAngle = Math.PI / 2 + 0.1; // No bajar del piso

  // Iluminación Técnica Suiza
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.9);
  keyLight.position.set(80, 150, 100);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.width = 1024;
  keyLight.shadow.mapSize.height = 1024;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x38bdf8, 0.4);
  fillLight.position.set(-100, 50, -80);
  scene.add(fillLight);

  const redAccentLight = new THREE.PointLight(0xE30613, 0.7, 120);
  redAccentLight.position.set(0, 50, 30);
  scene.add(redAccentLight);

  // Rejilla de taller
  const gridHelper = new THREE.GridHelper(300, 30, 0x242C38, 0x161B22);
  gridHelper.position.y = -35;
  scene.add(gridHelper);

  // Construir Modelos 3D Procedurales
  buildAssembly();

  // Partículas de viruta
  buildChipParticles();

  // Resize handler
  window.addEventListener('resize', onWindowResize);

  // Loop de render
  animate();
}

function buildAssembly() {
  if (toolGroup) scene.remove(toolGroup);
  toolGroup = new THREE.Group();

  const d = parseFloat(document.getElementById('sel-tool-dia').value) || 12;
  const stickout = parseFloat(document.getElementById('range-stickout').value) || 40;

  // 1. Portaherramientas REGO-FIX PG / Cono
  const holderGeo = new THREE.CylinderGeometry(28, 18, 55, 36);
  const holderMat = new THREE.MeshStandardMaterial({
    color: 0x22262d,
    metalness: 0.85,
    roughness: 0.25
  });
  holderMesh = new THREE.Mesh(holderGeo, holderMat);
  holderMesh.position.y = stickout + 27.5;
  holderMesh.castShadow = true;
  toolGroup.add(holderMesh);

  // Anillo Rojo Corporativo REGO-FIX
  const ringGeo = new THREE.CylinderGeometry(28.2, 28.2, 6, 36);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0xE30613,
    metalness: 0.3,
    roughness: 0.3,
    emissive: 0x330000
  });
  const redRing = new THREE.Mesh(ringGeo, ringMat);
  redRing.position.y = stickout + 35;
  toolGroup.add(redRing);

  // Tuerca / Nariz de sujeción PG
  const noseGeo = new THREE.CylinderGeometry(18, 12, 16, 36);
  const noseMesh = new THREE.Mesh(noseGeo, holderMat);
  noseMesh.position.y = stickout + 8;
  toolGroup.add(noseMesh);

  // 2. Herramienta de Carburo (Con múltiples segmentos para permitir flexión)
  const segmentsY = 32;
  const toolGeo = new THREE.CylinderGeometry(d / 2, d / 2, stickout, 32, segmentsY);
  
  // Guardamos las posiciones originales para el cálculo de deflexión
  toolGeo.userData = { originalPositions: toolGeo.attributes.position.clone() };

  const toolMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.8,
    roughness: 0.2,
    vertexColors: false
  });
  toolMesh = new THREE.Mesh(toolGeo, toolMat);
  toolMesh.position.y = stickout / 2;
  toolMesh.castShadow = true;
  toolGroup.add(toolMesh);

  // 3. Bloque de Material (Workpiece)
  const wpGeo = new THREE.BoxGeometry(70, 45, 70);
  const wpMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    metalness: 0.6,
    roughness: 0.5
  });
  workpieceMesh = new THREE.Mesh(wpGeo, wpMat);
  // Posicionar contra la herramienta tangencialmente
  workpieceMesh.position.set(d/2 + 35 - 3, -15, 0);
  workpieceMesh.receiveShadow = true;
  toolGroup.add(workpieceMesh);

  scene.add(toolGroup);
}

function buildChipParticles() {
  const particleCount = 45;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const velocities = [];

  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 4;
    positions[i * 3 + 1] = Math.random() * 5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 4;

    velocities.push({
      vx: (Math.random() - 0.8) * 0.8,
      vy: Math.random() * 0.9 + 0.3,
      vz: (Math.random() - 0.5) * 0.8
    });
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0xf59e0b,
    size: 2.2,
    transparent: true,
    opacity: 0.8
  });

  chipParticles = new THREE.Points(geometry, material);
  chipParticles.userData = { velocities };
  scene.add(chipParticles);
}

function updateDeflectionVisuals(deflectionMicrons, stressRatio) {
  if (!toolMesh) return;

  const geo = toolMesh.geometry;
  const originalPos = geo.userData.originalPositions;
  const pos = geo.attributes.position;
  const stickout = parseFloat(document.getElementById('range-stickout').value) || 40;

  // Escalar la deflexión para que sea claramente visible en 3D
  // 1 µm real -> ~0.15 unidades Three.js (factor de amplificación visual)
  const visualScale = 0.22;
  const maxDisplacement = (deflectionMicrons * visualScale);

  for (let i = 0; i < pos.count; i++) {
    const origY = originalPos.getY(i);
    const origX = originalPos.getX(i);
    const origZ = originalPos.getZ(i);

    // Altura relativa desde la nariz (0 = nariz, 1 = punta libre)
    // El cilindro está centrado en stickout/2
    const normalizedY = 1.0 - ((origY + stickout / 2) / stickout);
    
    // Deformación cúbica de viga cantilever: v(x) ∝ (3x^2 - x^3)
    const curveFactor = Math.pow(Math.max(0, normalizedY), 2.2);

    // Flexión principalmente en eje -X (empuje radial opuesto al material)
    pos.setX(i, origX - (maxDisplacement * curveFactor));
    pos.setY(i, origY);
    pos.setZ(i, origZ);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  // Color de estrés térmico/mecánico dinámico
  let targetColor;
  if (stressRatio < 0.6) {
    targetColor = COLOR_STABLE;
  } else if (stressRatio < 1.1) {
    targetColor = COLOR_MEDIUM;
  } else {
    targetColor = COLOR_CRITICAL;
  }
  toolMesh.material.color.lerp(targetColor, 0.15);
}

let clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  const time = clock.getElapsedTime();

  // Vibración y Chatter en tiempo real según nivel de esfuerzo
  if (toolGroup && currentResults.deflectionMicrons) {
    const isChatter = currentResults.stressLevel === 'CRITICAL';
    const vibrationAmp = isChatter ? 0.35 : 0.05;
    const frequency = isChatter ? 50 : 20;

    toolGroup.position.x = Math.sin(time * frequency) * vibrationAmp;
    toolGroup.position.z = Math.cos(time * frequency * 0.8) * (vibrationAmp * 0.6);
  }

  // Animación de partículas de viruta cuando gira
  if (chipParticles && chipParticles.geometry) {
    const pos = chipParticles.geometry.attributes.position;
    const vels = chipParticles.userData.velocities;

    for (let i = 0; i < pos.count; i++) {
      pos.array[i * 3] += vels[i].vx;
      pos.array[i * 3 + 1] += vels[i].vy;
      pos.array[i * 3 + 2] += vels[i].vz;

      // Reset partícula cuando sube
      if (pos.array[i * 3 + 1] > 25 || Math.abs(pos.array[i * 3]) > 25) {
        pos.array[i * 3] = (Math.random() - 0.5) * 2;
        pos.array[i * 3 + 1] = 0;
        pos.array[i * 3 + 2] = (Math.random() - 0.5) * 2;
      }
    }
    pos.needsUpdate = true;
  }

  controls.update();
  renderer.render(scene, camera);
}

function onWindowResize() {
  const container = document.getElementById('canvas-container');
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

// ----------------- UI SYNC & CONTROLS -----------------

function updateSimulation() {
  const materialKey = document.getElementById('sel-material').value;
  const toolDia = parseFloat(document.getElementById('sel-tool-dia').value);
  const stickout = parseFloat(document.getElementById('range-stickout').value);
  const ap = parseFloat(document.getElementById('range-ap').value);
  const ae = parseFloat(document.getElementById('range-ae').value);
  const fz = parseFloat(document.getElementById('range-fz').value);
  const vc = parseFloat(document.getElementById('range-vc').value);

  // Holder actual
  const holderKey = document.getElementById('btn-system-pg').classList.contains('border-rego-red') ? 'pg' : 'er';

  // Actualizar labels
  document.getElementById('val-stickout').innerText = `${stickout} mm`;
  document.getElementById('val-ap').innerText = `${ap.toFixed(1)} mm`;
  document.getElementById('val-ae').innerText = `${ae.toFixed(1)} mm`;
  document.getElementById('val-fz').innerText = `${fz.toFixed(2)} mm/z`;
  document.getElementById('val-vc').innerText = `${vc} m/min`;

  // Ejecutar cálculo Kienzle & Deflexión
  currentResults = window.machiningEngine.calculate({
    materialKey,
    holderKey,
    toolDiameter: toolDia,
    flutes: toolDia <= 10 ? 3 : (toolDia <= 12 ? 4 : 5),
    stickout,
    ap,
    ae,
    fz,
    vc
  });

  // Reflejar resultados en UI
  document.getElementById('res-fc').innerText = currentResults.fc;
  document.getElementById('res-fr').innerText = currentResults.fr;
  document.getElementById('res-kc').innerText = `kc: ${currentResults.kc} N/mm²`;
  document.getElementById('res-power').innerText = currentResults.powerKw;
  document.getElementById('res-torque').innerText = `Par: ${currentResults.torqueNm} Nm`;
  document.getElementById('res-mrr').innerText = currentResults.mrr;
  document.getElementById('res-rpm').innerText = `RPM: ${currentResults.rpm} min⁻¹`;

  // HUD 3D
  const hudDeflection = document.getElementById('hud-deflection');
  hudDeflection.innerText = currentResults.deflectionMicrons.toFixed(1);

  const hudStatus = document.getElementById('hud-status');
  const hudVibration = document.getElementById('hud-vibration');

  if (currentResults.stressLevel === 'CRITICAL') {
    hudStatus.className = 'text-sm font-mono font-bold text-rego-red flex items-center gap-1.5 mt-0.5';
    hudStatus.innerHTML = '<span class="w-2 h-2 rounded-full bg-rego-red animate-ping"></span> CHATTER / CRÍTICO';
    hudVibration.innerHTML = 'Vibración: <span class="text-rego-red font-bold">ALTA (Resonancia Armónica)</span>';
  } else if (currentResults.stressLevel === 'MEDIUM') {
    hudStatus.className = 'text-sm font-mono font-bold text-amber-400 flex items-center gap-1.5 mt-0.5';
    hudStatus.innerHTML = '<span class="w-2 h-2 rounded-full bg-amber-400"></span> CARGA MEDIA';
    hudVibration.innerHTML = 'Vibración: <span class="text-amber-400">Moderada</span>';
  } else {
    hudStatus.className = 'text-sm font-mono font-bold text-emerald-400 flex items-center gap-1.5 mt-0.5';
    hudStatus.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400"></span> ESTABLE';
    hudVibration.innerHTML = 'Vibración: <span class="text-slate-200">Mínima (Amortiguada)</span>';
  }

  // Alabeo comparativo
  const runoutDiff = document.getElementById('hud-runout-diff');
  if (holderKey === 'pg') {
    runoutDiff.innerHTML = 'Alabeo Dinámico: <span class="text-emerald-400">&le; 3 &micro;m TIR</span>';
  } else {
    runoutDiff.innerHTML = 'Alabeo Dinámico: <span class="text-amber-400">&asymp; 9 &micro;m TIR</span>';
  }

  // Texto ventaja comercial
  const advText = document.getElementById('advantage-text');
  if (holderKey === 'pg') {
    advText.innerHTML = 'Gracias a la inserción cónica de alta presión y concentricidad <strong>&lt; 3 &micro;m TIR</strong>, la deflexión dinámica se reduce en hasta un <strong>42%</strong> respecto a boquillas ER, amortiguando armónicos de vibración (*chatter*).';
  } else {
    advText.innerHTML = 'Al usar boquillas estándar ER, la menor rigidez transversal y un runout típico de 8-10 &micro;m multiplican la deflexión en la punta, acortando la vida de la herramienta y provocando rugosidades.';
  }

  // Actualizar Deformación en Malla 3D
  updateDeflectionVisuals(currentResults.deflectionMicrons, currentResults.stressRatio);
}

// Setup Event Listeners
document.addEventListener('DOMContentLoaded', () => {
  init3D();

  // Inputs reactivos
  ['range-stickout', 'range-ap', 'range-ae', 'range-fz', 'range-vc'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateSimulation);
  });

  document.getElementById('sel-material').addEventListener('change', updateSimulation);
  
  document.getElementById('sel-tool-dia').addEventListener('change', () => {
    buildAssembly();
    updateSimulation();
  });

  document.getElementById('range-stickout').addEventListener('change', () => {
    buildAssembly();
    updateSimulation();
  });

  // Switch de Sistemas powRgrip vs ER
  const btnPg = document.getElementById('btn-system-pg');
  const btnEr = document.getElementById('btn-system-er');
  const badgeLabel = document.getElementById('holder-active-label');

  btnPg.addEventListener('click', () => {
    btnPg.className = 'py-2 px-3 rounded text-xs font-bold font-mono transition border text-white bg-rego-red/20 border-rego-red text-center flex flex-col items-center justify-center';
    btnEr.className = 'py-2 px-3 rounded text-xs font-medium font-mono transition border border-rego-border bg-rego-dark/60 text-slate-400 hover:text-slate-200 text-center flex flex-col items-center justify-center';
    badgeLabel.innerText = 'powRgrip® PG25';
    updateSimulation();
  });

  btnEr.addEventListener('click', () => {
    btnEr.className = 'py-2 px-3 rounded text-xs font-bold font-mono transition border text-white bg-amber-500/20 border-amber-500 text-center flex flex-col items-center justify-center';
    btnPg.className = 'py-2 px-3 rounded text-xs font-medium font-mono transition border border-rego-border bg-rego-dark/60 text-slate-400 hover:text-slate-200 text-center flex flex-col items-center justify-center';
    badgeLabel.innerText = 'ER Standard Collet';
    updateSimulation();
  });

  // Reset view
  document.getElementById('btn-reset-view').addEventListener('click', () => {
    controls.reset();
    camera.position.set(120, 80, 160);
  });

  // Primer cálculo
  updateSimulation();
});
