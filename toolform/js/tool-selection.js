<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Selección de herramienta — AlexRaSa</title>
  <meta name="description" content="Herramienta para seleccionar geometría y condiciones de corte — AlexRaSa." />
  <meta name="color-scheme" content="dark" />

  <link rel="preconnect" href="https://cdn.tailwindcss.com" crossorigin>
  <script src="https://cdn.tailwindcss.com"></script>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>

  <style>
    :root{
      --bg:#0b1220; --card:#0f172a; --ink:#e5eefb; --muted:#9fb3c8; --border:#1f2a3a;
      --accent:#0ea5e9; --rose:#e11d48; --emerald:#10b981; --indigo:#6366f1;
    }
    html{scroll-behavior:smooth}
    body{background:var(--bg);color:var(--ink);font-family:system-ui, -apple-system, "Segoe UI", Roboto, Ubuntu;}
    .container{max-width:1180px}
    .card{background:var(--card);border:1px solid var(--border);border-radius:12px}
    .lead{color:var(--muted)}
    .btn{border:1px solid var(--border);background:rgba(255,255,255,.04);padding:.5rem .8rem;border-radius:8px}
    .dark-card{background:var(--card);border:1px solid var(--border);padding:16px;border-radius:8px}
    .muted{color:var(--muted)}
    .result-card{ /* estilos mínimos, tu styles.css ya define más */ padding:12px; border-radius:8px; background:linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01)); border:1px solid rgba(255,255,255,0.03); }
  </style>

  <!-- OG / Twitter hero (igual que en la calculadora) -->
  <meta property="og:image" content="/assets/hero-industrial.png" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:image" content="/assets/hero-industrial.png" />
  <link rel="preload" as="image" href="/assets/hero-industrial.png" />
</head>
<body>
  <!-- ===== HEADER (copiado del otro archivo para consistencia) ===== -->
<header id="siteHeader" class="sticky top-0 z-50 bg-white/90 backdrop-blur supports-[backdrop-filter]:bg-white/60 border-b border-gray-200">
  <div class="max-w-6xl mx-auto px-4">
    <div class="h-16 flex items-center justify-between gap-3">
      <a href="/" class="flex items-center gap-2 shrink-0" aria-label="Ir al inicio">
        <img src="/assets/logo.png" alt="Logo AlexRaSa" class="h-10 w-auto" width="160" height="40" />
        <span class="hidden sm:inline text-base font-semibold tracking-tight">AlexRaSa<span class="text-blue-600">.store</span></span>
      </a>
      <nav class="hidden lg:flex items-center gap-6 text-sm">
        <a href="/" class="hover:text-blue-600">Inicio</a>
        <a href="/#soluciones/" class="hover:text-blue-600">Soluciones</a>
        <a href="/#servicios" class="hover:text-blue-600">Servicios</a>
        <a href="/#recursos" class="hover:text-blue-600">Recursos</a>
        <a href="/#contacto" class="hover:text-blue-600">Contacto</a>
      </nav>
      <button id="mobileOpenBtn" class="lg:hidden p-2 rounded hover:bg-gray-100" aria-label="Abrir menú">
        <svg class="h-6 w-6" viewBox="0 0 24 24" stroke="currentColor" fill="none"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>
      </button>
    </div>
  </div>
</header>
  <!-- ===== END HEADER ===== -->

  <main class="max-w-5xl mx-auto p-6">
    <div id="tool-selection-root" class="dark-card">
      <h2 class="text-lg font-semibold mb-3">Selección de herramienta — AlexRaSa</h2>

      <form id="toolForm" autocomplete="off">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label class="text-xs muted">Máquina *</label>
            <select id="machineType" class="w-full mt-1 p-2 rounded bg-slate-800" required>
              <option value="vmc">VMC</option><option value="hmc">HMC</option><option value="lathe">Torno</option>
              <option value="turn-mill">Turn-Mill</option><option value="router">Router</option><option value="5axis">5-ejes</option><option value="drill">Taladro</option>
            </select>
          </div>

          <div>
            <label class="text-xs muted">Unidades</label>
            <select id="units" class="w-full mt-1 p-2 rounded bg-slate-800">
              <option value="metric" selected>Métrico (mm)</option><option value="imperial">Imperial (in)</option>
            </select>
          </div>

          <div>
            <label class="text-xs muted">Material pieza *</label>
            <select id="workMaterial" class="w-full mt-1 p-2 rounded bg-slate-800" required>
              <option value="al">Aluminio</option><option value="st">Acero</option><option value="ss">Inoxidable</option>
              <option value="ti">Titanio</option><option value="ci">Fundición</option><option value="pl">Plástico</option><option value="cm">Composite</option><option value="other">Otro</option>
            </select>
          </div>

          <div>
            <label class="text-xs muted">Operación *</label>
            <select id="operation" class="w-full mt-1 p-2 rounded bg-slate-800" required>
              <option value="face">Fresado frontal</option><option value="contour">Fresado contorno</option><option value="pocket">Bolsillo</option>
              <option value="slot">Ranura</option><option value="drill">Taladrado</option><option value="turning">Torneado</option><option value="thread">Roscar</option><option value="five">5-ejes</option>
            </select>
          </div>

          <div>
            <label class="text-xs muted">Tipo herramienta *</label>
            <select id="toolType" class="w-full mt-1 p-2 rounded bg-slate-800" required></select>
          </div>

          <div>
            <label class="text-xs muted">Material herramienta *</label>
            <select id="toolMaterial" class="w-full mt-1 p-2 rounded bg-slate-800" required></select>
          </div>

          <div>
            <label class="text-xs muted">Recubrimiento</label>
            <select id="coating" class="w-full mt-1 p-2 rounded bg-slate-800">
              <option value="none">Ninguno</option><option>TiN</option><option>TiAlN</option><option>AlTiN</option><option>DLC</option><option>PCD</option><option>Otro</option>
            </select>
          </div>

          <div>
            <label class="text-xs muted">Diámetro (D) *</label>
            <input id="diameter" type="number" min="0.01" step="0.01" class="w-full mt-1 p-2 rounded bg-slate-800" placeholder="mm">
          </div>

          <div>
            <label class="text-xs muted"># Faltas / Cortes (z)</label>
            <input id="flutes" type="number" min="1" max="12" value="4" class="w-full mt-1 p-2 rounded bg-slate-800">
          </div>

          <div>
            <label class="text-xs muted">Profundidad axial (ap)</label>
            <input id="ap" type="number" step="0.01" class="w-full mt-1 p-2 rounded bg-slate-800" placeholder="mm">
          </div>

          <div>
            <label class="text-xs muted">Ingreso radial (ae)</label>
            <input id="ae" type="text" class="w-full mt-1 p-2 rounded bg-slate-800" placeholder="mm o %D">
          </div>

          <div>
            <label class="text-xs muted">Stickout (porte)</label>
            <input id="stickout" type="number" step="0.1" class="w-full mt-1 p-2 rounded bg-slate-800" placeholder="mm">
          </div>

          <div>
            <label class="text-xs muted">Refrigeración</label>
            <select id="cooling" class="w-full mt-1 p-2 rounded bg-slate-800">
              <option>Soluble</option><option>MQL</option><option>Seco</option><option>Nebulizado</option><option>Aire</option>
            </select>
          </div>

          <div>
            <label class="text-xs muted">Prioridad</label>
            <select id="priority" class="w-full mt-1 p-2 rounded bg-slate-800">
              <option value="cycle">Min tiempo de ciclo</option><option value="toollife">Max vida de herramienta</option><option value="balance" selected>Balance</option>
            </select>
          </div>

          <div class="col-span-1 md:col-span-2" id="opExtra"></div>

          <div>
            <label class="text-xs muted">Longitud de corte (mm)</label>
            <input id="cutLength" type="number" min="1" step="1" class="w-full mt-1 p-2 rounded bg-slate-800" placeholder="ej. 120">
          </div>

          <div class="col-span-1 md:col-span-2">
            <label class="text-xs muted">Notas / Restricciones</label>
            <textarea id="notes" class="w-full mt-1 p-2 rounded bg-slate-800" rows="3"></textarea>
          </div>
        </div>

        <div class="flex gap-2 mt-4 items-center">
          <button id="calcBtn" type="button" class="px-4 py-2 bg-indigo-600 rounded">Calcular y Recomendar</button>
          <button id="exportBtn" type="button" class="px-4 py-2 bg-emerald-600 rounded">Exportar JSON</button>
          <button id="pdfBtn" type="button" class="px-4 py-2 bg-sky-600 rounded">Exportar PDF</button>
          <button id="printAllBtn" type="button" class="px-4 py-2 bg-gray-600 rounded text-sm ml-2">Imprimir todo</button>
        </div>

        <!-- Resultado en tarjetas -->
        <div id="resultsCards" class="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4"></div>

        <!-- JSON para debug / export si lo quieres ver -->
        <pre id="jsonOut" class="mt-3 p-3 bg-slate-800 rounded text-xs overflow-auto" style="max-height:220px"></pre>

      </form>
    </div>
  </main>

  <footer class="max-w-6xl mx-auto p-6 muted text-sm">© AlexRaSa — Ingeniería y soluciones para manufactura</footer>

  <!-- Usamos el JS modificado (sin sección proveedores) -->
  <script src="/toolform/js/tool-selection.clean.js" defer></script>
</body>
</html>
