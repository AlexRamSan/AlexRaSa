/**
 * REGO-FIX® Visualizer (WebGL 3D con Fallback automático a Canvas 2D)
 * Paleta corporativa: REGO-FIX Blue (#004B87 / #0072CE), Swiss Green (#00A651)
 */

let scene, camera, renderer, controls;
let toolGroup, toolMesh, holderMesh, workpieceMesh, chipParticles;
let currentResults = {};
let useCanvasFallback = false;
let fallbackCanvas, fallbackCtx;

const COLOR_STABLE = new THREE.Color(0x00A651);  // Verde REGO-FIX
const COLOR_OPTIMAL = new THREE.Color(0x0072CE); // Azul powRgrip
const COLOR_WARNING = new THREE.Color(0xf59e0b); // Carga media
const COLOR_CRITICAL = new THREE.Color(0xd97706); // Chatter alto

function checkWebGLSupport() {
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
  } catch (e) {
    return false;
  }
}

function initVisualizer() {
  const container = document.getElementById('canvas-container');
  const width = container.clientWidth || window.innerWidth;
  const height = container.clientHeight || window.innerHeight;

  if (checkWebGLSupport()) {
    try {
      initThreeJS(container, width, height);
      const badge = document.getElementById('render-mode-badge');
      if (badge) badge.innerText = '3D WebGL Mode';
      return;
    } catch (err) {
      console.warn('WebGL init falló, activando Fallback Canvas 2D:', err);
    }
  }

  // Fallback 2D de alta velocidad
  initCanvas2DFallback(container);
  const badge = document.getElementById('render-mode-badge');
  if (badge) badge.innerText = '2D Precision Mode';
}

function initThreeJS(container, width, height) {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070D16);
  scene.fog = new THREE.FogExp2(0x070D16, 0.005);

  camera = new THREE.PerspectiveCamera(40, width / height, 1, 1000);
  camera.position.set(110, 75, 150);

  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'default' });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.target.set(0, 10, 0);
  controls.maxPolarAngle = Math.PI / 2 + 0.1;

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
  scene.add(ambientLight);

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.85);
  keyLight.position.set(70, 140, 90);
  scene.add(keyLight);

  const blueRim = new THREE.DirectionalLight(0x0072CE, 0.9);
  blueRim.position.set(-100, 60, -80);
  scene.add(blueRim);

  const greenSpot = new THREE.PointLight(0x00A651, 0.5, 130);
  greenSpot.position.set(0, 30, 40);
  scene.add(greenSpot);

  const gridHelper = new THREE.GridHelper(300, 30, 0x203049, 0x131E30);
  gridHelper.position.y = -35;
  scene.add(gridHelper);

  build3DAssembly();
  buildChipParticles();

  window.addEventListener('resize', onWindowResize);
  animateThree();
}

function build3DAssembly() {
  if (toolGroup) scene.remove(toolGroup);
  toolGroup = new THREE.Group();

  const d = parseFloat(document.getElementById('sel-tool-dia').value) || 12;
  const stickout = parseFloat(document.getElementById('range-stickout').value) || 40;

  // Cono portaherramientas
  const holderGeo = new THREE.CylinderGeometry(28, 18, 55, 36);
  const holderMat = new THREE.MeshStandardMaterial({
    color: 0x1E2D44,
    metalness: 0.85,
    roughness: 0.25
  });
  holderMesh = new THREE.Mesh(holderGeo, holderMat);
  holderMesh.position.y = stickout + 27.5;
  toolGroup.add(holderMesh);

  // Anillo Azul REGO-FIX
  const ringGeo = new THREE.CylinderGeometry(28.2, 28.2, 7, 36);
  const ringMat = new THREE.MeshStandardMaterial({
    color: 0x004B87,
    metalness: 0.4,
    roughness: 0.25,
    emissive: 0x002244
  });
  const blueRing = new THREE.Mesh(ringGeo, ringMat);
  blueRing.position.y = stickout + 35;
  toolGroup.add(blueRing);

  // Nariz powRgrip
  const noseGeo = new THREE.CylinderGeometry(18, 12, 16, 36);
  const noseMesh = new THREE.Mesh(noseGeo, holderMat);
  noseMesh.position.y = stickout + 8;
  toolGroup.add(noseMesh);

  // Herramienta de corte deformable
  const segmentsY = 32;
  const toolGeo = new THREE.CylinderGeometry(d / 2, d / 2, stickout, 32, segmentsY);
  toolGeo.userData = { originalPositions: toolGeo.attributes.position.clone() };

  const toolMat = new THREE.MeshStandardMaterial({
    color: 0x8FA4BC,
    metalness: 0.75,
    roughness: 0.25
  });
  toolMesh = new THREE.Mesh(toolGeo, toolMat);
  toolMesh.position.y = stickout / 2;
  toolGroup.add(toolMesh);

  // Pieza de trabajo
  const wpGeo = new THREE.BoxGeometry(70, 45, 70);
  const wpMat = new THREE.MeshStandardMaterial({
    color: 0x223247,
    metalness: 0.5,
    roughness: 0.5
  });
  workpieceMesh = new THREE.Mesh(wpGeo, wpMat);
  workpieceMesh.position.set(d/2 + 35 - 3, -15, 0);
  toolGroup.add(workpieceMesh);

  scene.add(toolGroup);
}

function buildChipParticles() {
  const particleCount = 40;
  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const velocities = [];

  for (let i = 0; i < particleCount; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 4;
    positions[i * 3 + 1] = Math.random() * 5;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 4;

    velocities.push({
      vx: (Math.random() - 0.8) * 0.7,
      vy: Math.random() * 0.8 + 0.3,
      vz: (Math.random() - 0.5) * 0.7
    });
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({
    color: 0x00A651,
    size: 2.2,
    transparent: true,
    opacity: 0.85
  });

  chipParticles = new THREE.Points(geometry, material);
  chipParticles.userData = { velocities };
  scene.add(chipParticles);
}

function updateDeflectionVisuals(deflectionMicrons, stressRatio) {
  if (useCanvasFallback) {
    drawCanvasFallback();
    return;
  }
  if (!toolMesh) return;

  const geo = toolMesh.geometry;
  const originalPos = geo.userData.originalPositions;
  const pos = geo.attributes.position;
  const stickout = parseFloat(document.getElementById('range-stickout').value) || 40;

  const visualScale = 0.22;
  const maxDisplacement = deflectionMicrons * visualScale;

  for (let i = 0; i < pos.count; i++) {
    const origY = originalPos.getY(i);
    const origX = originalPos.getX(i);
    const origZ = originalPos.getZ(i);

    const normalizedY = 1.0 - ((origY + stickout / 2) / stickout);
    const curveFactor = Math.pow(Math.max(0, normalizedY), 2.2);

    pos.setX(i, origX - (maxDisplacement * curveFactor));
    pos.setY(i, origY);
    pos.setZ(i, origZ);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();

  let targetColor = COLOR_STABLE;
  if (stressRatio > 1.1) {
    targetColor = COLOR_CRITICAL;
  } else if (stressRatio > 0.6) {
    targetColor = COLOR_OPTIMAL;
  }
  toolMesh.material.color.lerp(targetColor, 0.15);
}

let clock = new THREE.Clock();
function animateThree() {
  requestAnimationFrame(animateThree);
  const delta = clock.getDelta();
  const time = clock.getElapsedTime();

  if (toolGroup && currentResults.deflectionMicrons) {
    const isChatter = currentResults.stressLevel === 'CRITICAL';
    const vibrationAmp = isChatter ? 0.35 : 0.05;
    const frequency = isChatter ? 45 : 18;

    toolGroup.position.x = Math.sin(time * frequency) * vibrationAmp;
    toolGroup.position.z = Math.cos(time * frequency * 0.8) * (vibrationAmp * 0.5);
  }

  if (chipParticles && chipParticles.geometry) {
    const pos = chipParticles.geometry.attributes.position;
    const vels = chipParticles.userData.velocities;
    for (let i = 0; i < pos.count; i++) {
      pos.array[i * 3] += vels[i].vx;
      pos.array[i * 3 + 1] += vels[i].vy;
      pos.array[i * 3 + 2] += vels[i].vz;
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
  if (useCanvasFallback && fallbackCanvas) {
    fallbackCanvas.width = container.clientWidth;
    fallbackCanvas.height = container.clientHeight;
    drawCanvasFallback();
    return;
  }
  if (camera && renderer) {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  }
}

// Fallback 2D Canvas
function initCanvas2DFallback(container) {
  useCanvasFallback = true;
  container.innerHTML = '';
  fallbackCanvas = document.createElement('canvas');
  fallbackCanvas.width = container.clientWidth || 600;
  fallbackCanvas.height = container.clientHeight || 500;
  container.appendChild(fallbackCanvas);
  fallbackCtx = fallbackCanvas.getContext('2d');
  window.addEventListener('resize', onWindowResize);
  drawCanvasFallback();
}

function drawCanvasFallback() {
  if (!fallbackCtx || !fallbackCanvas) return;
  const ctx = fallbackCtx;
  const w = fallbackCanvas.width;
  const h = fallbackCanvas.height;

  ctx.fillStyle = '#070D16';
  ctx.fillRect(0, 0, w, h);

  // Grid
  ctx.strokeStyle = '#131E30';
  ctx.lineWidth = 1;
  const step = 40;
  for (let x = 0; x < w; x += step) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let y = 0; y < h; y += step) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  const cx = w * 0.45;
  const topY = 90;
  const stickout = parseFloat(document.getElementById('range-stickout').value) || 40;
  const toolDia = parseFloat(document.getElementById('sel-tool-dia').value) || 12;
  const defl = currentResults.deflectionMicrons || 0;

  // Cono Portaherramientas
  ctx.fillStyle = '#1E2D44';
  ctx.beginPath();
  ctx.moveTo(cx - 50, topY);
  ctx.lineTo(cx + 50, topY);
  ctx.lineTo(cx + 30, topY + 70);
  ctx.lineTo(cx - 30, topY + 70);
  ctx.closePath();
  ctx.fill();

  // Anillo Azul REGO-FIX
  ctx.fillStyle = '#004B87';
  ctx.fillRect(cx - 48, topY + 25, 96, 16);
  ctx.fillStyle = '#00A651';
  ctx.fillRect(cx - 48, topY + 39, 96, 3);

  // Nariz powRgrip
  ctx.fillStyle = '#131E30';
  ctx.fillRect(cx - 28, topY + 70, 56, 25);

  // Herramienta de Carburo con flexión exagerada didáctica
  const toolHeight = stickout * 3.2;
  const toolWidth = toolDia * 2.2;
  const maxDisplace = defl * 2.8;

  const color = (currentResults.stressLevel === 'CRITICAL') ? '#d97706' : (defl > 10 ? '#0072CE' : '#00A651');

  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - toolWidth/2, topY + 95);
  ctx.lineTo(cx + toolWidth/2, topY + 95);

  ctx.quadraticCurveTo(
    cx + toolWidth/2 - (maxDisplace * 0.3),
    topY + 95 + toolHeight * 0.6,
    cx + toolWidth/2 - maxDisplace,
    topY + 95 + toolHeight
  );
  ctx.lineTo(cx - toolWidth/2 - maxDisplace, topY + 95 + toolHeight);
  ctx.quadraticCurveTo(
    cx - toolWidth/2 - (maxDisplace * 0.3),
    topY + 95 + toolHeight * 0.6,
    cx - toolWidth/2,
    topY + 95
  );
  ctx.closePath();
  ctx.fill();

  // Pieza de Material
  ctx.fillStyle = '#223247';
  ctx.fillRect(cx + toolWidth/2 + 2, topY + 95 + toolHeight - 65, 120, 90);
  ctx.fillStyle = '#7F93AC';
  ctx.font = '10px JetBrains Mono';
  ctx.fillText('PIEZA', cx + toolWidth/2 + 10, topY + 95 + toolHeight - 20);

  // Flecha de fuerza radial Fr
  ctx.strokeStyle = '#0072CE';
  ctx.lineWidth = 3;
  ctx.beginPath();
  const arrowY = topY + 95 + toolHeight - 15;
  ctx.moveTo(cx + toolWidth/2 + 30, arrowY);
  ctx.lineTo(cx + toolWidth/2 + 5, arrowY);
  ctx.stroke();

  ctx.fillStyle = '#0072CE';
  ctx.fillText('Fr', cx + toolWidth/2 + 35, arrowY + 3);
}

// Sincronización de interfaz
function updateSimulation() {
  const materialKey = document.getElementById('sel-material').value;
  const toolDia = parseFloat(document.getElementById('sel-tool-dia').value);
  const stickout = parseFloat(document.getElementById('range-stickout').value);
  const ap = parseFloat(document.getElementById('range-ap').value);
  const ae = parseFloat(document.getElementById('range-ae').value);
  const fz = parseFloat(document.getElementById('range-fz').value);
  const vc = parseFloat(document.getElementById('range-vc').value);

  const holderKey = document.getElementById('btn-system-pg').classList.contains('border-rego-lightblue') ? 'pg' : 'er';

  document.getElementById('val-stickout').innerText = `${stickout} mm`;
  document.getElementById('val-ap').innerText = `${ap.toFixed(1)} mm`;
  document.getElementById('val-ae').innerText = `${ae.toFixed(1)} mm`;
  document.getElementById('val-fz').innerText = `${fz.toFixed(2)} mm/z`;
  document.getElementById('val-vc').innerText = `${vc} m/min`;

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

  document.getElementById('res-fc').innerText = currentResults.fc;
  document.getElementById('res-fr').innerText = currentResults.fr;
  document.getElementById('res-kc').innerText = `kc: ${currentResults.kc} N/mm²`;
  document.getElementById('res-power').innerText = currentResults.powerKw;
  document.getElementById('res-torque').innerText = `Par: ${currentResults.torqueNm} Nm`;
  document.getElementById('res-mrr').innerText = currentResults.mrr;
  document.getElementById('res-rpm').innerText = `RPM: ${currentResults.rpm} min⁻¹`;

  const hudDeflection = document.getElementById('hud-deflection');
  hudDeflection.innerText = currentResults.deflectionMicrons.toFixed(2);

  const hudStatus = document.getElementById('hud-status');
  const hudVibration = document.getElementById('hud-vibration');

  if (currentResults.stressLevel === 'CRITICAL') {
    hudStatus.className = 'text-sm font-mono font-bold text-amber-500 flex items-center gap-2 mt-1';
    hudStatus.innerHTML = '<span class="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping"></span> CHATTER / CRÍTICO';
    hudVibration.innerHTML = 'Vibración: <span class="text-amber-400 font-bold">ALTA (Resonancia Armónica)</span>';
  } else if (currentResults.stressLevel === 'MEDIUM') {
    hudStatus.className = 'text-sm font-mono font-bold text-sky-400 flex items-center gap-2 mt-1';
    hudStatus.innerHTML = '<span class="w-2.5 h-2.5 rounded-full bg-sky-400"></span> CARGA MEDIA';
    hudVibration.innerHTML = 'Vibración: <span class="text-sky-300">Moderada</span>';
  } else {
    hudStatus.className = 'text-sm font-mono font-bold text-rego-green flex items-center gap-2 mt-1';
    hudStatus.innerHTML = '<span class="w-2.5 h-2.5 rounded-full bg-rego-green"></span> ESTABLE';
    hudVibration.innerHTML = 'Vibración: <span class="text-emerald-400 font-semibold">Mínima (powRgrip Damping)</span>';
  }

  const runoutDiff = document.getElementById('hud-runout-diff');
  if (holderKey === 'pg') {
    runoutDiff.innerHTML = 'Alabeo Dinámico: <span class="text-rego-green font-bold">≤ 3 µm TIR</span>';
  } else {
    runoutDiff.innerHTML = 'Alabeo Dinámico: <span class="text-amber-400 font-bold">≈ 9 µm TIR</span>';
  }

  const advText = document.getElementById('advantage-text');
  if (holderKey === 'pg') {
    advText.innerHTML = 'Gracias al anclaje cónico sin calor y concentricidad garantizada <strong>&lt; 3 µm TIR</strong>, powRgrip absorbe armónicos de vibración multiplicando la vida del carburo y optimizando el acabado superficial.';
  } else {
    advText.innerHTML = 'Al usar boquillas estándar ER, la menor rigidez transversal y un runout típico de 8-10 µm multiplican la deflexión en la punta, acortando la vida de la herramienta y provocando rugosidades.';
  }

  updateDeflectionVisuals(currentResults.deflectionMicrons, currentResults.stressRatio);
}

document.addEventListener('DOMContentLoaded', () => {
  initVisualizer();

  ['range-stickout', 'range-ap', 'range-ae', 'range-fz', 'range-vc'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateSimulation);
  });

  document.getElementById('sel-material').addEventListener('change', updateSimulation);
  
  document.getElementById('sel-tool-dia').addEventListener('change', () => {
    if (!useCanvasFallback) build3DAssembly();
    updateSimulation();
  });

  document.getElementById('range-stickout').addEventListener('change', () => {
    if (!useCanvasFallback) build3DAssembly();
    updateSimulation();
  });

  const btnPg = document.getElementById('btn-system-pg');
  const btnEr = document.getElementById('btn-system-er');
  const badgeLabel = document.getElementById('holder-active-label');

  btnPg.addEventListener('click', () => {
    btnPg.className = 'py-2.5 px-3 rounded text-xs font-bold font-mono transition border text-white bg-rego-blue/30 border-rego-lightblue shadow-[0_0_12px_rgba(0,114,206,0.25)] text-center flex flex-col items-center justify-center';
    btnEr.className = 'py-2.5 px-3 rounded text-xs font-medium font-mono transition border border-rego-border bg-rego-dark/70 text-slate-400 hover:text-slate-200 text-center flex flex-col items-center justify-center';
    badgeLabel.innerText = 'powRgrip® PG25';
    updateSimulation();
  });

  btnEr.addEventListener('click', () => {
    btnEr.className = 'py-2.5 px-3 rounded text-xs font-bold font-mono transition border text-white bg-amber-500/20 border-amber-500 text-center flex flex-col items-center justify-center';
    btnPg.className = 'py-2.5 px-3 rounded text-xs font-medium font-mono transition border border-rego-border bg-rego-dark/70 text-slate-400 hover:text-slate-200 text-center flex flex-col items-center justify-center';
    badgeLabel.innerText = 'ER Standard Collet';
    updateSimulation();
  });

  document.getElementById('btn-reset-view').addEventListener('click', () => {
    if (controls) {
      controls.reset();
      camera.position.set(110, 75, 150);
    }
  });

  updateSimulation();
});
