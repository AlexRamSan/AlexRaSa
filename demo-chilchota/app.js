/* Chilchota Demo — v3
   - Branding + roles con UI habilitada/deshabilitada
   - Pzas por caja (piecesPerBox)
   - Compras/Pedidos: cajas + pzas sueltas => pzas totales
   - Recepción rápida (modal)
   - Barcode scan (modal cámara si soporta BarcodeDetector; fallback manual)
*/

const STORAGE_KEY = "chilchota_demo_v3";

const $ = (sel) => document.querySelector(sel);
const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);
const money = (n) => (Number(n) || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const num = (n) => Number(n || 0);

function todayISO() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}
function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

// ---------- Seed ----------
function seedData() {
  const branchId = "BR-001";
  const warehouseId = "WH-001";

  // Catálogo demo (puedes ajustar nombres, SKUs y barcodes)
  const products = [
    { id: uid(), sku: "CHI-LEC-1L",  name: "Leche Entera 1L", unit: "pza", piecesPerBox: 12, cost: 16.50, price: 24.00, barcode: "750000000001" },
    { id: uid(), sku: "CHI-CRE-250", name: "Crema 250 ml", unit: "pza", piecesPerBox: 12, cost: 22.00, price: 34.00, barcode: "750000000002" },
    { id: uid(), sku: "CHI-JOC-JAR", name: "Jocoque Jarro", unit: "pza", piecesPerBox: 12, cost: 38.00, price: 59.00, barcode: "750000000003" },
    { id: uid(), sku: "CHI-DBC-STD", name: "Doble Crema", unit: "pza", piecesPerBox: 12, cost: 30.00, price: 48.00, barcode: "750000000004" },
    { id: uid(), sku: "CHI-MAN-225", name: "Mantequilla Untable 225g", unit: "pza", piecesPerBox: 12, cost: 24.50, price: 39.00, barcode: "750000000005" },
  ];

  // Inventario inicial
  const stockMoves = [];
  products.forEach((p, i) => {
    stockMoves.push({
      id: uid(),
      ts: new Date().toISOString(),
      date: todayISO(),
      type: "INIT",
      productId: p.id,
      qty: 20 + i * 5, // pzas
      unitCost: p.cost,
      note: "Inventario inicial",
      branchId,
      warehouseId,
      userId: "U-ADMIN",
      ref: null
    });
  });

  // Ventas históricas mini (para reabasto)
  for (let d = 1; d <= 14; d++) {
    const soId = uid();
    const lines = [
      { productId: products[0].id, qtyPieces: (d % 3) + 1 },
      { productId: products[2].id, qtyPieces: (d % 2) }
    ].filter(l => l.qtyPieces > 0);

    lines.forEach(l => {
      stockMoves.push({
        id: uid(),
        ts: new Date().toISOString(),
        date: daysAgoISO(d),
        type: "SALE",
        productId: l.productId,
        qty: -l.qtyPieces,
        unitCost: null,
        note: `Pedido ${String(soId).slice(-6)}`,
        branchId,
        warehouseId,
        userId: "U-VEND",
        ref: soId
      });
    });
  }

  return {
    meta: { createdAt: new Date().toISOString(), version: 3 },
    org: { name: "Chilchota (Demo)" },
    branches: [{ id: branchId, name: "Sucursal 1" }],
    warehouses: [{ id: warehouseId, branchId, name: "Almacén 1" }],
    users: [
      { id: "U-ADMIN", name: "Admin", role: "ADMIN" },
      { id: "U-WH", name: "Warehouse", role: "WAREHOUSE" },
      { id: "U-VEND", name: "Vendedor", role: "SELLER" },
    ],
    currentUserId: "U-ADMIN",
    products,
    stockMoves,
    purchaseOrders: [],
    competitorPrices: [],
    physicalCounts: []
  };
}

function loadDB() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const db = seedData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    return db;
  }
  try { return JSON.parse(raw); }
  catch {
    const db = seedData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    return db;
  }
}
function saveDB(db) { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }

let db = loadDB();

// ---------- Permisos ----------
function getUser() { return db.users.find(u => u.id === db.currentUserId) || db.users[0]; }
function role() { return getUser().role; }

const PERMS = {
  dashboard: ["ADMIN","WAREHOUSE","SELLER"],
  products: ["ADMIN"],
  inventory: ["ADMIN","WAREHOUSE"],
  purchases: ["ADMIN","WAREHOUSE"],
  sales: ["ADMIN","WAREHOUSE","SELLER"],  // demo: el vendedor puede vender; warehouse también puede mover por surtido
  waste: ["ADMIN","WAREHOUSE"],
  benchmark: ["ADMIN","SELLER"],
  reports: ["ADMIN","WAREHOUSE"]
};

function canView(tabId) {
  const allowed = PERMS[tabId] || [];
  return allowed.includes(role());
}
function canAction(action) {
  // Acciones finas (mismo enfoque)
  const rules = {
    MANAGE_PRODUCTS: ["ADMIN"],
    STOCK_MOVES: ["ADMIN","WAREHOUSE"],
    PURCHASES: ["ADMIN","WAREHOUSE"],
    SALES: ["ADMIN","SELLER","WAREHOUSE"],
    WASTE: ["ADMIN","WAREHOUSE"],
    BENCHMARK: ["ADMIN","SELLER"],
    REPORTS: ["ADMIN","WAREHOUSE"]
  };
  return (rules[action] || []).includes(role());
}

// ---------- Productos / Conversiones ----------
function productById(id) { return db.products.find(p => p.id === id); }
function productByBarcode(code) {
  const c = String(code || "").trim();
  if (!c) return null;
  return db.products.find(p => String(p.barcode || "").trim() === c) || null;
}
function ppb(productId) { return Math.max(1, num(productById(productId)?.piecesPerBox || 1)); }
function toPieces(boxes, pieces, productId) { return (num(boxes) * ppb(productId)) + num(pieces); }

// ---------- Stock / Costos ----------
function calcOnHand(branchId, warehouseId) {
  const map = new Map();
  db.stockMoves
    .filter(m => m.branchId === branchId && m.warehouseId === warehouseId)
    .forEach(m => map.set(m.productId, (map.get(m.productId) || 0) + num(m.qty)));
  return map;
}

function calcAvgDailySales(productId, days = 14, branchId="BR-001", warehouseId="WH-001") {
  const fromDate = daysAgoISO(days);
  const moves = db.stockMoves.filter(m =>
    m.type === "SALE" &&
    m.productId === productId &&
    m.branchId === branchId &&
    m.warehouseId === warehouseId &&
    m.date >= fromDate
  );
  const sold = -moves.reduce((acc, m) => acc + num(m.qty), 0);
  return sold / days;
}

function calcWeightedAvgCost(productId, branchId="BR-001", warehouseId="WH-001") {
  const entries = db.stockMoves.filter(m =>
    m.productId === productId &&
    m.branchId === branchId &&
    m.warehouseId === warehouseId &&
    (m.type === "INIT" || m.type === "RECEIVE" || (m.type === "ADJ" && num(m.qty) > 0)) &&
    num(m.qty) > 0 &&
    m.unitCost != null
  );
  const totalQty = entries.reduce((acc, m) => acc + num(m.qty), 0);
  if (totalQty <= 0) return productById(productId)?.cost ?? 0;
  const totalCost = entries.reduce((acc, m) => acc + (num(m.qty) * num(m.unitCost)), 0);
  return totalCost / totalQty;
}

// ---------- Modal helpers ----------
function openModal({ title, bodyHTML, actionsHTML, onMount }) {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div class="modal-title">${title}</div>
        <button class="btn" id="modalClose">Cerrar</button>
      </div>
      <div class="modal-body">${bodyHTML}</div>
      <div class="modal-actions">${actionsHTML || ""}</div>
    </div>
  `;
  document.body.appendChild(backdrop);

  function close() {
    backdrop.remove();
  }
  backdrop.querySelector("#modalClose").onclick = close;
  backdrop.onclick = (e) => { if (e.target === backdrop) close(); };

  if (onMount) onMount({ root: backdrop, close });
  return { close };
}

// Barcode scan modal (cámara si se puede; si no, input manual)
async function openBarcodeScanner({ onCode }) {
  const supported = "BarcodeDetector" in window;
  const hasMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  const modal = openModal({
    title: "Escanear código de barras",
    bodyHTML: `
      <div class="grid cols2">
        <div class="card" style="box-shadow:none; border-radius:16px">
          <div class="muted small">Opción rápida: pega el código</div>
          <div class="row" style="margin-top:10px">
            <div class="field">
              <label>Código</label>
              <input id="manualCode" placeholder="EAN/UPC..." />
            </div>
            <button class="btn primary" id="manualOk">Usar</button>
          </div>
          <div class="muted small" style="margin-top:10px">
            ${supported && hasMedia ? "También puedes usar cámara abajo." : "Tu navegador no soporta escaneo automático. Usa la opción manual."}
          </div>
        </div>

        <div class="card" style="box-shadow:none; border-radius:16px">
          <div class="muted small">Cámara</div>
          <div class="video-box" style="margin-top:10px">
            <video id="video" playsinline muted></video>
          </div>
          <div class="muted small" style="margin-top:10px" id="scanStatus">Esperando permisos...</div>
        </div>
      </div>
    `,
    actionsHTML: `<button class="btn secondary" id="scanStop">Detener</button>`,
    onMount: async ({ root, close }) => {
      const manualOk = root.querySelector("#manualOk");
      const manualCode = root.querySelector("#manualCode");
      manualOk.onclick = () => {
        const code = manualCode.value.trim();
        if (!code) return alert("Ingresa un código.");
        onCode(code);
        close();
      };

      const status = root.querySelector("#scanStatus");
      const stopBtn = root.querySelector("#scanStop");
      const video = root.querySelector("#video");

      let stream = null;
      let interval = null;

      async function stopAll() {
        if (interval) { clearInterval(interval); interval = null; }
        if (stream) {
          stream.getTracks().forEach(t => t.stop());
          stream = null;
        }
        status.textContent = "Detenido.";
      }
      stopBtn.onclick = stopAll;

      if (!(supported && hasMedia)) {
        status.textContent = "Escaneo automático no disponible. Usa el campo manual.";
        return;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        video.srcObject = stream;
        await video.play();
        status.textContent = "Escaneando...";

        const detector = new BarcodeDetector({ formats: ["ean_13","ean_8","upc_a","upc_e","code_128","code_39","qr_code"] });

        interval = setInterval(async () => {
          try {
            const barcodes = await detector.detect(video);
            if (barcodes && barcodes.length) {
              const code = String(barcodes[0].rawValue || "").trim();
              if (code) {
                onCode(code);
                await stopAll();
                close();
              }
            }
          } catch {
            // ignore detect errors
          }
        }, 350);
      } catch (e) {
        status.textContent = "No se pudo acceder a la cámara. Usa el campo manual.";
      }
    }
  });

  return modal;
}

// ---------- UI ----------
const TABS = [
  { id: "dashboard", label: "Dashboard" },
  { id: "products", label: "Productos" },
  { id: "inventory", label: "Inventario" },
  { id: "purchases", label: "Compras" },
  { id: "sales", label: "Pedidos" },
  { id: "waste", label: "Merma" },
  { id: "benchmark", label: "Benchmark" },
  { id: "reports", label: "Reportes" },
];

let currentTab = "dashboard";

function renderTabs() {
  const tabsEl = $("#tabs");
  tabsEl.innerHTML = "";

  TABS.forEach(t => {
    const allowed = canView(t.id);
    const btn = document.createElement("button");
    btn.className = "tab" + (currentTab === t.id ? " active" : "");
    btn.textContent = t.label;
    if (!allowed) {
      btn.disabled = true;
      btn.title = "Sin permiso para este módulo";
    }
    btn.onclick = () => {
      if (!allowed) return;
      currentTab = t.id;
      render();
    };
    tabsEl.appendChild(btn);
  });
}

function renderUserSelect() {
  const sel = $("#userSelect");
  sel.innerHTML = "";
  db.users.forEach(u => {
    const opt = document.createElement("option");
    opt.value = u.id;
    opt.textContent = `${u.name} (${u.role})`;
    if (u.id === db.currentUserId) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.onchange = () => {
    db.currentUserId = sel.value;
    saveDB(db);

    // si el tab actual no se puede ver, regresa a dashboard
    if (!canView(currentTab)) currentTab = "dashboard";
    render();
  };

  $("#resetBtn").onclick = () => {
    if (!confirm("Esto borra los datos de demo en este navegador. ¿Continuar?")) return;
    localStorage.removeItem(STORAGE_KEY);
    db = loadDB();
    currentTab = "dashboard";
    render();
  };
}

function card(title, innerHTML) {
  const el = document.createElement("div");
  el.className = "card";
  el.innerHTML = `
    <div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
      <div style="font-weight:900">${title}</div>
      <div class="muted small">${db.org.name}</div>
    </div>
    <div class="hr"></div>
    ${innerHTML}`;
  return el;
}

function render() {
  renderUserSelect();
  renderTabs();

  const view = $("#view");
  view.innerHTML = "";

  if (!canView(currentTab)) {
    view.appendChild(card("Sin acceso", `
      <div class="muted">Tu rol (${role()}) no tiene permiso para este módulo.</div>
    `));
    return;
  }

  if (currentTab === "dashboard") view.appendChild(viewDashboard());
  if (currentTab === "products") view.appendChild(viewProducts());
  if (currentTab === "inventory") view.appendChild(viewInventory());
  if (currentTab === "purchases") view.appendChild(viewPurchases());
  if (currentTab === "sales") view.appendChild(viewSales());
  if (currentTab === "waste") view.appendChild(viewWaste());
  if (currentTab === "benchmark") view.appendChild(viewBenchmark());
  if (currentTab === "reports") view.appendChild(viewReports());
}

// ---------- Views ----------
function viewDashboard() {
  const branchId = "BR-001";
  const warehouseId = "WH-001";
  const onHand = calcOnHand(branchId, warehouseId);

  const totalSKUs = db.products.length;
  const totalUnits = [...onHand.values()].reduce((a,b)=>a+num(b),0);

  const from30 = daysAgoISO(30);
  const wasteMoves = db.stockMoves.filter(m => m.type === "WASTE" && m.date >= from30);
  const wasteUnits = -wasteMoves.reduce((acc,m)=>acc+num(m.qty),0);

  const from7 = daysAgoISO(7);
  const salesMoves = db.stockMoves.filter(m => m.type === "SALE" && m.date >= from7);
  const soldUnits = -salesMoves.reduce((acc,m)=>acc+num(m.qty),0);

  const risks = db.products.map(p => {
    const avg = calcAvgDailySales(p.id, 14, branchId, warehouseId);
    const daysCover = avg > 0 ? (num(onHand.get(p.id) || 0) / avg) : 999;
    return { p, avg, daysCover, onHand: num(onHand.get(p.id) || 0) };
  }).sort((a,b)=>a.daysCover-b.daysCover).slice(0,5);

  const wrap = document.createElement("div");
  wrap.className = "grid cols3";

  wrap.appendChild(card("KPIs", `
    <div class="grid cols3">
      <div class="kpi"><div class="v">${totalSKUs}</div><div class="k">Productos</div></div>
      <div class="kpi"><div class="v">${totalUnits}</div><div class="k">Pzas en stock (teórico)</div></div>
      <div class="kpi"><div class="v">${soldUnits}</div><div class="k">Pzas vendidas (7 días)</div></div>
    </div>
    <div class="hr"></div>
    <div class="grid cols3">
      <div class="kpi"><div class="v">${wasteUnits}</div><div class="k">Merma (30 días)</div></div>
      <div class="kpi"><div class="v">${getUser().name}</div><div class="k">Sesión</div></div>
      <div class="kpi"><div class="v">${role()}</div><div class="k">Rol</div></div>
    </div>
  `));

  wrap.appendChild(card("Riesgo de quiebre (estimado)", `
    <div class="muted small">Consumo promedio 14 días vs stock teórico.</div>
    <table class="table">
      <thead><tr><th>Producto</th><th>Stock</th><th>Consumo/día</th><th>Días cobertura</th><th>Estado</th></tr></thead>
      <tbody>
        ${risks.map(r => {
          const badge = r.daysCover < 3 ? "bad" : (r.daysCover < 7 ? "warn" : "ok");
          const label = r.daysCover < 3 ? "Crítico" : (r.daysCover < 7 ? "Bajo" : "OK");
          return `<tr>
            <td>${r.p.sku} — ${r.p.name}</td>
            <td>${r.onHand}</td>
            <td>${r.avg.toFixed(2)}</td>
            <td>${r.daysCover === 999 ? "—" : r.daysCover.toFixed(1)}</td>
            <td><span class="badge ${badge}">${label}</span></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `));

  wrap.appendChild(card("Roles (reglas demo)", `
    <ul class="small">
      <li><b>ADMIN:</b> todo.</li>
      <li><b>WAREHOUSE:</b> inventario, compras/recepciones, merma, reportes.</li>
      <li><b>SELLER:</b> pedidos y benchmark. (No puede inventario/compras/merma/reportes)</li>
    </ul>
  `));

  return wrap;
}

function viewProducts() {
  const allowed = canAction("MANAGE_PRODUCTS");
  const el = document.createElement("div");
  el.className = "grid cols2";

  const form = card("Alta de producto", `
    <div class="row">
      <div class="field"><label>SKU</label><input id="p_sku" placeholder="EJ: CHI-..." ${allowed?"":"disabled"} /></div>
      <div class="field"><label>Nombre</label><input id="p_name" placeholder="EJ: Jocoque Jarro" ${allowed?"":"disabled"} /></div>
    </div>
    <div class="row">
      <div class="field">
        <label>Unidad</label>
        <select id="p_unit" ${allowed?"":"disabled"}>
          <option value="pza">pza</option>
        </select>
      </div>
      <div class="field"><label>Pzas por caja</label><input id="p_ppb" type="number" step="1" value="12" ${allowed?"":"disabled"} /></div>
      <div class="field"><label>Costo</label><input id="p_cost" type="number" step="0.01" placeholder="0.00" ${allowed?"":"disabled"} /></div>
      <div class="field"><label>Precio</label><input id="p_price" type="number" step="0.01" placeholder="0.00" ${allowed?"":"disabled"} /></div>
      <div class="field"><label>Barcode</label><input id="p_bar" placeholder="EAN/UPC" ${allowed?"":"disabled"} /></div>
    </div>
    <div class="row">
      <button class="btn primary" id="p_add" ${allowed?"":"disabled title='Sin permiso'"}>Agregar</button>
    </div>
    <div class="muted small">Nota: al crear producto no crea stock. Para stock usa Inventario → Ajuste.</div>
  `);

  const list = card("Productos", `
    <table class="table">
      <thead><tr><th>SKU</th><th>Nombre</th><th>Pzas/Caja</th><th>Costo</th><th>Precio</th><th>Barcode</th></tr></thead>
      <tbody>
        ${db.products.map(p => `
          <tr>
            <td>${p.sku}</td>
            <td>${p.name}</td>
            <td>${p.piecesPerBox || 1}</td>
            <td>${money(p.cost)}</td>
            <td>${money(p.price)}</td>
            <td class="muted">${p.barcode || "—"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `);

  el.appendChild(form);
  el.appendChild(list);

  setTimeout(() => {
    const btn = $("#p_add");
    if (!btn) return;

    btn.onclick = () => {
      if (!allowed) return;

      const sku = $("#p_sku").value.trim();
      const name = $("#p_name").value.trim();
      const unit = $("#p_unit").value;
      const piecesPerBox = Math.max(1, num($("#p_ppb").value || 1));
      const cost = num($("#p_cost").value);
      const price = num($("#p_price").value);
      const barcode = $("#p_bar").value.trim();

      if (!sku || !name) return alert("SKU y Nombre son obligatorios.");
      if (db.products.some(x => x.sku.toUpperCase() === sku.toUpperCase())) return alert("SKU ya existe.");

      db.products.push({ id: uid(), sku, name, unit, piecesPerBox, cost, price, barcode });
      saveDB(db);
      render();
    };
  }, 0);

  return el;
}

function viewInventory() {
  const allowed = canAction("STOCK_MOVES");
  const branchId = "BR-001";
  const warehouseId = "WH-001";
  const onHand = calcOnHand(branchId, warehouseId);

  const el = document.createElement("div");
  el.className = "grid cols2";

  const move = card("Movimiento de inventario (Ajuste / Conteo)", `
    <div class="row">
      <div class="field">
        <label>Producto</label>
        <select id="inv_prod" ${allowed?"":"disabled"}>
          ${db.products.map(p => `<option value="${p.id}">${p.sku} — ${p.name}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>Tipo</label>
        <select id="inv_type" ${allowed?"":"disabled"}>
          <option value="ADJ">Ajuste (mueve stock)</option>
          <option value="COUNT">Conteo (físico, no mueve)</option>
        </select>
      </div>
      <div class="field">
        <label>Escanear</label>
        <button class="btn secondary" id="inv_scan" ${allowed?"":"disabled"}>Escanear</button>
      </div>
    </div>
    <div class="row">
      <div class="field"><label>Cantidad (pzas)</label><input id="inv_qty" type="number" step="1" placeholder="Ej: 5 o -3" ${allowed?"":"disabled"} /></div>
      <div class="field"><label>Costo unitario (solo entradas)</label><input id="inv_cost" type="number" step="0.01" placeholder="0.00" ${allowed?"":"disabled"} /></div>
      <div class="field"><label>Nota</label><input id="inv_note" placeholder="Motivo" ${allowed?"":"disabled"} /></div>
    </div>
    <div class="row">
      <button class="btn primary" id="inv_add" ${allowed?"":"disabled title='Sin permiso'"}>Registrar</button>
    </div>
    <div class="muted small">Conteo guarda “real” para comparar en Reportes.</div>
  `);

  const table = card("Stock teórico (pzas)", `
    <table class="table">
      <thead><tr><th>Producto</th><th>Stock</th><th>Costo promedio</th><th>Valor aprox</th></tr></thead>
      <tbody>
        ${db.products.map(p => {
          const qty = num(onHand.get(p.id) || 0);
          const avg = calcWeightedAvgCost(p.id, branchId, warehouseId);
          const val = qty * avg;
          return `<tr>
            <td>${p.sku} — ${p.name}</td>
            <td>${qty}</td>
            <td>${money(avg)}</td>
            <td>${money(val)}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `);

  el.appendChild(move);
  el.appendChild(table);

  setTimeout(() => {
    const scanBtn = $("#inv_scan");
    if (scanBtn) {
      scanBtn.onclick = async () => {
        if (!allowed) return;
        await openBarcodeScanner({
          onCode: (code) => {
            const p = productByBarcode(code);
            if (!p) return alert(`No se encontró producto con barcode: ${code}`);
            $("#inv_prod").value = p.id;
          }
        });
      };
    }

    const addBtn = $("#inv_add");
    if (addBtn) {
      addBtn.onclick = () => {
        if (!allowed) return;

        const productId = $("#inv_prod").value;
        const type = $("#inv_type").value;
        const qty = num($("#inv_qty").value);
        const unitCost = $("#inv_cost").value === "" ? null : num($("#inv_cost").value);
        const note = $("#inv_note").value.trim();

        if (!productId) return alert("Selecciona producto.");
        if (!Number.isFinite(qty) || qty === 0) return alert("Cantidad debe ser distinta de 0.");

        if (type === "COUNT") {
          db.physicalCounts.push({
            id: uid(),
            date: todayISO(),
            productId,
            countedQty: qty,
            branchId, warehouseId,
            userId: db.currentUserId
          });
        } else {
          db.stockMoves.push({
            id: uid(),
            ts: new Date().toISOString(),
            date: todayISO(),
            type: "ADJ",
            productId,
            qty,
            unitCost: qty > 0 ? (unitCost ?? calcWeightedAvgCost(productId, branchId, warehouseId)) : null,
            note: note || "Ajuste",
            branchId, warehouseId,
            userId: db.currentUserId,
            ref: null
          });
        }

        saveDB(db);
        render();
      };
    }
  }, 0);

  return el;
}

function viewPurchases() {
  const allowed = canAction("PURCHASES");
  const branchId = "BR-001";
  const warehouseId = "WH-001";

  const el = document.createElement("div");
  el.className = "grid cols2";

  const form = card("Orden de Compra (OC)", `
    <div class="row">
      <div class="field"><label>Proveedor</label><input id="po_vendor" placeholder="Ej: Proveedor A" ${allowed?"":"disabled"} /></div>
      <div class="field"><label>Fecha</label><input id="po_date" type="date" value="${todayISO()}" ${allowed?"":"disabled"} /></div>
    </div>

    <div class="row">
      <div class="field">
        <label>Producto</label>
        <select id="po_prod" ${allowed?"":"disabled"}>
          ${db.products.map(p => `<option value="${p.id}">${p.sku} — ${p.name}</option>`).join("")}
        </select>
      </div>

      <div class="field">
        <label>Escanear</label>
        <button class="btn secondary" id="po_scan" ${allowed?"":"disabled"}>Escanear</button>
      </div>

      <div class="field"><label>Cajas</label><input id="po_boxes" type="number" step="1" value="1" ${allowed?"":"disabled"} /></div>
      <div class="field"><label>Pzas sueltas</label><input id="po_pieces" type="number" step="1" value="0" ${allowed?"":"disabled"} /></div>
      <div class="field"><label>Costo unitario (pza)</label><input id="po_cost" type="number" step="0.01" placeholder="0.00" ${allowed?"":"disabled"} /></div>
    </div>

    <div class="row">
      <button class="btn" id="po_add_line" ${allowed?"":"disabled title='Sin permiso'"}>Agregar línea</button>
      <button class="btn primary" id="po_create" ${allowed?"":"disabled title='Sin permiso'"}>Crear OC</button>
    </div>

    <div class="hr"></div>
    <div class="muted small">Líneas:</div>
    <div id="po_lines" class="small"></div>
  `);

  const list = card("Órdenes de compra", `
    <table class="table">
      <thead><tr><th>OC</th><th>Proveedor</th><th>Fecha</th><th>Estado</th><th>Total</th><th>Acciones</th></tr></thead>
      <tbody>
        ${db.purchaseOrders.map(po => {
          const total = po.lines.reduce((acc,l)=>acc + (num(l.qtyPieces)*num(l.unitCost)), 0);
          const disabled = allowed ? "" : "disabled title='Sin permiso'";
          const canReceive = po.status !== "RECEIVED";
          return `<tr>
            <td>${po.code}</td>
            <td>${po.vendor}</td>
            <td>${po.date}</td>
            <td>${po.status}</td>
            <td>${money(total)}</td>
            <td>
              ${canReceive
                ? `<button class="btn secondary" data-recv-fast="${po.id}" ${disabled}>Recepción rápida</button>`
                : `<span class="badge ok">OK</span>`}
            </td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
    <div class="muted small">Recepción rápida: captura cajas+pzas por renglón y entra a inventario en pzas.</div>
  `);

  el.appendChild(form);
  el.appendChild(list);

  let tempLines = [];

  function paintLines() {
    const host = $("#po_lines");
    host.innerHTML = tempLines.length
      ? `<ul>${tempLines.map(l => {
          const p = productById(l.productId);
          return `<li><b>${p.sku}</b>: ${l.boxes} caja(s) + ${l.pieces} pza(s) = <b>${l.qtyPieces}</b> pzas | ${money(l.unitCost)} / pza</li>`;
        }).join("")}</ul>`
      : `<span class="muted">Sin líneas</span>`;
  }

  function receivedSum(po, productId) {
    return (po.receivedLines || [])
      .filter(r => r.productId === productId)
      .reduce((acc,r)=>acc + num(r.qtyReceived), 0);
  }

  function openReceiveFast(poId) {
    const po = db.purchaseOrders.find(x => x.id === poId);
    if (!po) return;

    const rows = po.lines.map(line => {
      const p = productById(line.productId);
      const got = receivedSum(po, line.productId);
      const remaining = Math.max(0, num(line.qtyPieces) - got);

      // default: propone recibir lo restante (en cajas + pzas)
      const pp = ppb(line.productId);
      const defBoxes = Math.floor(remaining / pp);
      const defPieces = remaining % pp;

      return { line, p, got, remaining, pp, defBoxes, defPieces };
    });

    openModal({
      title: `Recepción rápida — ${po.code}`,
      bodyHTML: `
        <div class="muted small">Captura lo recibido. Se clampa a lo pendiente (no entra más de lo pedido).</div>
        <table class="table" style="margin-top:12px">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Pedido (pzas)</th>
              <th>Recibido</th>
              <th>Pendiente</th>
              <th>PPB</th>
              <th>Cajas</th>
              <th>Pzas</th>
              <th>Total recibido</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r,i)=>`
              <tr>
                <td><b>${r.p.sku}</b><div class="muted small">${r.p.name}</div></td>
                <td>${r.line.qtyPieces}</td>
                <td>${r.got}</td>
                <td><span class="badge ${r.remaining>0?'warn':'ok'}">${r.remaining}</span></td>
                <td>${r.pp}</td>
                <td><input data-rx-boxes="${i}" type="number" step="1" value="${r.defBoxes}" /></td>
                <td><input data-rx-pieces="${i}" type="number" step="1" value="${r.defPieces}" /></td>
                <td><span data-rx-total="${i}">${r.remaining}</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `,
      actionsHTML: `
        <button class="btn" id="rx_cancel">Cancelar</button>
        <button class="btn primary" id="rx_apply">Aplicar recepción</button>
      `,
      onMount: ({ root, close }) => {
        const apply = root.querySelector("#rx_apply");
        const cancel = root.querySelector("#rx_cancel");

        function recalcRow(i) {
          const b = num(root.querySelector(`[data-rx-boxes="${i}"]`).value);
          const s = num(root.querySelector(`[data-rx-pieces="${i}"]`).value);
          const productId = rows[i].line.productId;
          const total = Math.max(0, toPieces(b, s, productId));
          root.querySelector(`[data-rx-total="${i}"]`).textContent = String(total);
        }

        rows.forEach((_,i)=>{
          root.querySelector(`[data-rx-boxes="${i}"]`).addEventListener("input", ()=>recalcRow(i));
          root.querySelector(`[data-rx-pieces="${i}"]`).addEventListener("input", ()=>recalcRow(i));
        });

        cancel.onclick = () => close();

        apply.onclick = () => {
          if (!allowed) return;

          rows.forEach((r,i)=>{
            const b = num(root.querySelector(`[data-rx-boxes="${i}"]`).value);
            const s = num(root.querySelector(`[data-rx-pieces="${i}"]`).value);
            let recTotal = Math.max(0, toPieces(b, s, r.line.productId));
            if (recTotal <= 0) return;

            // clamp a pendiente
            recTotal = Math.min(recTotal, r.remaining);

            po.receivedLines = po.receivedLines || [];
            po.receivedLines.push({ productId: r.line.productId, qtyReceived: recTotal, unitCost: r.line.unitCost });

            db.stockMoves.push({
              id: uid(),
              ts: new Date().toISOString(),
              date: todayISO(),
              type: "RECEIVE",
              productId: r.line.productId,
              qty: recTotal,
              unitCost: r.line.unitCost,
              note: `Recepción ${po.code}`,
              branchId, warehouseId,
              userId: db.currentUserId,
              ref: po.id
            });
          });

          // status
          const receivedMap = new Map();
          (po.receivedLines || []).forEach(rr => receivedMap.set(rr.productId, (receivedMap.get(rr.productId)||0) + num(rr.qtyReceived)));
          const allDone = po.lines.every(l => (receivedMap.get(l.productId)||0) >= num(l.qtyPieces));
          po.status = allDone ? "RECEIVED" : "PARTIAL";

          saveDB(db);
          close();
          render();
        };
      }
    });
  }

  setTimeout(() => {
    paintLines();

    const scanBtn = $("#po_scan");
    if (scanBtn) {
      scanBtn.onclick = async () => {
        if (!allowed) return;
        await openBarcodeScanner({
          onCode: (code) => {
            const p = productByBarcode(code);
            if (!p) return alert(`No se encontró producto con barcode: ${code}`);
            $("#po_prod").value = p.id;
          }
        });
      };
    }

    const addLine = $("#po_add_line");
    if (addLine) {
      addLine.onclick = () => {
        if (!allowed) return;

        const productId = $("#po_prod").value;
        const boxes = num($("#po_boxes").value);
        const pieces = num($("#po_pieces").value);
        const qtyPieces = toPieces(boxes, pieces, productId);
        const unitCost = num($("#po_cost").value || (productById(productId)?.cost ?? 0));

        if (!productId || qtyPieces <= 0) return alert("Producto y cantidad > 0 (cajas o pzas).");

        tempLines.push({ productId, boxes, pieces, qtyPieces, unitCost });
        paintLines();
      };
    }

    const create = $("#po_create");
    if (create) {
      create.onclick = () => {
        if (!allowed) return;

        const vendor = $("#po_vendor").value.trim() || "Proveedor";
        const date = $("#po_date").value || todayISO();
        if (tempLines.length === 0) return alert("Agrega al menos 1 línea.");

        const poId = uid();
        const code = `OC-${String(db.purchaseOrders.length+1).padStart(4,"0")}`;

        db.purchaseOrders.push({
          id: poId,
          code,
          vendor,
          date,
          status: "OPEN",
          branchId,
          warehouseId,
          userId: db.currentUserId,
          lines: tempLines,
          receivedLines: []
        });

        tempLines = [];
        saveDB(db);
        render();
      };
    }

    // botones de recepción rápida
    el.querySelectorAll("button[data-recv-fast]").forEach(btn => {
      btn.onclick = () => {
        if (!allowed) return;
        const poId = btn.getAttribute("data-recv-fast");
        openReceiveFast(poId);
      };
    });

  }, 0);

  return el;
}

function viewSales() {
  const allowed = canAction("SALES");
  const branchId = "BR-001";
  const warehouseId = "WH-001";

  const el = document.createElement("div");
  el.className = "grid cols2";

  const form = card("Crear pedido (venta)", `
    <div class="row">
      <div class="field"><label>Cliente</label><input id="so_customer" placeholder="Ej: Cliente 1" ${allowed?"":"disabled"} /></div>
      <div class="field"><label>Fecha</label><input id="so_date" type="date" value="${todayISO()}" ${allowed?"":"disabled"} /></div>
    </div>

    <div class="row">
      <div class="field">
        <label>Producto</label>
        <select id="so_prod" ${allowed?"":"disabled"}>
          ${db.products.map(p => `<option value="${p.id}">${p.sku} — ${p.name}</option>`).join("")}
        </select>
      </div>

      <div class="field">
        <label>Escanear</label>
        <button class="btn secondary" id="so_scan" ${allowed?"":"disabled"}>Escanear</button>
      </div>

      <div class="field"><label>Cajas</label><input id="so_boxes" type="number" step="1" value="0" ${allowed?"":"disabled"} /></div>
      <div class="field"><label>Pzas sueltas</label><input id="so_pieces" type="number" step="1" value="1" ${allowed?"":"disabled"} /></div>
      <div class="field"><label>Precio (pza)</label><input id="so_price" type="number" step="0.01" placeholder="0.00" ${allowed?"":"disabled"} /></div>
    </div>

    <div class="row">
      <button class="btn" id="so_add_line" ${allowed?"":"disabled title='Sin permiso'"}>Agregar línea</button>
      <button class="btn primary" id="so_create" ${allowed?"":"disabled title='Sin permiso'"}>Crear pedido</button>
    </div>

    <div class="hr"></div>
    <div class="muted small">Líneas:</div>
    <div id="so_lines" class="small"></div>
  `);

  const list = card("Últimas salidas por venta (movimientos)", `
    <table class="table">
      <thead><tr><th>Fecha</th><th>Producto</th><th>Qty (pzas)</th><th>Nota</th><th>Usuario</th></tr></thead>
      <tbody>
        ${db.stockMoves
          .filter(m => m.type === "SALE")
          .slice(-25)
          .reverse()
          .map(m => {
            const p = productById(m.productId);
            const u = db.users.find(x => x.id === m.userId);
            return `<tr>
              <td>${m.date}</td>
              <td>${p ? `${p.sku} — ${p.name}` : "—"}</td>
              <td>${Math.abs(num(m.qty))}</td>
              <td class="muted">${m.note || "—"}</td>
              <td class="muted">${u ? u.name : "—"}</td>
            </tr>`;
          }).join("")
        }
      </tbody>
    </table>
  `);

  el.appendChild(form);
  el.appendChild(list);

  let tempLines = [];
  function paintLines() {
    const host = $("#so_lines");
    host.innerHTML = tempLines.length
      ? `<ul>${tempLines.map(l => {
          const p = productById(l.productId);
          return `<li><b>${p.sku}</b>: ${l.boxes} caja(s) + ${l.pieces} pza(s) = <b>${l.qtyPieces}</b> pzas | ${money(l.price)} / pza</li>`;
        }).join("")}</ul>`
      : `<span class="muted">Sin líneas</span>`;
  }

  setTimeout(() => {
    paintLines();

    const scanBtn = $("#so_scan");
    if (scanBtn) {
      scanBtn.onclick = async () => {
        if (!allowed) return;
        await openBarcodeScanner({
          onCode: (code) => {
            const p = productByBarcode(code);
            if (!p) return alert(`No se encontró producto con barcode: ${code}`);
            $("#so_prod").value = p.id;
          }
        });
      };
    }

    $("#so_add_line").onclick = () => {
      if (!allowed) return;

      const productId = $("#so_prod").value;
      const boxes = num($("#so_boxes").value);
      const pieces = num($("#so_pieces").value);
      const qtyPieces = toPieces(boxes, pieces, productId);
      const price = num($("#so_price").value || (productById(productId)?.price ?? 0));

      if (!productId || qtyPieces <= 0) return alert("Producto y cantidad > 0.");

      tempLines.push({ productId, boxes, pieces, qtyPieces, price });
      paintLines();
    };

    $("#so_create").onclick = () => {
      if (!allowed) return;

      const customer = $("#so_customer").value.trim() || "Cliente";
      const date = $("#so_date").value || todayISO();
      if (tempLines.length === 0) return alert("Agrega al menos 1 línea.");

      const soId = uid();

      tempLines.forEach(line => {
        db.stockMoves.push({
          id: uid(),
          ts: new Date().toISOString(),
          date,
          type: "SALE",
          productId: line.productId,
          qty: -Math.abs(num(line.qtyPieces)),
          unitCost: null,
          note: `Pedido ${customer}`,
          branchId, warehouseId,
          userId: db.currentUserId,
          ref: soId
        });
      });

      tempLines = [];
      saveDB(db);
      render();
    };
  }, 0);

  return el;
}

function viewWaste() {
  const allowed = canAction("WASTE");
  const branchId = "BR-001";
  const warehouseId = "WH-001";

  const el = document.createElement("div");
  el.className = "grid cols2";

  const form = card("Registrar merma", `
    <div class="row">
      <div class="field">
        <label>Producto</label>
        <select id="w_prod" ${allowed?"":"disabled"}>
          ${db.products.map(p => `<option value="${p.id}">${p.sku} — ${p.name}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>Escanear</label>
        <button class="btn secondary" id="w_scan" ${allowed?"":"disabled"}>Escanear</button>
      </div>
      <div class="field"><label>Cantidad (pzas)</label><input id="w_qty" type="number" step="1" value="1" ${allowed?"":"disabled"} /></div>
      <div class="field">
        <label>Motivo</label>
        <select id="w_reason" ${allowed?"":"disabled"}>
          <option value="CADUCIDAD">Caducidad</option>
          <option value="DANIADO">Dañado</option>
          <option value="OBSOLETO">Obsoleto / No se vendió</option>
        </select>
      </div>
    </div>
    <div class="row">
      <div class="field"><label>Nota</label><input id="w_note" placeholder="Detalle" ${allowed?"":"disabled"} /></div>
      <button class="btn danger" id="w_add" ${allowed?"":"disabled title='Sin permiso'"}>Registrar merma</button>
    </div>
  `);

  const list = card("Últimos registros", `
    <table class="table">
      <thead><tr><th>Fecha</th><th>Producto</th><th>Cant.</th><th>Motivo</th><th>Costo aprox</th></tr></thead>
      <tbody>
        ${db.stockMoves
          .filter(m => m.type === "WASTE")
          .slice(-25)
          .reverse()
          .map(m => {
            const p = productById(m.productId);
            const avg = calcWeightedAvgCost(m.productId, branchId, warehouseId);
            const cost = Math.abs(num(m.qty)) * avg;
            return `<tr>
              <td>${m.date}</td>
              <td>${p ? `${p.sku} — ${p.name}` : "—"}</td>
              <td>${Math.abs(num(m.qty))}</td>
              <td>${m.note}</td>
              <td>${money(cost)}</td>
            </tr>`;
          }).join("")
        }
      </tbody>
    </table>
  `);

  el.appendChild(form);
  el.appendChild(list);

  setTimeout(() => {
    const scanBtn = $("#w_scan");
    if (scanBtn) {
      scanBtn.onclick = async () => {
        if (!allowed) return;
        await openBarcodeScanner({
          onCode: (code) => {
            const p = productByBarcode(code);
            if (!p) return alert(`No se encontró producto con barcode: ${code}`);
            $("#w_prod").value = p.id;
          }
        });
      };
    }

    $("#w_add").onclick = () => {
      if (!allowed) return;

      const productId = $("#w_prod").value;
      const qty = Math.abs(num($("#w_qty").value));
      const reason = $("#w_reason").value;
      const note = $("#w_note").value.trim();

      if (!productId || qty <= 0) return alert("Producto y cantidad > 0.");

      db.stockMoves.push({
        id: uid(),
        ts: new Date().toISOString(),
        date: todayISO(),
        type: "WASTE",
        productId,
        qty: -qty,
        unitCost: null,
        note: `${reason}${note ? ` — ${note}` : ""}`,
        branchId, warehouseId,
        userId: db.currentUserId,
        ref: null
      });

      saveDB(db);
      render();
    };
  }, 0);

  return el;
}

function viewBenchmark() {
  const allowed = canAction("BENCHMARK");
  const el = document.createElement("div");
  el.className = "grid cols2";

  const form = card("Captura benchmark (competencia)", `
    <div class="row">
      <div class="field">
        <label>Producto</label>
        <select id="b_prod" ${allowed?"":"disabled"}>
          ${db.products.map(p => `<option value="${p.id}">${p.sku} — ${p.name}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>Competidor / Tienda</label><input id="b_store" placeholder="Ej: Tienda X" ${allowed?"":"disabled"} /></div>
      <div class="field"><label>Precio observado</label><input id="b_price" type="number" step="0.01" placeholder="0.00" ${allowed?"":"disabled"} /></div>
    </div>
    <div class="row">
      <div class="field"><label>Nota</label><input id="b_note" placeholder="Promo, presentación, etc." ${allowed?"":"disabled"} /></div>
      <button class="btn primary" id="b_add" ${allowed?"":"disabled title='Sin permiso'"}>Guardar</button>
    </div>
  `);

  const list = card("Registros", `
    <table class="table">
      <thead><tr><th>Fecha</th><th>Producto</th><th>Tienda</th><th>Precio</th><th>Nota</th></tr></thead>
      <tbody>
        ${db.competitorPrices.slice(-50).reverse().map(r => {
          const p = productById(r.productId);
          return `<tr>
            <td>${r.date}</td>
            <td>${p ? `${p.sku} — ${p.name}` : "—"}</td>
            <td>${r.store}</td>
            <td>${money(r.price)}</td>
            <td class="muted">${r.note || "—"}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `);

  el.appendChild(form);
  el.appendChild(list);

  setTimeout(() => {
    $("#b_add").onclick = () => {
      if (!allowed) return;

      const productId = $("#b_prod").value;
      const store = $("#b_store").value.trim();
      const price = num($("#b_price").value);
      const note = $("#b_note").value.trim();

      if (!productId || !store || price <= 0) return alert("Producto, tienda y precio > 0.");

      db.competitorPrices.push({
        id: uid(),
        date: todayISO(),
        productId,
        store,
        price,
        note,
        userId: db.currentUserId
      });

      saveDB(db);
      render();
    };
  }, 0);

  return el;
}

function viewReports() {
  const branchId = "BR-001";
  const warehouseId = "WH-001";
  const onHand = calcOnHand(branchId, warehouseId);

  const lastCount = new Map();
  db.physicalCounts
    .filter(c => c.branchId === branchId && c.warehouseId === warehouseId)
    .sort((a,b)=> a.date.localeCompare(b.date))
    .forEach(c => lastCount.set(c.productId, c));

  const from = daysAgoISO(30);
  const wasteMoves = db.stockMoves.filter(m => m.type === "WASTE" && m.date >= from);
  const wasteCost = wasteMoves.reduce((acc,m)=> {
    const avg = calcWeightedAvgCost(m.productId, branchId, warehouseId);
    return acc + (Math.abs(num(m.qty)) * avg);
  }, 0);

  const leadTimeDays = 7;
  const safetyDays = 3;
  const suggestions = db.products.map(p => {
    const avg = calcAvgDailySales(p.id, 14, branchId, warehouseId);
    const min = Math.ceil(avg * (leadTimeDays + safetyDays));
    const stock = Math.floor(num(onHand.get(p.id) || 0));
    const toBuy = Math.max(0, min - stock);
    return { p, avg, min, stock, toBuy };
  }).sort((a,b)=>b.toBuy-a.toBuy);

  const el = document.createElement("div");
  el.className = "grid cols2";

  el.appendChild(card("Teórico vs Real (último conteo)", `
    <table class="table">
      <thead><tr><th>Producto</th><th>Teórico</th><th>Real (último)</th><th>Diferencia</th><th></th></tr></thead>
      <tbody>
        ${db.products.map(p => {
          const theo = Math.floor(num(onHand.get(p.id) || 0));
          const cnt = lastCount.get(p.id);
          const real = cnt ? Math.floor(num(cnt.countedQty)) : null;
          const diff = real == null ? null : (real - theo);
          const badge = diff == null ? "warn" : (diff === 0 ? "ok" : "bad");
          const label = diff == null ? "Sin conteo" : (diff === 0 ? "OK" : "Revisar");
          return `<tr>
            <td>${p.sku} — ${p.name}</td>
            <td>${theo}</td>
            <td>${real == null ? "—" : real}</td>
            <td>${diff == null ? "—" : diff}</td>
            <td><span class="badge ${badge}">${label}</span></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `));

  el.appendChild(card("Merma (últimos 30 días)", `
    <div class="kpi">
      <div class="v">${money(wasteCost)}</div>
      <div class="k">Costo aproximado de merma (promedio ponderado)</div>
    </div>
  `));

  el.appendChild(card("Sugerencia de reabasto (simple)", `
    <div class="muted small">Min = consumo promedio 14 días × (lead time 7 + seguridad 3).</div>
    <table class="table">
      <thead><tr><th>Producto</th><th>Consumo/día</th><th>Mín sugerido</th><th>Stock</th><th>Comprar</th></tr></thead>
      <tbody>
        ${suggestions.map(s => `
          <tr>
            <td>${s.p.sku} — ${s.p.name}</td>
            <td>${s.avg.toFixed(2)}</td>
            <td>${s.min}</td>
            <td>${s.stock}</td>
            <td>${s.toBuy > 0 ? `<span class="badge warn">${s.toBuy}</span>` : `<span class="badge ok">0</span>`}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `));

  el.appendChild(card("Auditoría de movimientos (últimos 25)", `
    <table class="table">
      <thead><tr><th>Fecha</th><th>Tipo</th><th>Producto</th><th>Qty</th><th>Nota</th><th>Usuario</th></tr></thead>
      <tbody>
        ${db.stockMoves.slice(-25).reverse().map(m => {
          const p = productById(m.productId);
          const u = db.users.find(x => x.id === m.userId);
          return `<tr>
            <td>${m.date}</td>
            <td class="muted">${m.type}</td>
            <td>${p ? p.sku : "—"}</td>
            <td>${m.qty}</td>
            <td class="muted">${m.note || "—"}</td>
            <td class="muted">${u ? u.name : "—"}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `));

  return el;
}

// ---------- Init ----------
(function init() {
  if (!canView(currentTab)) currentTab = "dashboard";
  render();
})();
