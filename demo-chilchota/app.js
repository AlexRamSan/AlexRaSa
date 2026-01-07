/* Chilchota Demo — v7
  A) Lista por canal con vigencia (si cliente no tiene lista fija)
  B) Descuentos por volumen con vigencia
  C) Workflow de aprobación para baja de precio (seller) => pedido PENDING_APPROVAL, admin aprueba/deniega
*/

const STORAGE_KEY = "chilchota_demo_v4";

const $ = (sel) => document.querySelector(sel);
const uid = () => Math.random().toString(16).slice(2) + Date.now().toString(16);
const money = (n) => (Number(n) || 0).toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const num = (n) => Number(n || 0);

function todayISO() {
  const d = new Date();
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function daysAgoISO(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  const pad = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function isDateInRange(dateISO, startISO, endISO) {
  const d = dateISO || todayISO();
  const s = startISO || "0000-01-01";
  const e = endISO || "9999-12-31";
  return d >= s && d <= e;
}

// ---------- Seed ----------
function seedData() {
  const branchId = "BR-001";
  const warehouseId = "WH-001";

  const products = [
    { id: uid(), sku: "CHI-LEC-1L",  name: "Leche Entera 1L", unit: "pza", piecesPerBox: 12, cost: 16.50, price: 24.00, barcode: "750000000001" },
    { id: uid(), sku: "CHI-CRE-250", name: "Crema 250 ml", unit: "pza", piecesPerBox: 12, cost: 22.00, price: 34.00, barcode: "750000000002" },
    { id: uid(), sku: "CHI-JOC-JAR", name: "Jocoque Jarro", unit: "pza", piecesPerBox: 12, cost: 38.00, price: 59.00, barcode: "750000000003" },
    { id: uid(), sku: "CHI-DBC-STD", name: "Doble Crema", unit: "pza", piecesPerBox: 12, cost: 30.00, price: 48.00, barcode: "750000000004" },
    { id: uid(), sku: "CHI-MAN-225", name: "Mantequilla Untable 225g", unit: "pza", piecesPerBox: 12, cost: 24.50, price: 39.00, barcode: "750000000005" },
  ];

  const stockMoves = [];
  products.forEach((p, i) => {
    stockMoves.push({
      id: uid(),
      ts: new Date().toISOString(),
      date: todayISO(),
      type: "INIT",
      productId: p.id,
      qty: 20 + i * 5,
      unitCost: p.cost,
      note: "Inventario inicial",
      branchId,
      warehouseId,
      userId: "U-ADMIN",
      ref: null
    });
  });

  for (let d = 1; d <= 14; d++) {
    const shipId = uid();
    const lines = [
      { productId: products[0].id, qtyPieces: (d % 3) + 1 },
      { productId: products[2].id, qtyPieces: (d % 2) }
    ].filter(l => l.qtyPieces > 0);

    lines.forEach(l => {
      stockMoves.push({
        id: uid(),
        ts: new Date().toISOString(),
        date: daysAgoISO(d),
        type: "SHIP",
        productId: l.productId,
        qty: -l.qtyPieces,
        unitCost: null,
        note: `Entrega demo ${String(shipId).slice(-6)}`,
        branchId,
        warehouseId,
        userId: "U-WH",
        ref: shipId
      });
    });
  }

  // Listas
  const priceLists = [
    { id: "PL-STD", name: "Lista estándar", discountPct: 0 },
    { id: "PL-MAY", name: "Mayoreo", discountPct: 8 },
    { id: "PL-KEY", name: "Cuenta clave", discountPct: 12 },
  ];

  // Clientes (con canal). Ojo: priceListId fijo es opcional. Si está vacío => se usa regla por canal vigente.
  const customers = [
    { id: "C-001", name: "Tienda Centro", channel: "TIENDA", priceListId: "PL-STD" },
    { id: "C-002", name: "Distribuidor Bajío", channel: "DISTRIBUIDOR", priceListId: "PL-MAY" },
    { id: "C-003", name: "Cuenta Clave QRO", channel: "CLAVE", priceListId: "" }, // usa canal schedule
  ];

  // Overrides base por cliente+producto (pactado). Admin los define.
  const customerPriceOverrides = [
    { id: uid(), customerId: "C-003", productId: products[2].id, basePrice: 52.00, reason: "Contrato anual", updatedAt: new Date().toISOString(), userId: "U-ADMIN" }
  ];

  // A) Schedules por canal (vigencia). Se usan cuando cliente.priceListId está vacío.
  const channelPriceSchedules = [
    { id: uid(), channel: "TIENDA",       priceListId: "PL-STD", startDate: "2025-01-01", endDate: "2026-12-31" },
    { id: uid(), channel: "DISTRIBUIDOR", priceListId: "PL-MAY", startDate: "2025-01-01", endDate: "2026-12-31" },
    { id: uid(), channel: "CLAVE",        priceListId: "PL-KEY", startDate: "2025-01-01", endDate: "2026-12-31" },
  ];

  // B) Reglas por volumen (tiers) con vigencia
  // minBoxes: umbral por cajas (usando PPB del producto); productId vacío => aplica a todos
  const volumeRules = [
    { id: uid(), productId: "", minBoxes: 5, discountPct: 2.0, startDate: "2025-01-01", endDate: "2026-12-31" },
    { id: uid(), productId: "", minBoxes: 10, discountPct: 4.0, startDate: "2025-01-01", endDate: "2026-12-31" },
  ];

  // C) Cola de aprobaciones (solicitudes de precio). Seller genera; Admin decide.
  const priceOverrideRequests = [];

  return {
    meta: { createdAt: new Date().toISOString(), version: 7 },
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
    salesOrders: [],
    competitorPrices: [],
    physicalCounts: [],

    priceLists,
    customers,
    customerPriceOverrides,

    channelPriceSchedules,
    volumeRules,
    priceOverrideRequests,
  };
}

function migrateDB(db) {
  if (!db) return seedData();

  db.meta = db.meta || { createdAt: new Date().toISOString(), version: 7 };
  db.meta.version = 7;

  db.products = db.products || [];
  db.stockMoves = db.stockMoves || [];
  db.purchaseOrders = db.purchaseOrders || [];
  db.salesOrders = db.salesOrders || [];
  db.competitorPrices = db.competitorPrices || [];
  db.physicalCounts = db.physicalCounts || [];
  db.users = db.users && db.users.length ? db.users : seedData().users;
  if (!db.currentUserId) db.currentUserId = db.users[0].id;

  db.products.forEach(p => {
    if (!p.piecesPerBox || num(p.piecesPerBox) <= 0) p.piecesPerBox = 12;
    if (!p.unit) p.unit = "pza";
    if (p.price == null) p.price = 0;
    if (p.cost == null) p.cost = 0;
  });

  // v6 fields
  if (!db.priceLists || !db.priceLists.length) db.priceLists = seedData().priceLists;
  if (!db.customers || !db.customers.length) db.customers = seedData().customers;
  if (!db.customerPriceOverrides) db.customerPriceOverrides = seedData().customerPriceOverrides;

  // v7 fields
  if (!db.channelPriceSchedules) db.channelPriceSchedules = seedData().channelPriceSchedules;
  if (!db.volumeRules) db.volumeRules = seedData().volumeRules;
  if (!db.priceOverrideRequests) db.priceOverrideRequests = [];

  // customer.channel default
  db.customers.forEach(c => { if (!c.channel) c.channel = "TIENDA"; if (c.priceListId == null) c.priceListId = ""; });

  // asegurar priceListId válido si no está vacío
  const plIds = new Set(db.priceLists.map(x => x.id));
  db.customers.forEach(c => { if (c.priceListId && !plIds.has(c.priceListId)) c.priceListId = ""; });

  // compat pedidos viejos
  db.salesOrders.forEach(so => {
    if (!so.customer && so.customerName) so.customer = so.customerName;
    if (!so.customer && so.customerId) so.customer = (db.customers.find(c => c.id === so.customerId)?.name) || "Cliente";
    if (!so.status) so.status = "OPEN";
    if (!so.lines) so.lines = [];
    so.lines.forEach(l => {
      if (!l.approvalStatus) l.approvalStatus = "NONE"; // NONE | PENDING | APPROVED | DENIED
    });
  });

  return db;
}

function loadDB() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const db = seedData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    return db;
  }
  try {
    return migrateDB(JSON.parse(raw));
  } catch {
    const db = seedData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    return db;
  }
}
function saveDB(db) { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); }

let db = loadDB();

// ---------- Roles / Permisos ----------
function getUser() { return db.users.find(u => u.id === db.currentUserId) || db.users[0]; }
function role() { return getUser().role; }

const PERMS = {
  dashboard: ["ADMIN"],
  products: ["ADMIN"],
  inventory: ["ADMIN","WAREHOUSE"],
  purchases: ["ADMIN","WAREHOUSE","SELLER"],
  sales: ["ADMIN","WAREHOUSE","SELLER"],
  waste: ["ADMIN","WAREHOUSE","SELLER"],
  benchmark: ["ADMIN","SELLER"],
  pricing: ["ADMIN"],
  reports: ["ADMIN"]
};

function canView(tabId) {
  const allowed = PERMS[tabId] || [];
  return allowed.includes(role());
}
function canAction(action) {
  const rules = {
    MANAGE_PRODUCTS: ["ADMIN"],
    STOCK_MOVES: ["ADMIN","WAREHOUSE"],
    PURCHASES: ["ADMIN","WAREHOUSE","SELLER"],
    SALES_CREATE: ["ADMIN","SELLER"],
    SALES_FULFILL: ["ADMIN","WAREHOUSE"],
    WASTE: ["ADMIN","WAREHOUSE","SELLER"],
    BENCHMARK: ["ADMIN","SELLER"],
    MANAGE_PRICING: ["ADMIN"],
    REPORTS: ["ADMIN"]
  };
  return (rules[action] || []).includes(role());
}

// ---------- Productos / Clientes / Precios ----------
function productById(id) { return db.products.find(p => p.id === id); }
function productByBarcode(code) {
  const c = String(code || "").trim();
  if (!c) return null;
  return db.products.find(p => String(p.barcode || "").trim() === c) || null;
}
function ppb(productId) { return Math.max(1, num(productById(productId)?.piecesPerBox || 1)); }
function toPieces(boxes, pieces, productId) { return (num(boxes) * ppb(productId)) + num(pieces); }

function customerById(id) { return db.customers.find(c => c.id === id); }
function priceListById(id) { return db.priceLists.find(p => p.id === id); }
function getCustomerOverride(customerId, productId) {
  return db.customerPriceOverrides.find(o => o.customerId === customerId && o.productId === productId) || null;
}

// A) Precio lista por canal+vigencia (si cliente no trae lista fija)
function resolvePriceListForCustomer(customerId, orderDateISO) {
  const c = customerById(customerId);
  if (!c) return { priceListId: "PL-STD", source: "DEFAULT" };

  // si cliente trae lista fija, gana
  if (c.priceListId) return { priceListId: c.priceListId, source: "CUSTOMER_FIXED" };

  const active = db.channelPriceSchedules
    .filter(s => s.channel === c.channel && isDateInRange(orderDateISO, s.startDate, s.endDate))
    .sort((a,b) => (b.startDate || "").localeCompare(a.startDate || ""))[0];

  if (active) return { priceListId: active.priceListId, source: "CHANNEL_SCHEDULE", scheduleId: active.id };
  return { priceListId: "PL-STD", source: "DEFAULT" };
}

// B) Regla por volumen (elige el mayor descuento que califica)
function resolveVolumeDiscount(productId, qtyPieces, orderDateISO) {
  const p = productById(productId);
  if (!p) return { discountPct: 0, ruleId: null };

  const candidates = db.volumeRules
    .filter(r => isDateInRange(orderDateISO, r.startDate, r.endDate))
    .filter(r => (!r.productId || r.productId === "" || r.productId === productId));

  const boxes = qtyPieces / ppb(productId);

  let best = { discountPct: 0, ruleId: null, minBoxes: 0 };
  for (const r of candidates) {
    const minBoxes = num(r.minBoxes);
    if (minBoxes > 0 && boxes >= minBoxes) {
      if (num(r.discountPct) > best.discountPct) {
        best = { discountPct: num(r.discountPct), ruleId: r.id, minBoxes };
      }
    }
  }
  return best;
}

// Precio base calculado (producto -> lista -> override cliente+producto -> volumen)
function getComputedPrice(customerId, productId, qtyPieces, orderDateISO) {
  const p = productById(productId);
  if (!p) return { computedPrice: 0, trace: { source: "NONE" } };

  const plInfo = resolvePriceListForCustomer(customerId, orderDateISO);
  const pl = priceListById(plInfo.priceListId) || priceListById("PL-STD");
  const listDiscountPct = pl ? num(pl.discountPct) : 0;

  // Base por producto
  let base = num(p.price || 0);
  let source = "PRODUCT";

  // Lista por canal/cliente
  if (listDiscountPct > 0) {
    base = Math.max(0, base * (1 - listDiscountPct / 100));
    source = "PRICELIST";
  }

  // Override pactado cliente+producto (Admin)
  const custOv = getCustomerOverride(customerId, productId);
  if (custOv && num(custOv.basePrice) > 0) {
    base = num(custOv.basePrice);
    source = "CUSTOM_OVERRIDE";
  }

  // Volumen
  const vol = resolveVolumeDiscount(productId, qtyPieces, orderDateISO);
  let afterVol = base;
  if (vol.discountPct > 0) {
    afterVol = Math.max(0, base * (1 - vol.discountPct / 100));
  }

  return {
    computedPrice: afterVol,
    trace: {
      source,
      productPrice: num(p.price || 0),
      priceListId: pl?.id || "PL-STD",
      priceListDiscountPct: listDiscountPct,
      priceListSource: plInfo.source,
      customerOverrideId: custOv ? custOv.id : null,
      customerOverrideReason: custOv ? custOv.reason : null,
      volumeRuleId: vol.ruleId,
      volumeDiscountPct: vol.discountPct,
      qtyPieces,
      orderDateISO
    }
  };
}

// C) aprobación: si vendedor baja precio vs computedPrice => requiere aprobación
function needsApprovalForPriceChange(userRole, computedPrice, finalPrice) {
  if (userRole === "ADMIN") return false;
  // solo si baja
  return num(finalPrice) < num(computedPrice) - 0.0001;
}

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
    (m.type === "SHIP") &&
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

  function close() { backdrop.remove(); }
  backdrop.querySelector("#modalClose").onclick = close;
  backdrop.onclick = (e) => { if (e.target === backdrop) close(); };

  if (onMount) onMount({ root: backdrop, close });
  return { close };
}

async function openBarcodeScanner({ onCode }) {
  const supported = "BarcodeDetector" in window;
  const hasMedia = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  openModal({
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
      root.querySelector("#manualOk").onclick = () => {
        const code = root.querySelector("#manualCode").value.trim();
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
        if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
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
          } catch {}
        }, 350);
      } catch {
        status.textContent = "No se pudo acceder a la cámara. Usa el campo manual.";
      }
    }
  });
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
  { id: "pricing", label: "Clientes/Precios" },
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
    if (!allowed) { btn.disabled = true; btn.title = "Sin permiso para este módulo"; }
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

    // fallback a una pestaña accesible
    const fallback = ["sales","purchases","waste","benchmark","inventory","products","pricing","dashboard"];
    for (const t of fallback) { if (canView(t)) { currentTab = t; break; } }
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
    view.appendChild(card("Sin acceso", `<div class="muted">Tu rol (${role()}) no tiene permiso para este módulo.</div>`));
    return;
  }

  if (currentTab === "dashboard") view.appendChild(viewDashboard());
  if (currentTab === "products") view.appendChild(viewProducts());
  if (currentTab === "inventory") view.appendChild(viewInventory());
  if (currentTab === "purchases") view.appendChild(viewPurchases());
  if (currentTab === "sales") view.appendChild(viewSales());
  if (currentTab === "waste") view.appendChild(viewWaste());
  if (currentTab === "benchmark") view.appendChild(viewBenchmark());
  if (currentTab === "pricing") view.appendChild(viewPricing());
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
  const shipMoves = db.stockMoves.filter(m => m.type === "SHIP" && m.date >= from7);
  const shippedUnits = -shipMoves.reduce((acc,m)=>acc+num(m.qty),0);

  const pendingReq = db.priceOverrideRequests.filter(r => r.status === "PENDING").length;

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
      <div class="kpi"><div class="v">${shippedUnits}</div><div class="k">Pzas entregadas (7 días)</div></div>
    </div>
    <div class="hr"></div>
    <div class="grid cols3">
      <div class="kpi"><div class="v">${wasteUnits}</div><div class="k">Merma (30 días)</div></div>
      <div class="kpi"><div class="v">${getUser().name}</div><div class="k">Sesión</div></div>
      <div class="kpi"><div class="v">${role()}</div><div class="k">Rol</div></div>
    </div>
  `));

  wrap.appendChild(card("Riesgo de quiebre (estimado)", `
    <div class="muted small">Consumo promedio 14 días (entregas) vs stock teórico.</div>
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

  wrap.appendChild(card("Precio inteligente (A+B+C)", `
    <ul class="small">
      <li><b>A:</b> Lista por canal con vigencia (si el cliente no tiene lista fija).</li>
      <li><b>B:</b> Descuento por volumen (tiers) automático.</li>
      <li><b>C:</b> Si el vendedor baja el precio, se genera solicitud; Admin aprueba.</li>
    </ul>
    <div class="hr"></div>
    <div class="kpi">
      <div class="v">${pendingReq}</div>
      <div class="k">Solicitudes de precio pendientes</div>
    </div>
  `));

  return wrap;
}

// --- Productos / Inventario / Compras / Merma / Benchmark / Reportes
// Para mantener esto manejable, dejo estos módulos como estaban funcionalmente en v6.
// (No cambia lógica base, solo se apoya en db ampliado.)

function viewProducts() {
  const allowed = canAction("MANAGE_PRODUCTS");
  const el = document.createElement("div");
  el.className = "grid cols2";

  const form = card("Alta de producto", `
    <div class="row">
      <div class="field"><label>SKU</label><input id="p_sku" placeholder="EJ: CHI-..." ${allowed ? "" : "disabled"} /></div>
      <div class="field"><label>Nombre</label><input id="p_name" placeholder="EJ: Jocoque Jarro" ${allowed ? "" : "disabled"} /></div>
    </div>
    <div class="row">
      <div class="field">
        <label>Unidad</label>
        <select id="p_unit" ${allowed ? "" : "disabled"}>
          <option value="pza">pza</option>
        </select>
      </div>
      <div class="field"><label>Pzas por caja</label><input id="p_ppb" type="number" step="1" value="12" ${allowed ? "" : "disabled"} /></div>
      <div class="field"><label>Costo</label><input id="p_cost" type="number" step="0.01" placeholder="0.00" ${allowed ? "" : "disabled"} /></div>
      <div class="field"><label>Precio</label><input id="p_price" type="number" step="0.01" placeholder="0.00" ${allowed ? "" : "disabled"} /></div>
      <div class="field"><label>Barcode</label><input id="p_bar" placeholder="EAN/UPC" ${allowed ? "" : "disabled"} /></div>
    </div>
    <div class="row">
      <button class="btn primary" id="p_add" ${allowed ? "" : "disabled title='Sin permiso'"}>Agregar</button>
    </div>
    <div class="muted small">Crear producto no crea stock. Para stock usa Inventario → Ajuste.</div>
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
        <select id="inv_prod" ${allowed ? "" : "disabled"}>
          ${db.products.map(p => `<option value="${p.id}">${p.sku} — ${p.name}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>Tipo</label>
        <select id="inv_type" ${allowed ? "" : "disabled"}>
          <option value="ADJ">Ajuste (mueve stock)</option>
          <option value="COUNT">Conteo (físico, no mueve)</option>
        </select>
      </div>
      <div class="field">
        <label>Escanear</label>
        <button class="btn secondary" id="inv_scan" ${allowed ? "" : "disabled"}>Escanear</button>
      </div>
    </div>
    <div class="row">
      <div class="field"><label>Cantidad (pzas)</label><input id="inv_qty" type="number" step="1" placeholder="Ej: 5 o -3" ${allowed ? "" : "disabled"} /></div>
      <div class="field"><label>Costo unitario (solo entradas)</label><input id="inv_cost" type="number" step="0.01" placeholder="0.00" ${allowed ? "" : "disabled"} /></div>
      <div class="field"><label>Nota</label><input id="inv_note" placeholder="Motivo" ${allowed ? "" : "disabled"} /></div>
    </div>
    <div class="row">
      <button class="btn primary" id="inv_add" ${allowed ? "" : "disabled title='Sin permiso'"}>Registrar</button>
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
    $("#inv_scan").onclick = async () => {
      if (!allowed) return;
      await openBarcodeScanner({
        onCode: (code) => {
          const p = productByBarcode(code);
          if (!p) return alert(`No se encontró producto con barcode: ${code}`);
          $("#inv_prod").value = p.id;
        }
      });
    };

    $("#inv_add").onclick = () => {
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
      <div class="field"><label>Proveedor</label><input id="po_vendor" placeholder="Ej: Proveedor A" ${allowed ? "" : "disabled"} /></div>
      <div class="field"><label>Fecha</label><input id="po_date" type="date" value="${todayISO()}" ${allowed ? "" : "disabled"} /></div>
    </div>

    <div class="row">
      <div class="field">
        <label>Producto</label>
        <select id="po_prod" ${allowed ? "" : "disabled"}>
          ${db.products.map(p => `<option value="${p.id}">${p.sku} — ${p.name}</option>`).join("")}
        </select>
      </div>

      <div class="field">
        <label>Escanear</label>
        <button class="btn secondary" id="po_scan" ${allowed ? "" : "disabled"}>Escanear</button>
      </div>

      <div class="field"><label>Cajas</label><input id="po_boxes" type="number" step="1" value="1" ${allowed ? "" : "disabled"} /></div>
      <div class="field"><label>Pzas sueltas</label><input id="po_pieces" type="number" step="1" value="0" ${allowed ? "" : "disabled"} /></div>
      <div class="field"><label>Costo unitario (pza)</label><input id="po_cost" type="number" step="0.01" placeholder="0.00" ${allowed ? "" : "disabled"} /></div>
    </div>

    <div class="row">
      <button class="btn" id="po_add_line" ${allowed ? "" : "disabled title='Sin permiso'"}>Agregar línea</button>
      <button class="btn primary" id="po_create" ${allowed ? "" : "disabled title='Sin permiso'"}>Crear OC</button>
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
          const canReceive = allowed && po.status !== "RECEIVED";
          return `<tr>
            <td>${po.code}</td>
            <td>${po.vendor}</td>
            <td>${po.date}</td>
            <td>${po.status}</td>
            <td>${money(total)}</td>
            <td>
              ${canReceive
                ? `<button class="btn secondary" data-recv-fast="${po.id}">Recepción rápida</button>`
                : (po.status === "RECEIVED" ? `<span class="badge ok">OK</span>` : `<span class="badge warn">—</span>`)}
            </td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
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
      const pp = ppb(line.productId);
      const defBoxes = Math.floor(remaining / pp);
      const defPieces = remaining % pp;
      return { line, p, got, remaining, pp, defBoxes, defPieces };
    });

    openModal({
      title: `Recepción rápida — ${po.code}`,
      bodyHTML: `
        <div class="muted small">Captura lo recibido. Se clampa a lo pendiente. Costo editable por renglón.</div>
        <table class="table" style="margin-top:12px">
          <thead>
            <tr><th>Producto</th><th>Pedido</th><th>Recibido</th><th>Pendiente</th><th>PPB</th><th>Cajas</th><th>Pzas</th><th>Total</th><th>Costo/pza</th></tr>
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
                <td><input data-rx-cost="${i}" type="number" step="0.01" value="${num(r.line.unitCost).toFixed(2)}" /></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `,
      actionsHTML: `<button class="btn" id="rx_cancel">Cancelar</button><button class="btn primary" id="rx_apply">Aplicar recepción</button>`,
      onMount: ({ root, close }) => {
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

        root.querySelector("#rx_cancel").onclick = () => close();

        root.querySelector("#rx_apply").onclick = () => {
          if (!allowed) return;

          rows.forEach((r,i)=>{
            const b = num(root.querySelector(`[data-rx-boxes="${i}"]`).value);
            const s = num(root.querySelector(`[data-rx-pieces="${i}"]`).value);
            let recTotal = Math.max(0, toPieces(b, s, r.line.productId));
            if (recTotal <= 0) return;
            recTotal = Math.min(recTotal, r.remaining);

            const cost = num(root.querySelector(`[data-rx-cost="${i}"]`).value || r.line.unitCost || 0);
            if (cost <= 0) return alert(`Costo inválido en ${r.p.sku}.`);

            po.receivedLines = po.receivedLines || [];
            po.receivedLines.push({ productId: r.line.productId, qtyReceived: recTotal, unitCost: cost });

            db.stockMoves.push({
              id: uid(),
              ts: new Date().toISOString(),
              date: todayISO(),
              type: "RECEIVE",
              productId: r.line.productId,
              qty: recTotal,
              unitCost: cost,
              note: `Recepción ${po.code}`,
              branchId, warehouseId,
              userId: db.currentUserId,
              ref: po.id
            });
          });

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

    function loadDefaultCost() {
      const p = productById($("#po_prod").value);
      if (!p) return;
      $("#po_cost").value = num(p.cost || 0).toFixed(2);
    }
    $("#po_prod").onchange = loadDefaultCost;
    loadDefaultCost();

    $("#po_scan").onclick = async () => {
      if (!allowed) return;
      await openBarcodeScanner({
        onCode: (code) => {
          const p = productByBarcode(code);
          if (!p) return alert(`No se encontró producto con barcode: ${code}`);
          $("#po_prod").value = p.id;
          $("#po_cost").value = num(p.cost || 0).toFixed(2);
        }
      });
    };

    $("#po_add_line").onclick = () => {
      if (!allowed) return;

      const productId = $("#po_prod").value;
      const boxes = num($("#po_boxes").value);
      const pieces = num($("#po_pieces").value);
      const qtyPieces = toPieces(boxes, pieces, productId);
      const unitCost = num($("#po_cost").value || (productById(productId)?.cost ?? 0));
      if (!productId || qtyPieces <= 0) return alert("Producto y cantidad > 0 (cajas o pzas).");
      if (unitCost <= 0) return alert("Costo unitario inválido.");

      tempLines.push({ productId, boxes, pieces, qtyPieces, unitCost });
      paintLines();
    };

    $("#po_create").onclick = () => {
      if (!allowed) return;

      const vendor = $("#po_vendor").value.trim() || "Proveedor";
      const date = $("#po_date").value || todayISO();
      if (tempLines.length === 0) return alert("Agrega al menos 1 línea.");

      const poId = uid();
      const code = `OC-${String(db.purchaseOrders.length + 1).padStart(4, "0")}`;

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

    el.querySelectorAll("button[data-recv-fast]").forEach(btn => {
      btn.onclick = () => openReceiveFast(btn.getAttribute("data-recv-fast"));
    });

  }, 0);

  return el;
}

/* ---------- PEDIDOS (A+B+C aquí) ---------- */
function viewSales() {
  const canCreate = canAction("SALES_CREATE");
  const canFulfill = canAction("SALES_FULFILL");
  const branchId = "BR-001";
  const warehouseId = "WH-001";
  const onHand = calcOnHand(branchId, warehouseId);

  const CHANNEL_LABELS = { TIENDA: "Tienda", DISTRIBUIDOR: "Distribuidor", CLAVE: "Cuenta clave" };

  const el = document.createElement("div");
  el.className = "grid cols2";

  const form = card("Crear pedido (no mueve inventario)", `
    <div class="row">
      <div class="field">
        <label>Cliente</label>
        <select id="so_customer" ${canCreate ? "" : "disabled"}>
          ${db.customers.map(c => {
            const ch = CHANNEL_LABELS[c.channel] || c.channel;
            const fixed = c.priceListId ? `• lista fija ${c.priceListId}` : `• lista por canal`;
            return `<option value="${c.id}">${c.name} (${ch} ${fixed})</option>`;
          }).join("")}
        </select>
      </div>
      <div class="field"><label>Fecha</label><input id="so_date" type="date" value="${todayISO()}" ${canCreate ? "" : "disabled"} /></div>
    </div>

    <div class="row">
      <div class="field">
        <label>Producto</label>
        <select id="so_prod" ${canCreate ? "" : "disabled"}>
          ${db.products.map(p => `<option value="${p.id}">${p.sku} — ${p.name}</option>`).join("")}
        </select>
      </div>

      <div class="field">
        <label>Escanear</label>
        <button class="btn secondary" id="so_scan" ${canCreate ? "" : "disabled"}>Escanear</button>
      </div>

      <div class="field"><label>Cajas</label><input id="so_boxes" type="number" step="1" value="0" ${canCreate ? "" : "disabled"} /></div>
      <div class="field"><label>Pzas sueltas</label><input id="so_pieces" type="number" step="1" value="1" ${canCreate ? "" : "disabled"} /></div>
    </div>

    <div class="row">
      <div class="field">
        <label>Precio calculado (pza)</label>
        <input id="so_price" type="number" step="0.01" ${canCreate ? "" : "disabled"} readonly />
        <div class="muted small" id="so_price_trace" style="margin-top:6px">—</div>
      </div>
      <div class="field">
        <label>Volumen</label>
        <input id="so_vol" ${canCreate ? "" : "disabled"} readonly />
        <div class="muted small" id="so_vol_hint" style="margin-top:6px">—</div>
      </div>
    </div>

    <div class="row">
      <div class="field"><label>Descuento % (manual)</label><input id="so_disc_pct" type="number" step="0.01" value="0" ${canCreate ? "" : "disabled"} /></div>
      <div class="field"><label>Descuento $ (manual)</label><input id="so_disc_amt" type="number" step="0.01" value="0" ${canCreate ? "" : "disabled"} /></div>
      <div class="field"><label>Override (precio especial manual)</label><input id="so_override" type="number" step="0.01" placeholder="Vacío = no" ${canCreate ? "" : "disabled"} /></div>
    </div>

    <div class="row">
      <div class="field" style="flex:2">
        <label>Motivo (obligatorio si cambia el precio)</label>
        <input id="so_reason" placeholder="Ej: promo, volumen extra, ajuste por competencia..." ${canCreate ? "" : "disabled"} />
        <div class="muted small" id="so_approval_note" style="margin-top:6px">—</div>
      </div>
      <div class="field"><label>Precio final</label><input id="so_final" ${canCreate ? "" : "disabled"} readonly /></div>
    </div>

    <div class="row">
      <button class="btn" id="so_add_line" ${canCreate ? "" : "disabled title='Sin permiso'"}>Agregar línea</button>
      <button class="btn primary" id="so_create" ${canCreate ? "" : "disabled title='Sin permiso'"}>Crear pedido</button>
    </div>

    <div class="hr"></div>
    <div class="muted small">Líneas:</div>
    <div id="so_lines" class="small"></div>
  `);

  const orders = card("Pedidos y surtidos", `
    <table class="table">
      <thead><tr><th>Pedido</th><th>Cliente</th><th>Fecha</th><th>Estado</th><th>Progreso</th><th>Acciones</th></tr></thead>
      <tbody>
        ${db.salesOrders.slice().reverse().map(so => {
          const ordered = (so.lines || []).reduce((acc,l)=>acc+num(l.qtyPieces),0);
          const shipped = (so.shipLines||[]).reduce((acc,l)=>acc+num(l.qtyShipped),0);
          const pct = ordered>0 ? Math.round((shipped/ordered)*100) : 0;

          const hasPending = (so.lines||[]).some(l => l.approvalStatus === "PENDING");
          const statusBadge =
            so.status === "PENDING_APPROVAL" || hasPending ? `<span class="badge warn">PENDING_APPROVAL</span>` :
            so.status === "SHIPPED" ? `<span class="badge ok">SHIPPED</span>` :
            so.status === "PARTIAL" ? `<span class="badge warn">PARTIAL</span>` :
            `<span class="badge warn">OPEN</span>`;

          const canDeliver = canFulfill && !hasPending && so.status !== "SHIPPED";
          const btn = canDeliver
            ? `<button class="btn secondary" data-fulfill="${so.id}">Surtir / Entregar</button>`
            : (hasPending ? `<span class="muted small">Esperando aprobación</span>` : `<span class="muted small">—</span>`);

          return `<tr>
            <td>${so.code}</td>
            <td>${so.customer || "Cliente"}</td>
            <td>${so.date}</td>
            <td>${statusBadge}</td>
            <td>${pct}%</td>
            <td>${btn}</td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
    <div class="muted small">
      El pedido no descuenta stock. La entrega sí descuenta y puede ser parcial.
      Si hay <b>PENDING_APPROVAL</b>, no se puede surtir.
    </div>
  `);

  el.appendChild(form);
  el.appendChild(orders);

  let tempLines = [];

  function computeFinalPrice(computed, discPct, discAmt, overrideRaw) {
    const base = Math.max(0, num(computed));
    const ov = (overrideRaw === "" || overrideRaw == null) ? null : num(overrideRaw);
    if (ov != null && Number.isFinite(ov) && ov > 0) return ov;

    const p = Math.max(0, num(discPct));
    const a = Math.max(0, num(discAmt));
    const afterPct = base * (1 - (p / 100));
    const final = afterPct - a;
    return Math.max(0, final);
  }
  function priceChanged(a, b) { return Math.abs(num(a) - num(b)) > 0.0001; }

  function paintLines() {
    const host = $("#so_lines");
    host.innerHTML = tempLines.length
      ? `<ul>${tempLines.map(l => {
          const p = productById(l.productId);
          const st =
            l.approvalStatus === "PENDING" ? ` <span class="badge warn">PENDING</span>` :
            l.approvalStatus === "APPROVED" ? ` <span class="badge ok">APPROVED</span>` :
            l.approvalStatus === "DENIED" ? ` <span class="badge bad">DENIED</span>` : "";
          const reason = l.reason ? ` <span class="muted">(${l.reason})</span>` : "";
          return `<li>
            <b>${p.sku}</b>: ${l.boxes} caja(s) + ${l.pieces} pza(s) = <b>${l.qtyPieces}</b> |
            Calculado ${money(l.computedPrice)} → Final <b>${money(l.finalPrice)}</b> / pza${st}${reason}
          </li>`;
        }).join("")}</ul>`
      : `<span class="muted">Sin líneas</span>`;
  }

  function shippedSum(so, productId) {
    return (so.shipLines || []).filter(r => r.productId === productId).reduce((acc,r)=>acc+num(r.qtyShipped),0);
  }

  function openFulfillModal(soId) {
    const so = db.salesOrders.find(x => x.id === soId);
    if (!so) return;

    const rows = (so.lines || []).map(line => {
      const p = productById(line.productId);
      const shipped = shippedSum(so, line.productId);
      const remaining = Math.max(0, num(line.qtyPieces) - shipped);
      const pp = ppb(line.productId);
      const defBoxes = Math.floor(Math.min(remaining, num(onHand.get(line.productId)||0)) / pp);
      return { line, p, shipped, remaining, pp, defBoxes, onhand: num(onHand.get(line.productId)||0) };
    });

    openModal({
      title: `Surtir / Entregar — ${so.code}`,
      bodyHTML: `
        <div class="muted small">Captura lo entregado. Se clampa a “pendiente” y al stock disponible.</div>
        <table class="table" style="margin-top:12px">
          <thead><tr><th>Producto</th><th>Pedido</th><th>Entregado</th><th>Pendiente</th><th>Stock</th><th>PPB</th><th>Cajas</th><th>Pzas</th><th>Total</th></tr></thead>
          <tbody>
            ${rows.map((r,i)=>`
              <tr>
                <td><b>${r.p.sku}</b><div class="muted small">${r.p.name}</div></td>
                <td>${r.line.qtyPieces}</td>
                <td>${r.shipped}</td>
                <td><span class="badge ${r.remaining>0?'warn':'ok'}">${r.remaining}</span></td>
                <td>${r.onhand}</td>
                <td>${r.pp}</td>
                <td><input data-sh-boxes="${i}" type="number" step="1" value="${r.defBoxes}" /></td>
                <td><input data-sh-pieces="${i}" type="number" step="1" value="0" /></td>
                <td><span data-sh-total="${i}">0</span></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      `,
      actionsHTML: `<button class="btn" id="sh_cancel">Cancelar</button><button class="btn primary" id="sh_apply">Aplicar entrega</button>`,
      onMount: ({ root, close }) => {
        function recalc(i) {
          const b = num(root.querySelector(`[data-sh-boxes="${i}"]`).value);
          const s = num(root.querySelector(`[data-sh-pieces="${i}"]`).value);
          const productId = rows[i].line.productId;
          const total = Math.max(0, toPieces(b, s, productId));
          root.querySelector(`[data-sh-total="${i}"]`).textContent = String(total);
        }
        rows.forEach((_,i)=>{
          root.querySelector(`[data-sh-boxes="${i}"]`).addEventListener("input", ()=>recalc(i));
          root.querySelector(`[data-sh-pieces="${i}"]`).addEventListener("input", ()=>recalc(i));
          recalc(i);
        });

        root.querySelector("#sh_cancel").onclick = () => close();

        root.querySelector("#sh_apply").onclick = () => {
          if (!canFulfill) return;

          // bloquear si hay pending approvals (doble seguro)
          if ((so.lines||[]).some(l => l.approvalStatus === "PENDING")) {
            return alert("Este pedido tiene líneas pendientes de aprobación.");
          }

          rows.forEach((r,i)=>{
            const b = num(root.querySelector(`[data-sh-boxes="${i}"]`).value);
            const s = num(root.querySelector(`[data-sh-pieces="${i}"]`).value);
            let qty = Math.max(0, toPieces(b, s, r.line.productId));
            if (qty <= 0) return;

            qty = Math.min(qty, r.remaining);

            const nowOnHand = calcOnHand(branchId, warehouseId);
            const available = num(nowOnHand.get(r.line.productId) || 0);
            qty = Math.min(qty, available);
            if (qty <= 0) return;

            so.shipLines = so.shipLines || [];
            so.shipLines.push({ productId: r.line.productId, qtyShipped: qty });

            db.stockMoves.push({
              id: uid(),
              ts: new Date().toISOString(),
              date: todayISO(),
              type: "SHIP",
              productId: r.line.productId,
              qty: -qty,
              unitCost: null,
              note: `Entrega ${so.code} — ${so.customer}`,
              branchId, warehouseId,
              userId: db.currentUserId,
              ref: so.id
            });
          });

          const shippedMap = new Map();
          (so.shipLines || []).forEach(x => shippedMap.set(x.productId, (shippedMap.get(x.productId)||0) + num(x.qtyShipped)));
          const allDone = (so.lines || []).every(l => (shippedMap.get(l.productId)||0) >= num(l.qtyPieces));
          so.status = allDone ? "SHIPPED" : "PARTIAL";

          saveDB(db);
          close();
          render();
        };
      }
    });
  }

  setTimeout(() => {
    paintLines();

    function calcQtyPiecesUI() {
      const productId = $("#so_prod").value;
      const boxes = num($("#so_boxes").value);
      const pieces = num($("#so_pieces").value);
      return toPieces(boxes, pieces, productId);
    }

    function refreshComputed() {
      const customerId = $("#so_customer").value;
      const productId = $("#so_prod").value;
      const date = $("#so_date").value || todayISO();
      const qtyPieces = Math.max(1, calcQtyPiecesUI());

      const computed = getComputedPrice(customerId, productId, qtyPieces, date);
      $("#so_price").value = num(computed.computedPrice).toFixed(2);

      const src =
        computed.trace.source === "CUSTOM_OVERRIDE" ? "CUSTOM_OVERRIDE" :
        computed.trace.source === "PRICELIST" ? "PRICELIST" :
        computed.trace.source === "PRODUCT" ? "PRODUCT" : "—";

      const plSrc =
        computed.trace.priceListSource === "CUSTOMER_FIXED" ? "cliente (fija)" :
        computed.trace.priceListSource === "CHANNEL_SCHEDULE" ? "canal (vigente)" :
        "default";

      const volTxt = computed.trace.volumeDiscountPct > 0 ? `-${computed.trace.volumeDiscountPct.toFixed(2)}%` : "—";
      $("#so_vol").value = volTxt;
      $("#so_vol_hint").textContent = computed.trace.volumeRuleId
        ? `Regla volumen aplicada (tier).`
        : `Sin regla por volumen aplicable.`;

      $("#so_price_trace").textContent =
        `Fuente: ${src} | Lista: ${computed.trace.priceListId} (${plSrc}, -${computed.trace.priceListDiscountPct.toFixed(2)}%)` +
        (computed.trace.customerOverrideId ? ` | Pactado: sí` : ``);

      // reset manual (para no “arrastrar” descuentos al cambiar cosas clave)
      $("#so_disc_pct").value = "0";
      $("#so_disc_amt").value = "0";
      $("#so_override").value = "";
      $("#so_reason").value = "";

      updateFinalAndApproval();
    }

    function updateFinalAndApproval() {
      const computed = num($("#so_price").value);
      const discPct = num($("#so_disc_pct").value);
      const discAmt = num($("#so_disc_amt").value);
      const overrideRaw = $("#so_override").value;

      const final = computeFinalPrice(computed, discPct, discAmt, overrideRaw);
      $("#so_final").value = money(final);

      const changed = priceChanged(computed, final);
      const needs = needsApprovalForPriceChange(role(), computed, final);

      const note = $("#so_approval_note");
      if (!changed) {
        note.textContent = "Sin cambio manual de precio.";
      } else if (needs) {
        note.textContent = "Baja de precio: requerirá aprobación de Admin (se genera solicitud).";
      } else {
        note.textContent = "Cambio manual sin baja (no requiere aprobación).";
      }
    }

    $("#so_customer").onchange = refreshComputed;
    $("#so_prod").onchange = refreshComputed;
    $("#so_date").onchange = refreshComputed;
    $("#so_boxes").oninput = refreshComputed;  // volumen depende de cantidad
    $("#so_pieces").oninput = refreshComputed; // volumen depende de cantidad

    $("#so_disc_pct").oninput = updateFinalAndApproval;
    $("#so_disc_amt").oninput = updateFinalAndApproval;
    $("#so_override").oninput = updateFinalAndApproval;

    $("#so_scan").onclick = async () => {
      if (!canCreate) return;
      await openBarcodeScanner({
        onCode: (code) => {
          const p = productByBarcode(code);
          if (!p) return alert(`No se encontró producto con barcode: ${code}`);
          $("#so_prod").value = p.id;
          refreshComputed();
        }
      });
    };

    refreshComputed();

    $("#so_add_line").onclick = () => {
      if (!canCreate) return;

      const customerId = $("#so_customer").value;
      const customer = customerById(customerId);
      const productId = $("#so_prod").value;
      const boxes = num($("#so_boxes").value);
      const pieces = num($("#so_pieces").value);
      const qtyPieces = toPieces(boxes, pieces, productId);
      if (!customerId) return alert("Selecciona cliente.");
      if (!productId || qtyPieces <= 0) return alert("Producto y cantidad > 0.");

      const date = $("#so_date").value || todayISO();
      const computedObj = getComputedPrice(customerId, productId, qtyPieces, date);
      const computedPrice = computedObj.computedPrice;

      const discPct = num($("#so_disc_pct").value);
      const discAmt = num($("#so_disc_amt").value);
      const overrideRaw = $("#so_override").value;
      const overridePrice = (overrideRaw === "" ? null : num(overrideRaw));
      const finalPrice = computeFinalPrice(computedPrice, discPct, discAmt, overrideRaw);

      if (finalPrice <= 0) return alert("Precio final inválido.");

      const changed = priceChanged(computedPrice, finalPrice);
      const reason = $("#so_reason").value.trim();
      if (changed && !reason) return alert("Si cambias el precio, el motivo es obligatorio.");

      const approvalNeeded = needsApprovalForPriceChange(role(), computedPrice, finalPrice);

      // si requiere aprobación, se crea request en cola
      let approvalStatus = "NONE";
      let requestId = null;

      if (approvalNeeded) {
        approvalStatus = "PENDING";
        requestId = uid();

        db.priceOverrideRequests.push({
          id: requestId,
          createdAt: new Date().toISOString(),
          status: "PENDING", // PENDING | APPROVED | DENIED
          requestedByUserId: db.currentUserId,

          customerId,
          customerName: customer?.name || "Cliente",
          productId,
          productSku: productById(productId)?.sku || "",
          qtyPieces,
          orderDate: date,

          computedPrice: num(computedPrice),
          requestedFinalPrice: num(finalPrice),
          reason,

          manual: {
            discountPct: discPct,
            discountAmt: discAmt,
            overridePrice
          },

          decision: { decidedByUserId: null, decidedAt: null, note: "" },

          // se ligará a pedido cuando se cree
          salesOrderId: null,
          salesOrderLineId: null,
        });
      }

      tempLines.push({
        id: uid(),
        customerId,
        productId,
        boxes,
        pieces,
        qtyPieces,

        computedPrice: num(computedPrice),
        computedTrace: computedObj.trace,

        discountPct: discPct,
        discountAmt: discAmt,
        overridePrice,

        finalPrice: num(finalPrice),
        reason: changed ? reason : "",

        approvalStatus,
        approvalRequestId: requestId
      });

      paintLines();
    };

    $("#so_create").onclick = () => {
      if (!canCreate) return;

      const customerId = $("#so_customer").value;
      const customer = customerById(customerId);
      const customerName = customer ? customer.name : "Cliente";
      const date = $("#so_date").value || todayISO();
      if (tempLines.length === 0) return alert("Agrega al menos 1 línea.");

      const soId = uid();
      const code = `SO-${String(db.salesOrders.length + 1).padStart(5, "0")}`;

      // ligar requests pendientes al pedido
      tempLines.forEach(l => {
        if (l.approvalStatus === "PENDING" && l.approvalRequestId) {
          const req = db.priceOverrideRequests.find(r => r.id === l.approvalRequestId);
          if (req) {
            req.salesOrderId = soId;
            req.salesOrderLineId = l.id;
          }
        }
      });

      const hasPending = tempLines.some(l => l.approvalStatus === "PENDING");

      db.salesOrders.push({
        id: soId,
        code,
        customerId,
        customer: customerName,
        date,
        status: hasPending ? "PENDING_APPROVAL" : "OPEN",
        branchId,
        warehouseId,
        userId: db.currentUserId,
        lines: tempLines,
        shipLines: []
      });

      tempLines = [];
      saveDB(db);
      render();
    };

    el.querySelectorAll("button[data-fulfill]").forEach(btn => {
      btn.onclick = () => openFulfillModal(btn.getAttribute("data-fulfill"));
    });

  }, 0);

  return el;
}

function viewWaste() {
  const allowed = canAction("WASTE");
  const branchId = "BR-001";
  const warehouseId = "WH-001";

  const el = document.createElement("div");
  el.className = "grid cols2";

  const form = card("Registrar merma (con escaneo)", `
    <div class="row">
      <div class="field">
        <label>Producto</label>
        <select id="w_prod" ${allowed ? "" : "disabled"}>
          ${db.products.map(p => `<option value="${p.id}">${p.sku} — ${p.name}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>Escanear</label>
        <button class="btn secondary" id="w_scan" ${allowed ? "" : "disabled"}>Escanear</button>
      </div>
      <div class="field"><label>Cantidad (pzas)</label><input id="w_qty" type="number" step="1" value="1" ${allowed ? "" : "disabled"} /></div>
      <div class="field">
        <label>Motivo</label>
        <select id="w_reason" ${allowed ? "" : "disabled"}>
          <option value="CADUCIDAD">Caducidad</option>
          <option value="DANIADO">Dañado</option>
          <option value="OBSOLETO">Obsoleto / No se vendió</option>
        </select>
      </div>
    </div>
    <div class="row">
      <div class="field"><label>Nota</label><input id="w_note" placeholder="Detalle" ${allowed ? "" : "disabled"} /></div>
      <button class="btn danger" id="w_add" ${allowed ? "" : "disabled title='Sin permiso'"}>Registrar merma</button>
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
    $("#w_scan").onclick = async () => {
      if (!allowed) return;
      await openBarcodeScanner({
        onCode: (code) => {
          const p = productByBarcode(code);
          if (!p) return alert(`No se encontró producto con barcode: ${code}`);
          $("#w_prod").value = p.id;
        }
      });
    };

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
        <select id="b_prod" ${allowed ? "" : "disabled"}>
          ${db.products.map(p => `<option value="${p.id}">${p.sku} — ${p.name}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>Competidor / Tienda</label><input id="b_store" placeholder="Ej: Tienda X" ${allowed ? "" : "disabled"} /></div>
      <div class="field"><label>Precio observado</label><input id="b_price" type="number" step="0.01" placeholder="0.00" ${allowed ? "" : "disabled"} /></div>
    </div>
    <div class="row">
      <div class="field"><label>Nota</label><input id="b_note" placeholder="Promo, presentación, etc." ${allowed ? "" : "disabled"} /></div>
      <button class="btn primary" id="b_add" ${allowed ? "" : "disabled title='Sin permiso'"}>Guardar</button>
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

/* ---------- PRICING (Admin): A + B + C) ---------- */
function viewPricing() {
  const allowed = canAction("MANAGE_PRICING");
  const CHANNELS = [
    { id: "TIENDA", label: "Tienda" },
    { id: "DISTRIBUIDOR", label: "Distribuidor" },
    { id: "CLAVE", label: "Cuenta clave" }
  ];

  const pending = db.priceOverrideRequests
    .filter(r => r.status === "PENDING")
    .sort((a,b)=> (b.createdAt||"").localeCompare(a.createdAt||""));

  const el = document.createElement("div");
  el.className = "grid cols2";

  const listsCard = card("Listas + Canales (A)", `
    <div class="muted small">
      Si el cliente tiene <b>lista fija</b>, gana. Si no, se usa <b>canal schedule</b> vigente por fecha del pedido.
    </div>

    <div class="hr"></div>

    <div class="row">
      <div class="field"><label>Nueva lista</label><input id="pl_name" placeholder="Ej: Mayoreo 2" ${allowed ? "" : "disabled"} /></div>
      <div class="field"><label>Descuento %</label><input id="pl_disc" type="number" step="0.01" value="0" ${allowed ? "" : "disabled"} /></div>
      <button class="btn primary" id="pl_add" ${allowed ? "" : "disabled"}>Crear</button>
    </div>

    <div class="hr"></div>

    <table class="table">
      <thead><tr><th>ID</th><th>Nombre</th><th>Desc %</th></tr></thead>
      <tbody>
        ${db.priceLists.map(pl => `
          <tr>
            <td class="muted">${pl.id}</td>
            <td>${pl.name}</td>
            <td>${num(pl.discountPct).toFixed(2)}%</td>
          </tr>
        `).join("")}
      </tbody>
    </table>

    <div class="hr"></div>

    <div class="muted small"><b>Canal schedules</b> (vigencia)</div>

    <div class="row" style="margin-top:10px">
      <div class="field">
        <label>Canal</label>
        <select id="cs_channel" ${allowed ? "" : "disabled"}>
          ${CHANNELS.map(c => `<option value="${c.id}">${c.label}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>Lista</label>
        <select id="cs_pl" ${allowed ? "" : "disabled"}>
          ${db.priceLists.map(pl => `<option value="${pl.id}">${pl.id} — ${pl.name}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>Inicio</label><input id="cs_start" type="date" value="${todayISO()}" ${allowed ? "" : "disabled"} /></div>
      <div class="field"><label>Fin</label><input id="cs_end" type="date" value="2026-12-31" ${allowed ? "" : "disabled"} /></div>
      <button class="btn primary" id="cs_add" ${allowed ? "" : "disabled"}>Agregar</button>
    </div>

    <table class="table" style="margin-top:10px">
      <thead><tr><th>Canal</th><th>Lista</th><th>Inicio</th><th>Fin</th><th></th></tr></thead>
      <tbody>
        ${db.channelPriceSchedules.map(s => `
          <tr>
            <td>${s.channel}</td>
            <td>${s.priceListId}</td>
            <td>${s.startDate || "—"}</td>
            <td>${s.endDate || "—"}</td>
            <td><button class="btn danger" data-cs-del="${s.id}" ${allowed ? "" : "disabled"}>X</button></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `);

  const customersCard = card("Clientes + Pactados + Volumen + Aprobaciones (B+C)", `
    <div class="muted small"><b>Clientes</b> (canal + lista fija opcional)</div>

    <div class="row" style="margin-top:10px">
      <div class="field"><label>Nuevo cliente</label><input id="c_name" placeholder="Ej: Tienda Norte" ${allowed ? "" : "disabled"} /></div>
      <div class="field">
        <label>Canal</label>
        <select id="c_channel" ${allowed ? "" : "disabled"}>
          ${CHANNELS.map(c => `<option value="${c.id}">${c.label}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>Lista fija (opcional)</label>
        <select id="c_pl" ${allowed ? "" : "disabled"}>
          <option value="">(usar canal schedule)</option>
          ${db.priceLists.map(pl => `<option value="${pl.id}">${pl.id} — ${pl.name}</option>`).join("")}
        </select>
      </div>
      <button class="btn primary" id="c_add" ${allowed ? "" : "disabled"}>Agregar</button>
    </div>

    <table class="table" style="margin-top:10px">
      <thead><tr><th>Cliente</th><th>Canal</th><th>Lista fija</th></tr></thead>
      <tbody>
        ${db.customers.map(c => `
          <tr>
            <td>${c.name}</td>
            <td class="muted">${c.channel}</td>
            <td class="muted">${c.priceListId ? c.priceListId : "(canal schedule)"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>

    <div class="hr"></div>

    <div class="muted small"><b>Pactado cliente+producto</b> (override base)</div>
    <div class="row" style="margin-top:10px">
      <div class="field">
        <label>Cliente</label>
        <select id="ov_customer" ${allowed ? "" : "disabled"}>
          ${db.customers.map(c => `<option value="${c.id}">${c.name}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>Producto</label>
        <select id="ov_prod" ${allowed ? "" : "disabled"}>
          ${db.products.map(p => `<option value="${p.id}">${p.sku} — ${p.name}</option>`).join("")}
        </select>
      </div>
    </div>

    <div class="row">
      <div class="field"><label>Precio pactado (pza)</label><input id="ov_price" type="number" step="0.01" ${allowed ? "" : "disabled"} /></div>
      <div class="field" style="flex:2"><label>Motivo</label><input id="ov_reason" ${allowed ? "" : "disabled"} /></div>
      <button class="btn primary" id="ov_save" ${allowed ? "" : "disabled"}>Guardar pactado</button>
    </div>

    <table class="table" style="margin-top:10px">
      <thead><tr><th>Cliente</th><th>Producto</th><th>Precio</th><th>Motivo</th><th></th></tr></thead>
      <tbody>
        ${db.customerPriceOverrides.map(o => {
          const c = customerById(o.customerId);
          const p = productById(o.productId);
          return `<tr>
            <td>${c ? c.name : o.customerId}</td>
            <td>${p ? p.sku : o.productId}</td>
            <td>${money(o.basePrice)}</td>
            <td class="muted">${o.reason || "—"}</td>
            <td><button class="btn danger" data-ov-del="${o.id}" ${allowed ? "" : "disabled"}>X</button></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>

    <div class="hr"></div>

    <div class="muted small"><b>Reglas por volumen</b> (tiers) (B)</div>
    <div class="row" style="margin-top:10px">
      <div class="field">
        <label>Producto</label>
        <select id="vr_prod" ${allowed ? "" : "disabled"}>
          <option value="">(todos)</option>
          ${db.products.map(p => `<option value="${p.id}">${p.sku}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>Min cajas</label><input id="vr_min_boxes" type="number" step="1" value="5" ${allowed ? "" : "disabled"} /></div>
      <div class="field"><label>Desc %</label><input id="vr_disc" type="number" step="0.01" value="2.0" ${allowed ? "" : "disabled"} /></div>
      <div class="field"><label>Inicio</label><input id="vr_start" type="date" value="${todayISO()}" ${allowed ? "" : "disabled"} /></div>
      <div class="field"><label>Fin</label><input id="vr_end" type="date" value="2026-12-31" ${allowed ? "" : "disabled"} /></div>
      <button class="btn primary" id="vr_add" ${allowed ? "" : "disabled"}>Agregar regla</button>
    </div>

    <table class="table" style="margin-top:10px">
      <thead><tr><th>Producto</th><th>Min cajas</th><th>Desc %</th><th>Inicio</th><th>Fin</th><th></th></tr></thead>
      <tbody>
        ${db.volumeRules.map(r => {
          const p = r.productId ? productById(r.productId) : null;
          return `<tr>
            <td class="muted">${p ? p.sku : "(todos)"}</td>
            <td>${num(r.minBoxes)}</td>
            <td>${num(r.discountPct).toFixed(2)}%</td>
            <td>${r.startDate || "—"}</td>
            <td>${r.endDate || "—"}</td>
            <td><button class="btn danger" data-vr-del="${r.id}" ${allowed ? "" : "disabled"}>X</button></td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>

    <div class="hr"></div>

    <div class="muted small"><b>Solicitudes de precio</b> (C)</div>
    <div class="muted small">Si apruebas, el pedido sale de PENDING_APPROVAL automáticamente.</div>

    <table class="table" style="margin-top:10px">
      <thead><tr><th>Fecha</th><th>Pedido</th><th>Cliente</th><th>SKU</th><th>Cant</th><th>Calc</th><th>Solic</th><th>Motivo</th><th>Acción</th></tr></thead>
      <tbody>
        ${pending.length ? pending.map(r => {
          const so = r.salesOrderId ? db.salesOrders.find(x => x.id === r.salesOrderId) : null;
          const soCode = so ? so.code : "—";
          return `<tr>
            <td class="muted">${(r.createdAt||"").slice(0,10)}</td>
            <td>${soCode}</td>
            <td>${r.customerName}</td>
            <td>${r.productSku}</td>
            <td>${r.qtyPieces}</td>
            <td>${money(r.computedPrice)}</td>
            <td><b>${money(r.requestedFinalPrice)}</b></td>
            <td class="muted">${r.reason}</td>
            <td>
              <button class="btn primary" data-req-approve="${r.id}">Aprobar</button>
              <button class="btn danger" data-req-deny="${r.id}">Denegar</button>
            </td>
          </tr>`;
        }).join("") : `<tr><td colspan="9" class="muted">Sin pendientes.</td></tr>`}
      </tbody>
    </table>
  `);

  el.appendChild(listsCard);
  el.appendChild(customersCard);

  setTimeout(() => {
    // listas
    $("#pl_add").onclick = () => {
      if (!allowed) return;
      const name = $("#pl_name").value.trim();
      const disc = num($("#pl_disc").value);
      if (!name) return alert("Nombre requerido.");
      if (disc < 0 || disc > 80) return alert("Descuento fuera de rango (0–80%).");
      const next = `PL-${String(db.priceLists.length + 1).padStart(3, "0")}`;
      db.priceLists.push({ id: next, name, discountPct: disc });
      saveDB(db); render();
    };

    // canal schedules
    $("#cs_add").onclick = () => {
      if (!allowed) return;
      const channel = $("#cs_channel").value;
      const priceListId = $("#cs_pl").value;
      const startDate = $("#cs_start").value || todayISO();
      const endDate = $("#cs_end").value || "9999-12-31";
      db.channelPriceSchedules.push({ id: uid(), channel, priceListId, startDate, endDate });
      saveDB(db); render();
    };
    document.querySelectorAll("button[data-cs-del]").forEach(btn => {
      btn.onclick = () => {
        if (!allowed) return;
        const id = btn.getAttribute("data-cs-del");
        db.channelPriceSchedules = db.channelPriceSchedules.filter(x => x.id !== id);
        saveDB(db); render();
      };
    });

    // clientes
    $("#c_add").onclick = () => {
      if (!allowed) return;
      const name = $("#c_name").value.trim();
      const channel = $("#c_channel").value;
      const priceListId = $("#c_pl").value || "";
      if (!name) return alert("Nombre de cliente requerido.");
      const next = `C-${String(db.customers.length + 1).padStart(3, "0")}`;
      db.customers.push({ id: next, name, channel, priceListId });
      saveDB(db); render();
    };

    // pactados
    $("#ov_save").onclick = () => {
      if (!allowed) return;
      const customerId = $("#ov_customer").value;
      const productId = $("#ov_prod").value;
      const price = num($("#ov_price").value);
      const reason = $("#ov_reason").value.trim();
      if (!customerId || !productId) return alert("Selecciona cliente y producto.");
      if (price <= 0) return alert("Precio pactado inválido.");
      if (!reason) return alert("Motivo requerido.");

      const existing = db.customerPriceOverrides.find(o => o.customerId === customerId && o.productId === productId);
      if (existing) {
        existing.basePrice = price;
        existing.reason = reason;
        existing.updatedAt = new Date().toISOString();
        existing.userId = db.currentUserId;
      } else {
        db.customerPriceOverrides.push({
          id: uid(),
          customerId, productId, basePrice: price, reason,
          updatedAt: new Date().toISOString(),
          userId: db.currentUserId
        });
      }
      saveDB(db); render();
    };
    document.querySelectorAll("button[data-ov-del]").forEach(btn => {
      btn.onclick = () => {
        if (!allowed) return;
        const id = btn.getAttribute("data-ov-del");
        db.customerPriceOverrides = db.customerPriceOverrides.filter(x => x.id !== id);
        saveDB(db); render();
      };
    });

    // volumen
    $("#vr_add").onclick = () => {
      if (!allowed) return;
      const productId = $("#vr_prod").value || "";
      const minBoxes = Math.max(1, num($("#vr_min_boxes").value));
      const discountPct = num($("#vr_disc").value);
      const startDate = $("#vr_start").value || todayISO();
      const endDate = $("#vr_end").value || "9999-12-31";
      if (discountPct <= 0 || discountPct > 50) return alert("Descuento volumen fuera de rango (0–50%).");
      db.volumeRules.push({ id: uid(), productId, minBoxes, discountPct, startDate, endDate });
      saveDB(db); render();
    };
    document.querySelectorAll("button[data-vr-del]").forEach(btn => {
      btn.onclick = () => {
        if (!allowed) return;
        const id = btn.getAttribute("data-vr-del");
        db.volumeRules = db.volumeRules.filter(x => x.id !== id);
        saveDB(db); render();
      };
    });

    // aprobaciones
    function finalizeOrderStatusIfReady(salesOrderId) {
      const so = db.salesOrders.find(x => x.id === salesOrderId);
      if (!so) return;
      const hasPending = (so.lines||[]).some(l => l.approvalStatus === "PENDING");
      if (!hasPending && so.status === "PENDING_APPROVAL") so.status = "OPEN";
    }

    document.querySelectorAll("button[data-req-approve]").forEach(btn => {
      btn.onclick = () => {
        if (!allowed) return;
        const id = btn.getAttribute("data-req-approve");
        const req = db.priceOverrideRequests.find(r => r.id === id);
        if (!req) return;

        req.status = "APPROVED";
        req.decision = { decidedByUserId: db.currentUserId, decidedAt: new Date().toISOString(), note: "Aprobado" };

        // aplicar al pedido/linea
        const so = req.salesOrderId ? db.salesOrders.find(x => x.id === req.salesOrderId) : null;
        if (so) {
          const line = (so.lines||[]).find(l => l.id === req.salesOrderLineId);
          if (line) {
            line.finalPrice = num(req.requestedFinalPrice);
            line.approvalStatus = "APPROVED";
            line.approvedByUserId = db.currentUserId;
            line.approvedAt = req.decision.decidedAt;
          }
          finalizeOrderStatusIfReady(so.id);
        }

        saveDB(db); render();
      };
    });

    document.querySelectorAll("button[data-req-deny]").forEach(btn => {
      btn.onclick = () => {
        if (!allowed) return;
        const id = btn.getAttribute("data-req-deny");
        const req = db.priceOverrideRequests.find(r => r.id === id);
        if (!req) return;

        req.status = "DENIED";
        req.decision = { decidedByUserId: db.currentUserId, decidedAt: new Date().toISOString(), note: "Denegado" };

        const so = req.salesOrderId ? db.salesOrders.find(x => x.id === req.salesOrderId) : null;
        if (so) {
          const line = (so.lines||[]).find(l => l.id === req.salesOrderLineId);
          if (line) {
            // revertir a precio calculado y limpiar manuales (para que no “siga” el descuento)
            line.finalPrice = num(req.computedPrice);
            line.discountPct = 0;
            line.discountAmt = 0;
            line.overridePrice = null;
            line.reason = `${line.reason} (DENIED: revertido a calculado)`.slice(0, 200);
            line.approvalStatus = "DENIED";
            line.deniedByUserId = db.currentUserId;
            line.deniedAt = req.decision.decidedAt;
          }
          finalizeOrderStatusIfReady(so.id);
        }

        saveDB(db); render();
      };
    });

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
  const fallback = ["sales","purchases","waste","benchmark","inventory","products","pricing","dashboard"];
  for (const t of fallback) { if (canView(t)) { currentTab = t; break; } }
  render();
})();
