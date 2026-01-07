/* app.js — Chilchota Demo (local, sin servidor)
   Roles:
   - admin: todo + KPI + catálogo
   - warehouse: inventario + movimientos + recibir OC / surtir pedidos
   - seller: pedidos + órdenes de compra + merma (escaneo/manual)

   Unidades:
   - Inventario en PIEZAS (qtyPieces)
   - Empaque por SKU: piecesPerBox (pzas por caja)
   - Precio demo: por PIEZA (basePrice)
*/

(() => {
  "use strict";

  // ===== Branding (colores Chilchota) =====
  const BRAND = {
    primary: "#CC0000",
    accent: "#8BB9FE",
  };
  document.documentElement.style.setProperty("--chilchota-primary", BRAND.primary);
  document.documentElement.style.setProperty("--chilchota-accent", BRAND.accent);

  // ===== Utils =====
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const uid = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const nowISO = () => new Date().toISOString();
  const fmtMoney = (n) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(Number(n || 0));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const safeNum = (v, d = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  };

  // ===== Storage =====
  const STORAGE_KEY = "chilchota_demo_v2";

  function loadDB() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function saveDB(db) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  }

  // ===== Seed: catálogo (nombres reales; precios DEMO por pieza) =====
  const CHILCHOTA_PRODUCTS = [
    // QUESOS FRESCOS
    { id: "CH-001", name: "Jocoque Jarro Chilchota", category: "Quesos Frescos", piecesPerBox: 12, basePrice: 2.4 },
    { id: "CH-002", name: "Jocoque Seco Chilchota", category: "Quesos Frescos", piecesPerBox: 12, basePrice: 2.7 },
    { id: "CH-003", name: "Jocoque Seco con Cilantro y Perejil", category: "Quesos Frescos", piecesPerBox: 12, basePrice: 2.8 },
    { id: "CH-004", name: "Jocoque Seco con Chipotle Chilchota", category: "Quesos Frescos", piecesPerBox: 12, basePrice: 2.8 },
    { id: "CH-005", name: "Jocoque Seco con Jalapeño Chilchota", category: "Quesos Frescos", piecesPerBox: 12, basePrice: 2.8 },
    { id: "CH-006", name: "Jocoque Seco con Mezcla de Chiles Chilchota", category: "Quesos Frescos", piecesPerBox: 12, basePrice: 2.8 },
    { id: "CH-007", name: "Queso Cottage Chilchota", category: "Quesos Frescos", piecesPerBox: 12, basePrice: 2.2 },
    { id: "CH-008", name: "Micro Canasto Chilchota", category: "Quesos Frescos", piecesPerBox: 12, basePrice: 1.6 },
    { id: "CH-009", name: "Mini Canasto Chilchota", category: "Quesos Frescos", piecesPerBox: 12, basePrice: 1.9 },
    { id: "CH-010", name: "Doble Crema Chilchota", category: "Quesos Frescos", piecesPerBox: 12, basePrice: 3.1 },
    { id: "CH-011", name: "Ranchero Chilchota", category: "Quesos Frescos", piecesPerBox: 12, basePrice: 2.9 },
    { id: "CH-012", name: "Sierra Chilchota", category: "Quesos Frescos", piecesPerBox: 12, basePrice: 3.0 },
    { id: "CH-013", name: "Queso Panela Canasta Chilchota", category: "Quesos Frescos", piecesPerBox: 12, basePrice: 3.2 },
    { id: "CH-014", name: "Queso Panela Suiza Chilchota", category: "Quesos Frescos", piecesPerBox: 12, basePrice: 3.3 },
    { id: "CH-015", name: "Requesón Chilchota", category: "Quesos Frescos", piecesPerBox: 12, basePrice: 2.5 },

    // QUESOS FINOS
    { id: "CH-101", name: "Queso Fontina", category: "Quesos Finos", piecesPerBox: 6, basePrice: 5.5 },
    { id: "CH-102", name: "Queso Adobera Chilchota", category: "Quesos Finos", piecesPerBox: 12, basePrice: 3.6 },
    { id: "CH-103", name: "Queso Asadero Chilchota", category: "Quesos Finos", piecesPerBox: 12, basePrice: 4.0 },
    { id: "CH-104", name: "Queso Chihuahua Chilchota", category: "Quesos Finos", piecesPerBox: 12, basePrice: 4.1 },
    { id: "CH-105", name: "Queso Crema Tipo Chiapas Chilchota", category: "Quesos Finos", piecesPerBox: 12, basePrice: 3.4 },
    { id: "CH-106", name: "Queso Fresco Artesanal de Cabra Chilchota", category: "Quesos Finos", piecesPerBox: 6, basePrice: 6.2 },
    { id: "CH-107", name: "Queso Fresco Artesanal de Cabra con Jalapeño Chilchota", category: "Quesos Finos", piecesPerBox: 6, basePrice: 6.4 },
    { id: "CH-108", name: "Queso Maduro de Cabra Chilchota", category: "Quesos Finos", piecesPerBox: 6, basePrice: 7.2 },
    { id: "CH-109", name: "Queso Sierra Chilchota", category: "Quesos Finos", piecesPerBox: 12, basePrice: 4.3 },
    { id: "CH-110", name: "Queso Tipo Boursin Chilchota", category: "Quesos Finos", piecesPerBox: 12, basePrice: 2.8 },
    { id: "CH-111", name: "Queso Tipo Boursin con Ajonjolí Chilchota", category: "Quesos Finos", piecesPerBox: 12, basePrice: 2.9 },
    { id: "CH-112", name: "Queso Tipo Boursin con Cebolla Chilchota", category: "Quesos Finos", piecesPerBox: 12, basePrice: 2.9 },
    { id: "CH-113", name: "Queso Tipo Boursin con Ceniza Chilchota", category: "Quesos Finos", piecesPerBox: 12, basePrice: 3.0 },
    { id: "CH-114", name: "Queso Tipo Boursin con Chile Chilchota", category: "Quesos Finos", piecesPerBox: 12, basePrice: 2.9 },
    { id: "CH-115", name: "Queso Tipo Boursin con Finas Hierbas Chilchota", category: "Quesos Finos", piecesPerBox: 12, basePrice: 2.9 },
    { id: "CH-116", name: "Queso Tipo Boursin con Pimienta Chilchota", category: "Quesos Finos", piecesPerBox: 12, basePrice: 2.9 },
    { id: "CH-117", name: "Queso tipo Cotija Chilchota", category: "Quesos Finos", piecesPerBox: 12, basePrice: 3.9 },
    { id: "CH-118", name: "Queso tipo Manchego Chilchota", category: "Quesos Finos", piecesPerBox: 12, basePrice: 4.0 },
    { id: "CH-119", name: "Queso tipo Manchego con Chipotle Chilchota", category: "Quesos Finos", piecesPerBox: 12, basePrice: 4.2 },
    { id: "CH-120", name: "Queso tipo Port Salut Chilchota", category: "Quesos Finos", piecesPerBox: 12, basePrice: 4.4 },

    // LAMINADOS
    { id: "CH-201", name: "Queso Oaxaca Laminado Chilchota", category: "Quesos Laminados", piecesPerBox: 10, basePrice: 4.8 },
    { id: "CH-202", name: "Queso Panela Laminado Chilchota", category: "Quesos Laminados", piecesPerBox: 10, basePrice: 4.2 },
    { id: "CH-203", name: "Queso Chihuahua Laminado Chilchota", category: "Quesos Laminados", piecesPerBox: 10, basePrice: 4.6 },
    { id: "CH-204", name: "Queso tipo Manchego Laminado Chilchota", category: "Quesos Laminados", piecesPerBox: 10, basePrice: 4.9 },

    // LECHES / BEBIDAS LÁCTEAS
    { id: "CH-301", name: "Leche Entera Pasteurizada Chilchota 1 L", category: "Leches", piecesPerBox: 12, basePrice: 2.0 },
    { id: "CH-302", name: "Bebida Láctea Sabor Chocolate", category: "Leches", piecesPerBox: 12, basePrice: 1.7 },
    { id: "CH-303", name: "Producto Lácteo Combinado (LecheMAX)", category: "Leches", piecesPerBox: 12, basePrice: 1.9 },

    // CREMAS
    { id: "CH-401", name: "Crema Chilchota 250 ml", category: "Cremas", piecesPerBox: 12, basePrice: 2.1 },
    { id: "CH-402", name: "Crema para Batir Líquida Chilchota Bolsa", category: "Cremas Pasteleras", piecesPerBox: 6, basePrice: 6.2 },
    { id: "CH-403", name: "Crema para Batir Líquida Chilchota Botella", category: "Cremas Pasteleras", piecesPerBox: 6, basePrice: 6.8 },
    { id: "CH-404", name: "Crema para Batir Pastelera Cubeta Chilchota 4 kg", category: "Cremas Pasteleras", piecesPerBox: 1, basePrice: 28.0 },
    { id: "CH-405", name: "Crema para Batir Pastelera Cubeta Chilchota 19 kg", category: "Cremas Pasteleras", piecesPerBox: 1, basePrice: 120.0 },

    // YOGHURTS
    { id: "CH-501", name: "Yoghurt Griego con Fresa Chilchota", category: "Yoghurts Griego", piecesPerBox: 12, basePrice: 2.3 },
    { id: "CH-502", name: "Yoghurt Griego Natural con Endulzante", category: "Yoghurts Griego", piecesPerBox: 12, basePrice: 2.2 },
    { id: "CH-503", name: "Yoghurt Griego Natural Deslactosado", category: "Yoghurts Griego", piecesPerBox: 12, basePrice: 2.2 },
    { id: "CH-504", name: "Yoghurt Natural 110 g", category: "Yoghurts Natural", piecesPerBox: 12, basePrice: 1.1 },
    { id: "CH-505", name: "Yoghurt Natural 150 g", category: "Yoghurts Natural", piecesPerBox: 12, basePrice: 1.3 },
    { id: "CH-506", name: "Yoghurt Natural 1 kg", category: "Yoghurts Natural", piecesPerBox: 6, basePrice: 4.4 },
    { id: "CH-507", name: "Yoghurt 6 Pack", category: "Yoghurts Sabores", piecesPerBox: 6, basePrice: 5.2 },
    { id: "CH-508", name: "Yoghurt 1 kg", category: "Yoghurts Sabores", piecesPerBox: 6, basePrice: 4.7 },
    { id: "CH-509", name: "Yoghurt 4 kg", category: "Yoghurts Sabores", piecesPerBox: 1, basePrice: 18.0 },

    // MANTEQUILLAS Y MARGARINAS
    { id: "CH-601", name: "Mantequilla Chilchota Untable 225 g", category: "Mantequillas y Margarinas", piecesPerBox: 12, basePrice: 3.2 },
    { id: "CH-602", name: "Mantequilla Chilchota Barra 250 g", category: "Mantequillas y Margarinas", piecesPerBox: 12, basePrice: 3.3 },
    { id: "CH-603", name: "Mantequilla Chilchota Barra 90 g", category: "Mantequillas y Margarinas", piecesPerBox: 24, basePrice: 1.5 },
    { id: "CH-604", name: "Mantequilla Chilchota 1 kg", category: "Mantequillas y Margarinas", piecesPerBox: 6, basePrice: 9.8 },
    { id: "CH-605", name: "Margarina Chilchota Bizcocho 1 kg", category: "Mantequillas y Margarinas", piecesPerBox: 6, basePrice: 7.9 },
    { id: "CH-606", name: "Margarina Untable Chilchota (varios)", category: "Mantequillas y Margarinas", piecesPerBox: 12, basePrice: 2.6 },
    { id: "CH-607", name: "Margarina Chilchota Danés 1 kg", category: "Mantequillas y Margarinas", piecesPerBox: 6, basePrice: 8.1 },
    { id: "CH-608", name: "Margarina Chilchota Hojaldre 1 kg", category: "Mantequillas y Margarinas", piecesPerBox: 6, basePrice: 8.1 },
    { id: "CH-609", name: "Margarina Chilchota sin Sal 1 kg", category: "Mantequillas y Margarinas", piecesPerBox: 6, basePrice: 8.1 },
    { id: "CH-610", name: "Margarina Chilchota Barra 90 g", category: "Mantequillas y Margarinas", piecesPerBox: 24, basePrice: 1.3 },
    { id: "CH-611", name: "Margarina Chilchota Light (varios)", category: "Mantequillas y Margarinas", piecesPerBox: 12, basePrice: 2.3 },

    // BEBIDAS REFRESCANTES
    { id: "CH-701", name: "Bebida Refrescante Limón Chilchota", category: "Bebidas Refrescantes", piecesPerBox: 12, basePrice: 1.4 },
    { id: "CH-702", name: "Bebida Refrescante Mandarina Chilchota", category: "Bebidas Refrescantes", piecesPerBox: 12, basePrice: 1.4 },
    { id: "CH-703", name: "Bebida Refrescante Naranja Chilchota", category: "Bebidas Refrescantes", piecesPerBox: 12, basePrice: 1.4 },
    { id: "CH-704", name: "Bebida Refrescante Toronja Chilchota", category: "Bebidas Refrescantes", piecesPerBox: 12, basePrice: 1.4 },
    { id: "CH-705", name: "Bebida Refrescante Uva Chilchota", category: "Bebidas Refrescantes", piecesPerBox: 12, basePrice: 1.4 },
    { id: "CH-706", name: "Jugo de Naranja Reconstituido Chilchota", category: "Bebidas Refrescantes", piecesPerBox: 12, basePrice: 1.8 },
  ];

  function defaultUsers() {
    return [
      { id: "U-ADMIN", name: "Admin", role: "admin" },
      { id: "U-WH", name: "Warehouse", role: "warehouse" },
      { id: "U-SELL", name: "Vendedor", role: "seller" },
    ];
  }

  function createEmptyDB() {
    const products = [...CHILCHOTA_PRODUCTS].sort((a, b) => a.name.localeCompare(b.name, "es"));
    const inventory = {};
    // inventario demo pequeño (en piezas)
    products.slice(0, 18).forEach((p, i) => {
      inventory[p.id] = (p.piecesPerBox || 12) * (i % 3); // 0, 1 o 2 cajas
    });

    return {
      version: 2,
      currentUserId: "U-ADMIN",
      users: defaultUsers(),
      products,
      inventory, // { [productId]: qtyPieces }
      movements: [], // bitácora
      orders: [], // pedidos (salida)
      purchaseOrders: [], // ordenes de compra (entrada)
      waste: [], // mermas
      audit: [], // eventos simples
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
  }

  let db = loadDB();
  if (!db || db.version !== 2) {
    db = createEmptyDB();
    saveDB(db);
  }

  // ===== Permissions =====
  function getUser() {
    return db.users.find((u) => u.id === db.currentUserId) || db.users[0];
  }

  function can(action) {
    const role = getUser().role;
    const matrix = {
      view_all: ["admin"],
      view_kpi: ["admin"],
      manage_catalog: ["admin"],
      create_order: ["admin", "seller"],
      create_po: ["admin", "seller"],
      log_waste: ["admin", "seller"],
      adjust_inventory: ["admin", "warehouse"],
      control_movements: ["admin", "warehouse"],
      receive_po: ["admin", "warehouse"],
      ship_order: ["admin", "warehouse"],
    };
    return (matrix[action] || []).includes(role);
  }

  // ===== Domain helpers =====
  function productById(id) {
    return db.products.find((p) => p.id === id);
  }

  function invQty(productId) {
    return safeNum(db.inventory[productId], 0);
  }

  function setInvQty(productId, qtyPieces) {
    db.inventory[productId] = Math.max(0, Math.floor(qtyPieces));
  }

  function addMovement({ type, productId, qtyPieces, refType, refId, note }) {
    const m = {
      id: uid(),
      ts: nowISO(),
      userId: getUser().id,
      type, // IN | OUT | ADJUST | WASTE
      productId,
      qtyPieces: Math.floor(qtyPieces),
      refType: refType || "",
      refId: refId || "",
      note: note || "",
    };
    db.movements.unshift(m);
  }

  function applyDelta(productId, deltaPieces, meta) {
    const before = invQty(productId);
    const after = before + Math.floor(deltaPieces);
    setInvQty(productId, after);
    if (meta?.movement) addMovement(meta.movement);
  }

  function audit(msg) {
    db.audit.unshift({ id: uid(), ts: nowISO(), userId: getUser().id, msg });
  }

  function persist() {
    db.updatedAt = nowISO();
    saveDB(db);
  }

  // ===== UI: Tabs =====
  const TAB_DEFS = [
    { id: "orders", label: "Pedidos", allowed: () => can("create_order") || can("ship_order") || can("view_all") },
    { id: "po", label: "Órdenes de compra", allowed: () => can("create_po") || can("receive_po") || can("view_all") },
    { id: "waste", label: "Merma", allowed: () => can("log_waste") || can("view_all") },
    { id: "inventory", label: "Inventario", allowed: () => can("adjust_inventory") || can("view_all") },
    { id: "movements", label: "Movimientos", allowed: () => can("control_movements") || can("view_all") },
    { id: "kpi", label: "KPI", allowed: () => can("view_kpi") },
    { id: "catalog", label: "Catálogo", allowed: () => can("manage_catalog") },
  ];

  let currentTab = "orders";

  function renderTabs() {
    const tabsEl = $("#tabs");
    tabsEl.innerHTML = "";

    const allowedTabs = TAB_DEFS.filter((t) => t.allowed());
    if (!allowedTabs.some((t) => t.id === currentTab)) currentTab = allowedTabs[0]?.id || "inventory";

    allowedTabs.forEach((t) => {
      const btn = document.createElement("button");
      btn.className = "tab" + (t.id === currentTab ? " active" : "");
      btn.textContent = t.label;
      btn.addEventListener("click", () => {
        currentTab = t.id;
        renderTabs();
        renderView();
      });
      tabsEl.appendChild(btn);
    });
  }

  // ===== UI: User select + reset =====
  function renderUserSelect() {
    const sel = $("#userSelect");
    sel.innerHTML = "";
    db.users.forEach((u) => {
      const opt = document.createElement("option");
      opt.value = u.id;
      opt.textContent = `${u.name} (${u.role})`;
      sel.appendChild(opt);
    });
    sel.value = db.currentUserId;

    sel.addEventListener("change", () => {
      db.currentUserId = sel.value;
      audit(`Cambio de usuario: ${getUser().name}`);
      persist();
      renderTabs();
      renderView();
    });

    $("#resetBtn").addEventListener("click", () => {
      if (!confirm("¿Resetear datos de demo en este navegador?")) return;
      db = createEmptyDB();
      saveDB(db);
      location.reload();
    });
  }

  // ===== UI components =====
  function card(title, bodyHTML) {
    return `
      <div class="card" style="border-left: 6px solid var(--chilchota-primary, ${BRAND.primary});">
        <div class="card-h">
          <div class="card-title">${title}</div>
        </div>
        <div class="card-b">${bodyHTML}</div>
      </div>
    `;
  }

  function table(headers, rowsHTML) {
    return `
      <div class="table-wrap">
        <table class="table">
          <thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
          <tbody>${rowsHTML || `<tr><td colspan="${headers.length}" class="muted">Sin datos</td></tr>`}</tbody>
        </table>
      </div>
    `;
  }

  function badge(text) {
    return `<span class="badge" style="background: rgba(204,0,0,.08); color: ${BRAND.primary}; border: 1px solid rgba(204,0,0,.25)">${text}</span>`;
  }

  function statusPill(s) {
    const map = {
      DRAFT: ["Borrador", "rgba(0,0,0,.08)", "rgba(0,0,0,.6)"],
      SUBMITTED: ["Enviado", "rgba(139,185,254,.18)", "rgba(20,60,120,.9)"],
      RECEIVED: ["Recibido", "rgba(0,160,90,.12)", "rgba(0,110,60,.95)"],
      SHIPPED: ["Surtido", "rgba(0,160,90,.12)", "rgba(0,110,60,.95)"],
      VOID: ["Cancelado", "rgba(160,0,0,.10)", "rgba(160,0,0,.95)"],
    };
    const [label, bg, fg] = map[s] || [s, "rgba(0,0,0,.06)", "rgba(0,0,0,.7)"];
    return `<span class="pill" style="background:${bg}; color:${fg}; border: 1px solid rgba(0,0,0,.08)">${label}</span>`;
  }

  function productOptionsHTML(selectedId = "") {
    const groups = {};
    db.products.forEach((p) => {
      groups[p.category] = groups[p.category] || [];
      groups[p.category].push(p);
    });

    const cats = Object.keys(groups).sort((a, b) => a.localeCompare(b, "es"));
    return `
      <option value="">Selecciona producto</option>
      ${cats
        .map((cat) => {
          const opts = groups[cat]
            .sort((a, b) => a.name.localeCompare(b.name, "es"))
            .map(
              (p) =>
                `<option value="${p.id}" ${p.id === selectedId ? "selected" : ""}>${p.name} — ${p.id}</option>`
            )
            .join("");
          return `<optgroup label="${cat}">${opts}</optgroup>`;
        })
        .join("")}
    `;
  }

  function computeUnitPrice(product, discountPct, overridePrice) {
    const base = safeNum(product?.basePrice, 0);
    const disc = clamp(safeNum(discountPct, 0), 0, 100);
    const discounted = base * (1 - disc / 100);
    const ov = safeNum(overridePrice, NaN);
    const final = Number.isFinite(ov) && ov >= 0 ? ov : discounted;
    return { base, discounted, final };
  }

  function qtyToPieces(product, boxes, pieces) {
    const ppb = safeNum(product?.piecesPerBox, 0);
    return Math.max(0, Math.floor(safeNum(boxes, 0) * ppb + safeNum(pieces, 0)));
  }

  // ===== Views =====
  function renderView() {
    const view = $("#view");
    const role = getUser().role;

    const headerHTML = `
      <div class="pagehead">
        <div>
          <div class="h1" style="color: var(--chilchota-primary, ${BRAND.primary});">Chilchota Demo</div>
          <div class="muted">Usuario actual: <b>${getUser().name}</b> (${role})</div>
        </div>
      </div>
    `;

    let content = "";
    if (currentTab === "orders") content = renderOrders();
    else if (currentTab === "po") content = renderPO();
    else if (currentTab === "waste") content = renderWaste();
    else if (currentTab === "inventory") content = renderInventory();
    else if (currentTab === "movements") content = renderMovements();
    else if (currentTab === "kpi") content = renderKPI();
    else if (currentTab === "catalog") content = renderCatalog();
    else content = `<div class="muted">Vista no disponible.</div>`;

    view.innerHTML = headerHTML + content;

    // wire handlers after render
    wireCommonHandlers();
    if (currentTab === "orders") wireOrdersHandlers();
    if (currentTab === "po") wirePOHandlers();
    if (currentTab === "waste") wireWasteHandlers();
    if (currentTab === "inventory") wireInventoryHandlers();
    if (currentTab === "catalog") wireCatalogHandlers();
  }

  function wireCommonHandlers() {
    // nothing global for now
  }

  // ===== Orders (Pedidos) =====
  function renderOrders() {
    if (!TAB_DEFS.find((t) => t.id === "orders")?.allowed()) {
      return `<div class="muted">No tienes permisos para ver Pedidos.</div>`;
    }

    const canCreate = can("create_order");
    const canShip = can("ship_order");

    const formHTML = canCreate
      ? card(
          "Nuevo pedido (salida)",
          `
          <div class="grid">
            <div>
              <label>Cliente</label>
              <input id="oCustomer" type="text" placeholder="Ej. Restaurante X" />
            </div>
            <div>
              <label>Referencia</label>
              <input id="oRef" type="text" placeholder="Ej. OC cliente / nota" />
            </div>
          </div>

          <hr class="sep" />

          <div class="grid-3">
            <div>
              <label>Producto</label>
              <select id="oProduct">${productOptionsHTML()}</select>
            </div>
            <div>
              <label>Pzas por caja</label>
              <input id="oPPB" type="number" disabled value="-" />
            </div>
            <div>
              <label>Precio base (por pza)</label>
              <input id="oBasePrice" type="text" disabled value="-" />
            </div>
          </div>

          <div class="grid-3">
            <div>
              <label>Cajas</label>
              <input id="oBoxes" type="number" min="0" step="1" value="0" />
            </div>
            <div>
              <label>Piezas</label>
              <input id="oPieces" type="number" min="0" step="1" value="0" />
            </div>
            <div>
              <label>Descuento %</label>
              <input id="oDiscount" type="number" min="0" max="100" step="0.1" value="0" />
            </div>
          </div>

          <div class="grid-2">
            <div>
              <label>Override precio (por pza)</label>
              <input id="oOverride" type="number" min="0" step="0.01" placeholder="Opcional" />
              <div class="muted" style="margin-top:6px;">Si pones override, el motivo es obligatorio.</div>
            </div>
            <div>
              <label>Motivo del override</label>
              <input id="oOverrideReason" type="text" placeholder="Ej. promo / ajuste / negociación" />
            </div>
          </div>

          <div class="grid-3">
            <div>
              <label>Total piezas</label>
              <input id="oTotalPieces" type="text" disabled value="0" />
            </div>
            <div>
              <label>Precio final (por pza)</label>
              <input id="oFinalUnit" type="text" disabled value="-" />
            </div>
            <div>
              <label>Total</label>
              <input id="oTotal" type="text" disabled value="$0.00" />
            </div>
          </div>

          <div class="actions">
            <button class="btn primary" id="oCreateBtn">Crear pedido</button>
            <span class="muted">Estado inicial: Borrador</span>
          </div>
        `
        )
      : "";

    const rows = db.orders
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((o) => {
        const p = productById(o.productId);
        const totalPieces = o.qtyPieces;
        const total = o.totalAmount;
        const inv = invQty(o.productId);

        const actions = [
          canCreate && o.status === "DRAFT"
            ? `<button class="btn small" data-act="o-submit" data-id="${o.id}">Enviar</button>`
            : "",
          canShip && o.status === "SUBMITTED"
            ? `<button class="btn small primary" data-act="o-ship" data-id="${o.id}">Marcar surtido</button>`
            : "",
          (canCreate || canShip) && o.status !== "SHIPPED"
            ? `<button class="btn small danger" data-act="o-void" data-id="${o.id}">Cancelar</button>`
            : "",
        ].filter(Boolean);

        return `
          <tr>
            <td>${statusPill(o.status)}</td>
            <td><b>${o.customer}</b><div class="muted">${o.ref || ""}</div></td>
            <td>${p ? `${p.name}<div class="muted">${p.id}</div>` : o.productId}</td>
            <td>${totalPieces}</td>
            <td>${fmtMoney(o.unitPriceFinal)}</td>
            <td><b>${fmtMoney(total)}</b></td>
            <td>${badge(`Inv: ${inv} pzas`)}</td>
            <td>${actions.join(" ") || `<span class="muted">—</span>`}</td>
          </tr>
        `;
      })
      .join("");

    const listHTML = card(
      "Pedidos",
      table(
        ["Estado", "Cliente", "Producto", "Pzas", "Precio pza", "Total", "Inventario", "Acciones"],
        rows
      )
    );

    return formHTML + listHTML;
  }

  function wireOrdersHandlers() {
    // list actions
    $("#view").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;
      const id = btn.dataset.id;
      const order = db.orders.find((x) => x.id === id);
      if (!order) return;

      if (act === "o-submit") {
        if (!can("create_order")) return;
        order.status = "SUBMITTED";
        order.updatedAt = nowISO();
        audit(`Pedido enviado: ${id}`);
        persist();
        renderView();
      }

      if (act === "o-ship") {
        if (!can("ship_order")) return;
        // valida inventario suficiente
        const have = invQty(order.productId);
        if (have < order.qtyPieces) {
          alert(`Inventario insuficiente. Tienes ${have} pzas y el pedido requiere ${order.qtyPieces}.`);
          return;
        }
        order.status = "SHIPPED";
        order.shippedAt = nowISO();
        order.updatedAt = nowISO();

        applyDelta(order.productId, -order.qtyPieces, {
          movement: {
            type: "OUT",
            productId: order.productId,
            qtyPieces: order.qtyPieces,
            refType: "ORDER",
            refId: order.id,
            note: `Surtido a ${order.customer}`,
          },
        });

        audit(`Pedido surtido: ${id}`);
        persist();
        renderView();
      }

      if (act === "o-void") {
        if (!(can("create_order") || can("ship_order"))) return;
        if (!confirm("¿Cancelar pedido?")) return;
        order.status = "VOID";
        order.updatedAt = nowISO();
        audit(`Pedido cancelado: ${id}`);
        persist();
        renderView();
      }
    });

    // create order form live calc
    const prodSel = $("#oProduct");
    if (!prodSel) return;

    const oPPB = $("#oPPB");
    const oBasePrice = $("#oBasePrice");
    const oBoxes = $("#oBoxes");
    const oPieces = $("#oPieces");
    const oDiscount = $("#oDiscount");
    const oOverride = $("#oOverride");
    const oOverrideReason = $("#oOverrideReason");
    const oTotalPieces = $("#oTotalPieces");
    const oFinalUnit = $("#oFinalUnit");
    const oTotal = $("#oTotal");

    function recalc() {
      const productId = prodSel.value;
      const p = productById(productId);
      if (!p) {
        oPPB.value = "-";
        oBasePrice.value = "-";
        oFinalUnit.value = "-";
        oTotalPieces.value = "0";
        oTotal.value = fmtMoney(0);
        return;
      }

      oPPB.value = String(p.piecesPerBox ?? "-");
      oBasePrice.value = fmtMoney(p.basePrice);

      const qtyPieces = qtyToPieces(p, oBoxes.value, oPieces.value);
      oTotalPieces.value = String(qtyPieces);

      const disc = safeNum(oDiscount.value, 0);
      const ov = oOverride.value === "" ? NaN : safeNum(oOverride.value, NaN);
      const { final } = computeUnitPrice(p, disc, ov);

      oFinalUnit.value = fmtMoney(final);
      oTotal.value = fmtMoney(final * qtyPieces);
    }

    prodSel.addEventListener("change", () => {
      // requisito: al seleccionar producto SOLO se carga el precio (y ppb) automáticamente
      // (descuento/override quedan en lo que el usuario haya puesto)
      const p = productById(prodSel.value);
      if (p) {
        oPPB.value = String(p.piecesPerBox ?? "-");
        oBasePrice.value = fmtMoney(p.basePrice);
      } else {
        oPPB.value = "-";
        oBasePrice.value = "-";
      }
      recalc();
    });

    [oBoxes, oPieces, oDiscount, oOverride].forEach((el) => el.addEventListener("input", recalc));

    $("#oCreateBtn")?.addEventListener("click", () => {
      if (!can("create_order")) return;
      const customer = ($("#oCustomer").value || "").trim();
      const ref = ($("#oRef").value || "").trim();
      const productId = prodSel.value;

      const p = productById(productId);
      if (!customer) return alert("Falta Cliente.");
      if (!p) return alert("Selecciona producto.");

      const qtyPieces = qtyToPieces(p, oBoxes.value, oPieces.value);
      if (qtyPieces <= 0) return alert("Cantidad debe ser mayor a 0.");

      const disc = clamp(safeNum(oDiscount.value, 0), 0, 100);
      const ov = oOverride.value === "" ? NaN : safeNum(oOverride.value, NaN);
      const ovReason = (oOverrideReason.value || "").trim();

      if (Number.isFinite(ov) && ov >= 0 && !ovReason) {
        return alert("Si hay override de precio, el motivo es obligatorio.");
      }

      const { base, discounted, final } = computeUnitPrice(p, disc, ov);

      const order = {
        id: uid(),
        createdAt: nowISO(),
        updatedAt: nowISO(),
        createdBy: getUser().id,
        status: "DRAFT",
        customer,
        ref,
        productId,
        qtyPieces,
        pricing: {
          basePrice: base,
          discountPct: disc,
          discountedPrice: discounted,
          overridePrice: Number.isFinite(ov) ? ov : null,
          overrideReason: Number.isFinite(ov) ? ovReason : "",
        },
        unitPriceFinal: final,
        totalAmount: final * qtyPieces,
      };

      db.orders.unshift(order);
      audit(`Pedido creado: ${order.id} (${customer})`);
      persist();
      renderView();
    });

    recalc();
  }

  // ===== Purchase Orders (Órdenes de compra) =====
  function renderPO() {
    if (!TAB_DEFS.find((t) => t.id === "po")?.allowed()) {
      return `<div class="muted">No tienes permisos para ver Órdenes de compra.</div>`;
    }

    const canCreate = can("create_po");
    const canReceive = can("receive_po");

    const formHTML = canCreate
      ? card(
          "Nueva orden de compra (entrada)",
          `
          <div class="grid">
            <div>
              <label>Proveedor</label>
              <input id="poSupplier" type="text" placeholder="Ej. Chilchota" value="Chilchota" />
            </div>
            <div>
              <label>Referencia</label>
              <input id="poRef" type="text" placeholder="Ej. folio / nota" />
            </div>
          </div>

          <hr class="sep" />

          <div class="grid-3">
            <div>
              <label>Producto</label>
              <select id="poProduct">${productOptionsHTML()}</select>
            </div>
            <div>
              <label>Pzas por caja</label>
              <input id="poPPB" type="number" disabled value="-" />
            </div>
            <div>
              <label>Precio base (por pza)</label>
              <input id="poBasePrice" type="text" disabled value="-" />
            </div>
          </div>

          <div class="grid-3">
            <div>
              <label>Cajas</label>
              <input id="poBoxes" type="number" min="0" step="1" value="0" />
            </div>
            <div>
              <label>Piezas</label>
              <input id="poPieces" type="number" min="0" step="1" value="0" />
            </div>
            <div>
              <label>Descuento %</label>
              <input id="poDiscount" type="number" min="0" max="100" step="0.1" value="0" />
            </div>
          </div>

          <div class="grid-2">
            <div>
              <label>Override precio (por pza)</label>
              <input id="poOverride" type="number" min="0" step="0.01" placeholder="Opcional" />
              <div class="muted" style="margin-top:6px;">Si pones override, el motivo es obligatorio.</div>
            </div>
            <div>
              <label>Motivo del override</label>
              <input id="poOverrideReason" type="text" placeholder="Ej. promo / ajuste / negociación" />
            </div>
          </div>

          <div class="grid-3">
            <div>
              <label>Total piezas</label>
              <input id="poTotalPieces" type="text" disabled value="0" />
            </div>
            <div>
              <label>Precio final (por pza)</label>
              <input id="poFinalUnit" type="text" disabled value="-" />
            </div>
            <div>
              <label>Total</label>
              <input id="poTotal" type="text" disabled value="$0.00" />
            </div>
          </div>

          <div class="actions">
            <button class="btn primary" id="poCreateBtn">Crear OC</button>
            <span class="muted">Estado inicial: Borrador</span>
          </div>
        `
        )
      : "";

    const rows = db.purchaseOrders
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((po) => {
        const p = productById(po.productId);
        const inv = invQty(po.productId);

        const actions = [
          canCreate && po.status === "DRAFT"
            ? `<button class="btn small" data-act="po-submit" data-id="${po.id}">Enviar</button>`
            : "",
          canReceive && po.status === "SUBMITTED"
            ? `<button class="btn small primary" data-act="po-receive" data-id="${po.id}">Marcar recibido</button>`
            : "",
          (canCreate || canReceive) && po.status !== "RECEIVED"
            ? `<button class="btn small danger" data-act="po-void" data-id="${po.id}">Cancelar</button>`
            : "",
        ].filter(Boolean);

        return `
          <tr>
            <td>${statusPill(po.status)}</td>
            <td><b>${po.supplier}</b><div class="muted">${po.ref || ""}</div></td>
            <td>${p ? `${p.name}<div class="muted">${p.id}</div>` : po.productId}</td>
            <td>${po.qtyPieces}</td>
            <td>${fmtMoney(po.unitPriceFinal)}</td>
            <td><b>${fmtMoney(po.totalAmount)}</b></td>
            <td>${badge(`Inv: ${inv} pzas`)}</td>
            <td>${actions.join(" ") || `<span class="muted">—</span>`}</td>
          </tr>
        `;
      })
      .join("");

    const listHTML = card(
      "Órdenes de compra",
      table(
        ["Estado", "Proveedor", "Producto", "Pzas", "Precio pza", "Total", "Inventario", "Acciones"],
        rows
      )
    );

    return formHTML + listHTML;
  }

  function wirePOHandlers() {
    // list actions
    $("#view").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;
      const id = btn.dataset.id;
      const po = db.purchaseOrders.find((x) => x.id === id);
      if (!po) return;

      if (act === "po-submit") {
        if (!can("create_po")) return;
        po.status = "SUBMITTED";
        po.updatedAt = nowISO();
        audit(`OC enviada: ${id}`);
        persist();
        renderView();
      }

      if (act === "po-receive") {
        if (!can("receive_po")) return;
        po.status = "RECEIVED";
        po.receivedAt = nowISO();
        po.updatedAt = nowISO();

        applyDelta(po.productId, +po.qtyPieces, {
          movement: {
            type: "IN",
            productId: po.productId,
            qtyPieces: po.qtyPieces,
            refType: "PO",
            refId: po.id,
            note: `Recepción de ${po.supplier}`,
          },
        });

        audit(`OC recibida: ${id}`);
        persist();
        renderView();
      }

      if (act === "po-void") {
        if (!(can("create_po") || can("receive_po"))) return;
        if (!confirm("¿Cancelar OC?")) return;
        po.status = "VOID";
        po.updatedAt = nowISO();
        audit(`OC cancelada: ${id}`);
        persist();
        renderView();
      }
    });

    // create po form live calc
    const prodSel = $("#poProduct");
    if (!prodSel) return;

    const poPPB = $("#poPPB");
    const poBasePrice = $("#poBasePrice");
    const poBoxes = $("#poBoxes");
    const poPieces = $("#poPieces");
    const poDiscount = $("#poDiscount");
    const poOverride = $("#poOverride");
    const poOverrideReason = $("#poOverrideReason");
    const poTotalPieces = $("#poTotalPieces");
    const poFinalUnit = $("#poFinalUnit");
    const poTotal = $("#poTotal");

    function recalc() {
      const productId = prodSel.value;
      const p = productById(productId);
      if (!p) {
        poPPB.value = "-";
        poBasePrice.value = "-";
        poFinalUnit.value = "-";
        poTotalPieces.value = "0";
        poTotal.value = fmtMoney(0);
        return;
      }

      poPPB.value = String(p.piecesPerBox ?? "-");
      poBasePrice.value = fmtMoney(p.basePrice);

      const qtyPieces = qtyToPieces(p, poBoxes.value, poPieces.value);
      poTotalPieces.value = String(qtyPieces);

      const disc = safeNum(poDiscount.value, 0);
      const ov = poOverride.value === "" ? NaN : safeNum(poOverride.value, NaN);
      const { final } = computeUnitPrice(p, disc, ov);

      poFinalUnit.value = fmtMoney(final);
      poTotal.value = fmtMoney(final * qtyPieces);
    }

    prodSel.addEventListener("change", () => {
      const p = productById(prodSel.value);
      if (p) {
        poPPB.value = String(p.piecesPerBox ?? "-");
        poBasePrice.value = fmtMoney(p.basePrice);
      } else {
        poPPB.value = "-";
        poBasePrice.value = "-";
      }
      recalc();
    });

    [poBoxes, poPieces, poDiscount, poOverride].forEach((el) => el.addEventListener("input", recalc));

    $("#poCreateBtn")?.addEventListener("click", () => {
      if (!can("create_po")) return;

      const supplier = ($("#poSupplier").value || "").trim() || "Chilchota";
      const ref = ($("#poRef").value || "").trim();
      const productId = prodSel.value;

      const p = productById(productId);
      if (!p) return alert("Selecciona producto.");

      const qtyPieces = qtyToPieces(p, poBoxes.value, poPieces.value);
      if (qtyPieces <= 0) return alert("Cantidad debe ser mayor a 0.");

      const disc = clamp(safeNum(poDiscount.value, 0), 0, 100);
      const ov = poOverride.value === "" ? NaN : safeNum(poOverride.value, NaN);
      const ovReason = (poOverrideReason.value || "").trim();

      if (Number.isFinite(ov) && ov >= 0 && !ovReason) {
        return alert("Si hay override de precio, el motivo es obligatorio.");
      }

      const { base, discounted, final } = computeUnitPrice(p, disc, ov);

      const po = {
        id: uid(),
        createdAt: nowISO(),
        updatedAt: nowISO(),
        createdBy: getUser().id,
        status: "DRAFT",
        supplier,
        ref,
        productId,
        qtyPieces,
        pricing: {
          basePrice: base,
          discountPct: disc,
          discountedPrice: discounted,
          overridePrice: Number.isFinite(ov) ? ov : null,
          overrideReason: Number.isFinite(ov) ? ovReason : "",
        },
        unitPriceFinal: final,
        totalAmount: final * qtyPieces,
      };

      db.purchaseOrders.unshift(po);
      audit(`OC creada: ${po.id} (${supplier})`);
      persist();
      renderView();
    });

    recalc();
  }

  // ===== Waste (Merma) =====
  function renderWaste() {
    if (!TAB_DEFS.find((t) => t.id === "waste")?.allowed()) {
      return `<div class="muted">No tienes permisos para ver Merma.</div>`;
    }

    const canLog = can("log_waste");

    const formHTML = canLog
      ? card(
          "Registrar merma (escaneo/manual)",
          `
          <div class="grid-3">
            <div>
              <label>Escanear SKU (pega o escribe)</label>
              <input id="wScan" type="text" placeholder="Ej. CH-010" />
              <div class="muted" style="margin-top:6px;">Tip: en demo, “escaneo” = pegar el código.</div>
            </div>
            <div>
              <label>Producto</label>
              <select id="wProduct">${productOptionsHTML()}</select>
            </div>
            <div>
              <label>Inventario actual (pzas)</label>
              <input id="wInv" type="text" disabled value="0" />
            </div>
          </div>

          <div class="grid-3">
            <div>
              <label>Piezas (merma)</label>
              <input id="wPieces" type="number" min="1" step="1" value="1" />
            </div>
            <div>
              <label>Motivo</label>
              <input id="wReason" type="text" placeholder="Ej. caducidad / daño / devol." />
            </div>
            <div>
              <label>Notas</label>
              <input id="wNote" type="text" placeholder="Opcional" />
            </div>
          </div>

          <div class="actions">
            <button class="btn primary" id="wCreateBtn">Registrar merma</button>
            <span class="muted">Esto descuenta inventario de inmediato (demo).</span>
          </div>
        `
        )
      : "";

    const rows = db.waste
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((w) => {
        const p = productById(w.productId);
        return `
          <tr>
            <td>${new Date(w.createdAt).toLocaleString("es-MX")}</td>
            <td>${p ? `${p.name}<div class="muted">${p.id}</div>` : w.productId}</td>
            <td>${w.qtyPieces}</td>
            <td>${w.reason || "—"}</td>
            <td class="muted">${w.note || ""}</td>
            <td>${badge(db.users.find((u) => u.id === w.createdBy)?.name || w.createdBy)}</td>
          </tr>
        `;
      })
      .join("");

    const listHTML = card("Historial de merma", table(["Fecha", "Producto", "Pzas", "Motivo", "Notas", "Usuario"], rows));

    return formHTML + listHTML;
  }

  function wireWasteHandlers() {
    const wProduct = $("#wProduct");
    if (!wProduct) return;

    const wInv = $("#wInv");
    const wScan = $("#wScan");

    function syncInv() {
      const pid = wProduct.value;
      wInv.value = pid ? `${invQty(pid)} pzas` : "0";
    }

    wProduct.addEventListener("change", syncInv);

    wScan.addEventListener("input", () => {
      const code = (wScan.value || "").trim().toUpperCase();
      if (!code) return;
      const found = db.products.find((p) => p.id.toUpperCase() === code);
      if (found) {
        wProduct.value = found.id;
        syncInv();
      }
    });

    $("#wCreateBtn")?.addEventListener("click", () => {
      if (!can("log_waste")) return;
      const productId = wProduct.value;
      const p = productById(productId);
      if (!p) return alert("Selecciona producto.");
      const qty = Math.max(1, Math.floor(safeNum($("#wPieces").value, 0)));
      const reason = ($("#wReason").value || "").trim();
      const note = ($("#wNote").value || "").trim();

      if (!reason) return alert("Motivo es obligatorio.");

      const have = invQty(productId);
      if (have < qty) {
        if (!confirm(`Inventario actual ${have} pzas. ¿Registrar merma de ${qty} pzas de todos modos (inventario queda en 0)?`)) return;
      }

      const entry = {
        id: uid(),
        createdAt: nowISO(),
        createdBy: getUser().id,
        productId,
        qtyPieces: qty,
        reason,
        note,
      };
      db.waste.unshift(entry);

      // descuenta inventario
      const delta = -qty;
      applyDelta(productId, delta, {
        movement: {
          type: "WASTE",
          productId,
          qtyPieces: qty,
          refType: "WASTE",
          refId: entry.id,
          note: reason,
        },
      });

      audit(`Merma registrada: ${entry.id} (${productId} -${qty})`);
      persist();
      renderView();
    });

    syncInv();
  }

  // ===== Inventory =====
  function renderInventory() {
    if (!TAB_DEFS.find((t) => t.id === "inventory")?.allowed()) {
      return `<div class="muted">No tienes permisos para ver Inventario.</div>`;
    }

    const canAdjust = can("adjust_inventory");

    const adjustHTML = canAdjust
      ? card(
          "Ajuste de inventario (warehouse/admin)",
          `
          <div class="grid-3">
            <div>
              <label>Producto</label>
              <select id="invProduct">${productOptionsHTML()}</select>
            </div>
            <div>
              <label>Inventario actual (pzas)</label>
              <input id="invCurrent" type="text" disabled value="0" />
            </div>
            <div>
              <label>Nuevo inventario (pzas)</label>
              <input id="invNew" type="number" min="0" step="1" value="0" />
            </div>
          </div>
          <div class="grid-2">
            <div>
              <label>Motivo</label>
              <input id="invReason" type="text" placeholder="Ej. conteo cíclico / ajuste" />
            </div>
            <div class="actions" style="align-items:end;">
              <button class="btn primary" id="invApplyBtn">Aplicar ajuste</button>
            </div>
          </div>
        `
        )
      : "";

    const rows = db.products
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .map((p) => {
        const qty = invQty(p.id);
        const boxes = p.piecesPerBox ? (qty / p.piecesPerBox).toFixed(2) : "—";
        return `
          <tr>
            <td>${p.name}<div class="muted">${p.id}</div></td>
            <td>${p.category}</td>
            <td>${p.piecesPerBox ?? "—"}</td>
            <td><b>${qty}</b></td>
            <td class="muted">${boxes}</td>
          </tr>
        `;
      })
      .join("");

    const listHTML = card(
      "Inventario (piezas)",
      table(["Producto", "Categoría", "Pzas/caja", "Pzas", "Cajas (aprox)"], rows)
    );

    return adjustHTML + listHTML;
  }

  function wireInventoryHandlers() {
    const invProduct = $("#invProduct");
    if (!invProduct) return;

    const invCurrent = $("#invCurrent");
    const invNew = $("#invNew");

    function sync() {
      const pid = invProduct.value;
      const qty = pid ? invQty(pid) : 0;
      invCurrent.value = pid ? `${qty} pzas` : "0";
      invNew.value = pid ? qty : 0;
    }

    invProduct.addEventListener("change", sync);

    $("#invApplyBtn")?.addEventListener("click", () => {
      if (!can("adjust_inventory")) return;
      const pid = invProduct.value;
      const p = productById(pid);
      if (!p) return alert("Selecciona producto.");
      const newQty = Math.max(0, Math.floor(safeNum(invNew.value, 0)));
      const reason = ($("#invReason").value || "").trim();
      if (!reason) return alert("Motivo es obligatorio.");

      const before = invQty(pid);
      const delta = newQty - before;
      setInvQty(pid, newQty);

      addMovement({
        type: "ADJUST",
        productId: pid,
        qtyPieces: Math.abs(delta),
        refType: "ADJUST",
        refId: uid(),
        note: `${delta >= 0 ? "+" : "-"}${Math.abs(delta)} | ${reason}`,
      });

      audit(`Ajuste inventario: ${pid} ${before}→${newQty}`);
      persist();
      renderView();
    });

    sync();
  }

  // ===== Movements =====
  function renderMovements() {
    if (!TAB_DEFS.find((t) => t.id === "movements")?.allowed()) {
      return `<div class="muted">No tienes permisos para ver Movimientos.</div>`;
    }

    const rows = db.movements
      .slice(0, 250)
      .map((m) => {
        const p = productById(m.productId);
        const u = db.users.find((x) => x.id === m.userId);
        const sign = m.type === "IN" ? "+" : m.type === "OUT" || m.type === "WASTE" ? "-" : "±";
        return `
          <tr>
            <td>${new Date(m.ts).toLocaleString("es-MX")}</td>
            <td>${badge(m.type)}</td>
            <td>${p ? `${p.name}<div class="muted">${p.id}</div>` : m.productId}</td>
            <td><b>${sign}${m.qtyPieces}</b></td>
            <td class="muted">${m.refType ? `${m.refType} ${m.refId}` : ""}</td>
            <td class="muted">${m.note || ""}</td>
            <td>${u ? u.name : m.userId}</td>
          </tr>
        `;
      })
      .join("");

    return card(
      "Bitácora de movimientos",
      table(["Fecha", "Tipo", "Producto", "Pzas", "Referencia", "Nota", "Usuario"], rows)
    );
  }

  // ===== KPI =====
  function renderKPI() {
    if (!can("view_kpi")) {
      return `<div class="muted">No tienes permisos para ver KPI.</div>`;
    }

    const daysBack = 7;
    const cutoff = Date.now() - daysBack * 24 * 60 * 60 * 1000;

    const shipped = db.orders.filter((o) => o.status === "SHIPPED" && Date.parse(o.shippedAt || o.updatedAt) >= cutoff);
    const received = db.purchaseOrders.filter(
      (po) => po.status === "RECEIVED" && Date.parse(po.receivedAt || po.updatedAt) >= cutoff
    );
    const waste = db.waste.filter((w) => Date.parse(w.createdAt) >= cutoff);

    const shippedTotal = shipped.reduce((s, o) => s + (o.totalAmount || 0), 0);
    const receivedTotal = received.reduce((s, po) => s + (po.totalAmount || 0), 0);
    const wastePieces = waste.reduce((s, w) => s + (w.qtyPieces || 0), 0);

    const invTotalPieces = Object.values(db.inventory).reduce((s, v) => s + safeNum(v, 0), 0);

    const topWaste = (() => {
      const map = new Map();
      waste.forEach((w) => map.set(w.productId, (map.get(w.productId) || 0) + (w.qtyPieces || 0)));
      return [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([pid, qty]) => {
          const p = productById(pid);
          return `<li>${p ? p.name : pid} — <b>${qty}</b> pzas</li>`;
        })
        .join("");
    })();

    return `
      ${card(
        "Resumen (últimos 7 días)",
        `
        <div class="grid-3">
          <div class="kpi">
            <div class="kpi-label">Pedidos surtidos</div>
            <div class="kpi-value">${shipped.length}</div>
            <div class="kpi-sub">${fmtMoney(shippedTotal)}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">OC recibidas</div>
            <div class="kpi-value">${received.length}</div>
            <div class="kpi-sub">${fmtMoney(receivedTotal)}</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">Merma (pzas)</div>
            <div class="kpi-value">${wastePieces}</div>
            <div class="kpi-sub">Registros: ${waste.length}</div>
          </div>
        </div>

        <hr class="sep" />

        <div class="grid-2">
          <div>
            <div class="muted">Inventario total</div>
            <div style="font-size: 22px; font-weight: 800; color: var(--chilchota-primary, ${BRAND.primary});">${invTotalPieces} pzas</div>
          </div>
          <div>
            <div class="muted">Top merma</div>
            <ul style="margin:8px 0 0 18px;">${topWaste || "<li class='muted'>Sin merma en ventana</li>"}</ul>
          </div>
        </div>
      `
      )}
    `;
  }

  // ===== Catalog (Admin) =====
  function renderCatalog() {
    if (!can("manage_catalog")) {
      return `<div class="muted">No tienes permisos para ver Catálogo.</div>`;
    }

    const exportJSON = JSON.stringify(db.products, null, 2);

    const rows = db.products
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .map((p) => {
        return `
          <tr>
            <td><b>${p.id}</b></td>
            <td>${p.name}</td>
            <td class="muted">${p.category}</td>
            <td>${p.piecesPerBox ?? "—"}</td>
            <td>${fmtMoney(p.basePrice)}</td>
            <td>
              <button class="btn small" data-act="c-edit" data-id="${p.id}">Editar</button>
              <button class="btn small danger" data-act="c-del" data-id="${p.id}">Eliminar</button>
            </td>
          </tr>
        `;
      })
      .join("");

    return `
      ${card(
        "Alta rápida",
        `
        <div class="grid-3">
          <div><label>ID (SKU)</label><input id="cId" type="text" placeholder="CH-999" /></div>
          <div><label>Nombre</label><input id="cName" type="text" placeholder="Producto..." /></div>
          <div><label>Categoría</label><input id="cCat" type="text" placeholder="Quesos / Leches..." /></div>
        </div>
        <div class="grid-3">
          <div><label>Pzas por caja</label><input id="cPPB" type="number" min="1" step="1" value="12" /></div>
          <div><label>Precio base (por pza)</label><input id="cPrice" type="number" min="0" step="0.01" value="2.00" /></div>
          <div class="actions" style="align-items:end;"><button class="btn primary" id="cAddBtn">Agregar</button></div>
        </div>
        `
      )}

      ${card("Listado", table(["SKU", "Nombre", "Categoría", "Pzas/caja", "Precio", "Acciones"], rows))}

      ${card(
        "Import / Export (JSON)",
        `
        <div class="grid-2">
          <div>
            <label>Export</label>
            <textarea id="cExport" rows="10" readonly>${escapeHTML(exportJSON)}</textarea>
            <div class="actions">
              <button class="btn" id="cCopyBtn">Copiar</button>
              <button class="btn" id="cDownloadBtn">Descargar JSON</button>
            </div>
          </div>
          <div>
            <label>Import (pega JSON de productos)</label>
            <textarea id="cImport" rows="10" placeholder='[{"id":"CH-001","name":"...","category":"...","piecesPerBox":12,"basePrice":2.5}]'></textarea>
            <div class="actions">
              <button class="btn primary" id="cImportBtn">Importar</button>
              <span class="muted">Reemplaza el catálogo completo.</span>
            </div>
          </div>
        </div>
        `
      )}
    `;
  }

  function wireCatalogHandlers() {
    if (!can("manage_catalog")) return;

    $("#cAddBtn")?.addEventListener("click", () => {
      const id = ($("#cId").value || "").trim().toUpperCase();
      const name = ($("#cName").value || "").trim();
      const category = ($("#cCat").value || "").trim() || "Sin categoría";
      const piecesPerBox = Math.max(1, Math.floor(safeNum($("#cPPB").value, 12)));
      const basePrice = Math.max(0, safeNum($("#cPrice").value, 0));

      if (!id) return alert("Falta ID.");
      if (!name) return alert("Falta nombre.");
      if (db.products.some((p) => p.id === id)) return alert("Ese ID ya existe.");

      db.products.push({ id, name, category, piecesPerBox, basePrice });
      audit(`Producto agregado: ${id}`);
      persist();
      renderView();
    });

    $("#cCopyBtn")?.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText($("#cExport").value);
        alert("Copiado.");
      } catch {
        alert("No se pudo copiar. Selecciona y copia manual.");
      }
    });

    $("#cDownloadBtn")?.addEventListener("click", () => {
      const blob = new Blob([JSON.stringify(db.products, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "chilchota-products.json";
      a.click();
      URL.revokeObjectURL(a.href);
    });

    $("#cImportBtn")?.addEventListener("click", () => {
      const raw = ($("#cImport").value || "").trim();
      if (!raw) return alert("Pega JSON.");
      let arr;
      try {
        arr = JSON.parse(raw);
      } catch {
        return alert("JSON inválido.");
      }
      if (!Array.isArray(arr)) return alert("JSON debe ser un arreglo.");

      const cleaned = arr
        .map((x) => ({
          id: String(x.id || "").trim().toUpperCase(),
          name: String(x.name || "").trim(),
          category: String(x.category || "Sin categoría").trim(),
          piecesPerBox: Math.max(1, Math.floor(safeNum(x.piecesPerBox, 12))),
          basePrice: Math.max(0, safeNum(x.basePrice, 0)),
        }))
        .filter((x) => x.id && x.name);

      if (cleaned.length === 0) return alert("No hay productos válidos.");

      if (!confirm(`Importar ${cleaned.length} productos y reemplazar el catálogo actual?`)) return;

      db.products = cleaned.sort((a, b) => a.name.localeCompare(b.name, "es"));
      audit(`Catálogo importado (${cleaned.length} productos)`);
      persist();
      renderView();
    });

    $("#view").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-act]");
      if (!btn) return;
      const act = btn.dataset.act;
      const id = btn.dataset.id;

      if (act === "c-del") {
        if (!confirm(`Eliminar ${id}?`)) return;
        db.products = db.products.filter((p) => p.id !== id);
        // limpia inventario si existe
        delete db.inventory[id];
        audit(`Producto eliminado: ${id}`);
        persist();
        renderView();
      }

      if (act === "c-edit") {
        const p = productById(id);
        if (!p) return;
        const newName = prompt("Nombre:", p.name);
        if (newName === null) return;
        const newCat = prompt("Categoría:", p.category);
        if (newCat === null) return;
        const newPPB = prompt("Pzas por caja:", String(p.piecesPerBox ?? 12));
        if (newPPB === null) return;
        const newPrice = prompt("Precio base (por pza):", String(p.basePrice ?? 0));
        if (newPrice === null) return;

        p.name = String(newName).trim() || p.name;
        p.category = String(newCat).trim() || p.category;
        p.piecesPerBox = Math.max(1, Math.floor(safeNum(newPPB, p.piecesPerBox || 12)));
        p.basePrice = Math.max(0, safeNum(newPrice, p.basePrice || 0));

        audit(`Producto editado: ${id}`);
        persist();
        renderView();
      }
    });
  }

  // ===== HTML escape for textarea =====
  function escapeHTML(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  // ===== Init =====
  renderUserSelect();
  renderTabs();
  renderView();
})();
