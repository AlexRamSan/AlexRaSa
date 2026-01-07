/* Chilchota Demo — HTML/CSS/JS (sin servidor)
   - Guarda todo en localStorage
   - Roles simples (Admin, Almacén, Vendedor)
   - Módulos: Productos, Inventario (movimientos), Compras (OC + recepción),
             Pedidos (venta), Merma, Benchmark, Reportes + Reabasto simple
*/

const STORAGE_KEY = "chilchota_demo_v1";

// ---------- Utilidades ----------
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

// ---------- Datos ----------
function seedData() {
  const products = [
    { id: uid(), sku: "LECH-1L", name: "Leche 1L", unit: "pz", cost: 16.50, price: 24.00, barcode: "750000000001" },
    { id: uid(), sku: "CREM-500", name: "Crema 500g", unit: "pz", cost: 22.00, price: 34.00, barcode: "750000000002" },
    { id: uid(), sku: "QUES-400", name: "Queso 400g", unit: "pz", cost: 38.00, price: 59.00, barcode: "750000000003" },
    { id: uid(), sku: "YOG-1L", name: "Yogur 1L", unit: "pz", cost: 18.00, price: 28.00, barcode: "750000000004" },
    { id: uid(), sku: "MANT-250", name: "Mantequilla 250g", unit: "pz", cost: 24.50, price: 39.00, barcode: "750000000005" },
  ];

  // inventario inicial (movimientos)
  const stockMoves = [];
  const branchId = "BR-001";
  const warehouseId = "WH-001";
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

  // ventas históricas mini para reabasto (últimos 14 días)
  const salesOrders = [];
  for (let d = 1; d <= 14; d++) {
    const soId = uid();
    const lines = [
      { productId: products[0].id, qty: (d % 3) + 1, price: products[0].price },
      { productId: products[2].id, qty: (d % 2), price: products[2].price },
    ].filter(l => l.qty > 0);

    salesOrders.push({
      id: soId,
      date: daysAgoISO(d),
      customer: `Cliente ${((d-1)%5)+1}`,
      status: "DELIVERED",
      branchId,
      warehouseId,
      userId: "U-VEND",
      lines
    });

    // reflejar en movimientos (salidas)
    lines.forEach(l => {
      stockMoves.push({
        id: uid(),
        ts: new Date().toISOString(),
        date: daysAgoISO(d),
        type: "SALE",
        productId: l.productId,
        qty: -l.qty,
        unitCost: null,
        note: `Pedido ${soId.slice(-6)}`,
        branchId,
        warehouseId,
        userId: "U-VEND",
        ref: soId
      });
    });
  }

  return {
    meta: { createdAt: new Date().toISOString(), version: 1 },
    org: { name: "Chilchota (Demo)" },
    branches: [{ id: branchId, name: "Sucursal 1" }],
    warehouses: [{ id: warehouseId, branchId, name: "Almacén 1" }],
    users: [
      { id: "U-ADMIN", name: "Admin", role: "ADMIN" },
      { id: "U-WH", name: "Almacén", role: "WAREHOUSE" },
      { id: "U-VEND", name: "Vendedor", role: "SELLER" },
    ],
    currentUserId: "U-ADMIN",
    products,
    stockMoves,
    purchaseOrders: [],
    competitorPrices: [],
    physicalCounts: [] // {id, date, productId, countedQty, branchId, warehouseId, userId}
  };
}

function loadDB() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const db = seedData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    return db;
  }
  try {
    return JSON.parse(raw);
  } catch {
    const db = seedData();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    return db;
  }
}

function saveDB(db) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

let db = loadDB();

// ---------- Cálculos ----------
function getUser() {
  return db.users.find(u => u.id === db.currentUserId) || db.users[0];
}
function role() { return getUser().role; }

function productById(id) { return db.products.find(p => p.id === id); }

function calcOnHand(branchId, warehouseId) {
  const map = new Map(); // productId => qty
  db.stockMoves
    .filter(m => m.branchId === branchId && m.warehouseId === warehouseId)
    .forEach(m => {
      map.set(m.productId, (map.get(m.productId) || 0) + num(m.qty));
    });
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
  const sold = -moves.reduce((acc, m) => acc + num(m.qty), 0); // qty es negativo en SALE
  return sold / days;
}

function calcWeightedAvgCost(productId, branchId="BR-001", warehouseId="WH-001") {
  // Promedio ponderado simple basado en entradas (INIT + RECEIVE + ADJ+ positivos)
  const entries = db.stockMoves.filter(m =>
    m.productId === productId &&
    m.branchId === branchId &&
    m.warehouseId === warehouseId &&
    (m.type === "INIT" || m.type === "RECEIVE" || m.type === "ADJ") &&
    num(m.qty) > 0 &&
    m.unitCost != null
  );
  const totalQty = entries.reduce((acc, m) => acc + num(m.qty), 0);
  if (totalQty <= 0) return productById(productId)?.cost ?? 0;

  const totalCost = entries.reduce((acc, m) => acc + (num(m.qty) * num(m.unitCost)), 0);
  return totalCost / totalQty;
}

function can(action) {
  // permisos mínimos para demo
  const r = role();
  const rules = {
    VIEW_ALL: ["ADMIN","WAREHOUSE","SELLER"],
    MANAGE_PRODUCTS: ["ADMIN"],
    STOCK_MOVES: ["ADMIN","WAREHOUSE"],
    PURCHASES: ["ADMIN","WAREHOUSE"],
    SALES: ["ADMIN","SELLER","WAREHOUSE"], // vendedor crea, almacén surte (demo simplificado)
    WASTE: ["ADMIN","WAREHOUSE"],
    BENCHMARK: ["ADMIN","SELLER"],
    REPORTS: ["ADMIN","WAREHOUSE"]
  };
  return (rules[action] || []).includes(r);
}

// ---------- UI / Router ----------
const TABS = [
  { id: "dashboard", label: "Dashboard", perm: "VIEW_ALL" },
  { id: "products", label: "Productos", perm: "MANAGE_PRODUCTS" },
  { id: "inventory", label: "Inventario", perm: "STOCK_MOVES" },
  { id: "purchases", label: "Compras", perm: "PURCHASES" },
  { id: "sales", label: "Pedidos", perm: "SALES" },
  { id: "waste", label: "Merma", perm: "WASTE" },
  { id: "benchmark", label: "Benchmark", perm: "BENCHMARK" },
  { id: "reports", label: "Reportes", perm: "REPORTS" },
];

let currentTab = "dashboard";

function renderTabs() {
  const tabsEl = $("#tabs");
  tabsEl.innerHTML = "";

  TABS.forEach(t => {
    if (!can(t.perm)) return;
    const btn = document.createElement("button");
    btn.className = "tab" + (currentTab === t.id ? " active" : "");
    btn.textContent = t.label;
    btn.onclick = () => { currentTab = t.id; render(); };
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
    // si se queda en una pestaña no permitida, regresamos a dashboard
    const allowedTabs = TABS.filter(t => can(t.perm)).map(t => t.id);
    if (!allowedTabs.includes(currentTab)) currentTab = "dashboard";
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

function render() {
  renderUserSelect();
  renderTabs();

  const view = $("#view");
  view.innerHTML = "";

  if (currentTab === "dashboard") view.appendChild(viewDashboard());
  if (currentTab === "products") view.appendChild(viewProducts());
  if (currentTab === "inventory") view.appendChild(viewInventory());
  if (currentTab === "purchases") view.appendChild(viewPurchases());
  if (currentTab === "sales") view.appendChild(viewSales());
  if (currentTab === "waste") view.appendChild(viewWaste());
  if (currentTab === "benchmark") view.appendChild(viewBenchmark());
  if (currentTab === "reports") view.appendChild(viewReports());
}

// ---------- Vistas ----------
function card(title, innerHTML) {
  const el = document.createElement("div");
  el.className = "card";
  el.innerHTML = `<div style="display:flex;justify-content:space-between;gap:10px;align-items:center">
    <div style="font-weight:800">${title}</div>
    <div class="muted small">${db.org.name}</div>
  </div>
  <div class="hr"></div>
  ${innerHTML}`;
  return el;
}

function viewDashboard() {
  const branchId = "BR-001";
  const warehouseId = "WH-001";
  const onHand = calcOnHand(branchId, warehouseId);

  const totalSKUs = db.products.length;
  const totalUnits = [...onHand.values()].reduce((a,b)=>a+num(b),0);

  // Merma últimos 30 días
  const from = daysAgoISO(30);
  const wasteMoves = db.stockMoves.filter(m => m.type === "WASTE" && m.date >= from);
  const wasteUnits = -wasteMoves.reduce((acc,m)=>acc+num(m.qty),0);

  // Ventas últimos 7 días (unidades)
  const from7 = daysAgoISO(7);
  const salesMoves = db.stockMoves.filter(m => m.type === "SALE" && m.date >= from7);
  const soldUnits = -salesMoves.reduce((acc,m)=>acc+num(m.qty),0);

  // Reabasto: 5 productos con más riesgo (onHand bajo vs consumo)
  const risks = db.products.map(p => {
    const avg = calcAvgDailySales(p.id, 14, branchId, warehouseId);
    const daysCover = avg > 0 ? (num(onHand.get(p.id) || 0) / avg) : 999;
    return { p, avg, daysCover, onHand: num(onHand.get(p.id) || 0) };
  }).sort((a,b)=>a.daysCover-b.daysCover).slice(0,5);

  const wrap = document.createElement("div");
  wrap.className = "grid cols3";

  wrap.appendChild(card("KPIs (Demo)", `
    <div class="grid cols3">
      <div class="kpi"><div class="v">${totalSKUs}</div><div class="k">Productos</div></div>
      <div class="kpi"><div class="v">${totalUnits}</div><div class="k">Unidades en stock (teórico)</div></div>
      <div class="kpi"><div class="v">${soldUnits}</div><div class="k">Unidades vendidas (7 días)</div></div>
    </div>
    <div class="hr"></div>
    <div class="grid cols3">
      <div class="kpi"><div class="v">${wasteUnits}</div><div class="k">Merma (30 días)</div></div>
      <div class="kpi"><div class="v">${getUser().name}</div><div class="k">Sesión</div></div>
      <div class="kpi"><div class="v">${role()}</div><div class="k">Rol</div></div>
    </div>
  `));

  wrap.appendChild(card("Riesgo de quiebre (estimado)", `
    <div class="muted small">Cálculo: consumo promedio 14 días vs stock teórico actual.</div>
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

  wrap.appendChild(card("Cómo usar la demo", `
    <ol class="small">
      <li>Cambia de usuario arriba (Admin / Almacén / Vendedor).</li>
      <li>Admin: puede crear productos. Almacén: mueve inventario, compras, merma.</li>
      <li>Vendedor: crea pedidos y captura benchmark.</li>
      <li>Todo queda guardado en el navegador. “Reset” borra.</li>
    </ol>
  `));

  return wrap;
}

function viewProducts() {
  const el = document.createElement("div");
  el.className = "grid cols2";

  const form = card("Alta de producto (Admin)", `
    <div class="row">
      <div class="field"><label>SKU</label><input id="p_sku" placeholder="EJ: QUES-400" /></div>
      <div class="field"><label>Nombre</label><input id="p_name" placeholder="EJ: Queso 400g" /></div>
    </div>
    <div class="row">
      <div class="field">
        <label>Unidad</label>
        <select id="p_unit">
          <option value="pz">pz</option>
          <option value="caja">caja</option>
          <option value="kg">kg</option>
        </select>
      </div>
      <div class="field"><label>Costo</label><input id="p_cost" type="number" step="0.01" placeholder="0.00" /></div>
      <div class="field"><label>Precio</label><input id="p_price" type="number" step="0.01" placeholder="0.00" /></div>
      <div class="field"><label>Barcode</label><input id="p_bar" placeholder="EAN/UPC" /></div>
    </div>
    <div class="row">
      <button class="btn primary" id="p_add">Agregar</button>
    </div>
    <div class="muted small">Tip: en la demo, al crear producto no se crea stock. Hazlo en Inventario → Ajuste.</div>
  `);

  const list = card("Productos", `
    <table class="table">
      <thead><tr><th>SKU</th><th>Nombre</th><th>Unidad</th><th>Costo</th><th>Precio</th><th>Barcode</th></tr></thead>
      <tbody>
        ${db.products.map(p => `
          <tr>
            <td>${p.sku}</td><td>${p.name}</td><td>${p.unit}</td>
            <td>${money(p.cost)}</td><td>${money(p.price)}</td><td class="muted">${p.barcode || "—"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `);

  el.appendChild(form);
  el.appendChild(list);

  setTimeout(() => {
    const btn = $("#p_add");
    btn.onclick = () => {
      const sku = $("#p_sku").value.trim();
      const name = $("#p_name").value.trim();
      const unit = $("#p_unit").value;
      const cost = num($("#p_cost").value);
      const price = num($("#p_price").value);
      const barcode = $("#p_bar").value.trim();

      if (!sku || !name) return alert("SKU y Nombre son obligatorios.");
      if (db.products.some(x => x.sku.toUpperCase() === sku.toUpperCase())) return alert("SKU ya existe.");

      db.products.push({ id: uid(), sku, name, unit, cost, price, barcode });
      saveDB(db);
      render();
    };
  }, 0);

  return el;
}

function viewInventory() {
  const branchId = "BR-001";
  const warehouseId = "WH-001";
  const onHand = calcOnHand(branchId, warehouseId);

  const el = document.createElement("div");
  el.className = "grid cols2";

  const move = card("Movimiento de inventario (Ajuste)", `
    <div class="row">
      <div class="field">
        <label>Producto</label>
        <select id="inv_prod">
          ${db.products.map(p => `<option value="${p.id}">${p.sku} — ${p.name}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>Tipo</label>
        <select id="inv_type">
          <option value="ADJ">Ajuste</option>
          <option value="COUNT">Conteo (físico)</option>
        </select>
      </div>
    </div>
    <div class="row">
      <div class="field"><label>Cantidad</label><input id="inv_qty" type="number" step="1" placeholder="Ej: 5 o -3" /></div>
      <div class="field"><label>Costo unitario (opcional)</label><input id="inv_cost" type="number" step="0.01" placeholder="Solo para entradas" /></div>
      <div class="field"><label>Nota</label><input id="inv_note" placeholder="Motivo" /></div>
    </div>
    <div class="row">
      <button class="btn primary" id="inv_add">Registrar</button>
    </div>
    <div class="muted small">Conteo (físico) no mueve stock; guarda “real” para comparar en Reportes.</div>
  `);

  const table = card("Stock teórico (por movimientos)", `
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
    $("#inv_add").onclick = () => {
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
  const branchId = "BR-001";
  const warehouseId = "WH-001";

  const el = document.createElement("div");
  el.className = "grid cols2";

  const form = card("Crear Orden de Compra (OC)", `
    <div class="row">
      <div class="field"><label>Proveedor</label><input id="po_vendor" placeholder="Ej: Proveedor A" /></div>
      <div class="field"><label>Fecha</label><input id="po_date" type="date" value="${todayISO()}" /></div>
    </div>
    <div class="row">
      <div class="field">
        <label>Producto</label>
        <select id="po_prod">
          ${db.products.map(p => `<option value="${p.id}">${p.sku} — ${p.name}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>Cantidad</label><input id="po_qty" type="number" step="1" value="10" /></div>
      <div class="field"><label>Costo unitario</label><input id="po_cost" type="number" step="0.01" placeholder="0.00" /></div>
    </div>
    <div class="row">
      <button class="btn" id="po_add_line">Agregar línea</button>
      <button class="btn primary" id="po_create">Crear OC</button>
    </div>
    <div class="hr"></div>
    <div class="muted small">Líneas:</div>
    <div id="po_lines" class="small"></div>
  `);

  const list = card("Órdenes de compra", `
    <table class="table">
      <thead><tr><th>OC</th><th>Proveedor</th><th>Fecha</th><th>Estado</th><th>Total</th><th>Acción</th></tr></thead>
      <tbody>
        ${db.purchaseOrders.map(po => {
          const total = po.lines.reduce((acc,l)=>acc + (num(l.qty)*num(l.unitCost)), 0);
          return `<tr>
            <td>${po.code}</td>
            <td>${po.vendor}</td>
            <td>${po.date}</td>
            <td>${po.status}</td>
            <td>${money(total)}</td>
            <td>
              ${po.status !== "RECEIVED" ? `<button class="btn" data-recv="${po.id}">Recibir</button>` : `<span class="badge ok">OK</span>`}
            </td>
          </tr>`;
        }).join("")}
      </tbody>
    </table>
  `);

  el.appendChild(form);
  el.appendChild(list);

  // Estado temporal de líneas
  let tempLines = [];

  function paintLines() {
    const host = $("#po_lines");
    host.innerHTML = tempLines.length
      ? `<ul>${tempLines.map(l => {
          const p = productById(l.productId);
          return `<li>${p.sku}: ${l.qty} x ${money(l.unitCost)}</li>`;
        }).join("")}</ul>`
      : `<span class="muted">Sin líneas</span>`;
  }

  setTimeout(() => {
    paintLines();

    $("#po_add_line").onclick = () => {
      const productId = $("#po_prod").value;
      const qty = num($("#po_qty").value);
      const unitCost = num($("#po_cost").value || (productById(productId)?.cost ?? 0));
      if (!productId || qty <= 0) return alert("Producto y cantidad > 0.");
      tempLines.push({ productId, qty, unitCost });
      paintLines();
    };

    $("#po_create").onclick = () => {
      const vendor = $("#po_vendor").value.trim() || "Proveedor";
      const date = $("#po_date").value || todayISO();
      if (tempLines.length === 0) return alert("Agrega al menos 1 línea.");

      const poId = uid();
      const code = `OC-${String(db.purchaseOrders.length+1).padStart(4,"0")}`;

      db.purchaseOrders.push({
        id: poId, code, vendor, date,
        status: "OPEN",
        branchId, warehouseId,
        userId: db.currentUserId,
        lines: tempLines,
        receivedLines: [] // {productId, qtyReceived, unitCost}
      });

      tempLines = [];
      saveDB(db);
      render();
    };

    // Recibir OC (simple: recibe todo o parcial por prompt)
    $("#view").addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-recv]");
      if (!btn) return;
      const poId = btn.getAttribute("data-recv");
      const po = db.purchaseOrders.find(x => x.id === poId);
      if (!po) return;

      if (!confirm(`Recibir OC ${po.code}. ¿Continuar?`)) return;

      po.lines.forEach(line => {
        const p = productById(line.productId);
        const max = line.qty;
        const input = prompt(`Cantidad recibida para ${p.sku} (0 - ${max})`, String(max));
        const rec = Math.max(0, Math.min(max, num(input)));
        if (rec <= 0) return;

        po.receivedLines.push({ productId: line.productId, qtyReceived: rec, unitCost: line.unitCost });

        db.stockMoves.push({
          id: uid(),
          ts: new Date().toISOString(),
          date: todayISO(),
          type: "RECEIVE",
          productId: line.productId,
          qty: rec,
          unitCost: line.unitCost,
          note: `Recepción ${po.code}`,
          branchId, warehouseId,
          userId: db.currentUserId,
          ref: po.id
        });
      });

      // si ya recibió todo (sumas >= qty), marcar received
      const receivedMap = new Map();
      po.receivedLines.forEach(r => receivedMap.set(r.productId, (receivedMap.get(r.productId)||0) + num(r.qtyReceived)));
      const allDone = po.lines.every(l => (receivedMap.get(l.productId)||0) >= num(l.qty));
      po.status = allDone ? "RECEIVED" : "PARTIAL";

      saveDB(db);
      render();
    }, { once: true });
  }, 0);

  return el;
}

function viewSales() {
  const branchId = "BR-001";
  const warehouseId = "WH-001";

  const el = document.createElement("div");
  el.className = "grid cols2";

  const form = card("Crear pedido (venta)", `
    <div class="row">
      <div class="field"><label>Cliente</label><input id="so_customer" placeholder="Ej: Cliente 1" /></div>
      <div class="field"><label>Fecha</label><input id="so_date" type="date" value="${todayISO()}" /></div>
    </div>
    <div class="row">
      <div class="field">
        <label>Producto</label>
        <select id="so_prod">
          ${db.products.map(p => `<option value="${p.id}">${p.sku} — ${p.name}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>Cantidad</label><input id="so_qty" type="number" step="1" value="1" /></div>
      <div class="field"><label>Precio</label><input id="so_price" type="number" step="0.01" placeholder="0.00" /></div>
    </div>
    <div class="row">
      <button class="btn" id="so_add_line">Agregar línea</button>
      <button class="btn primary" id="so_create">Crear pedido</button>
    </div>
    <div class="hr"></div>
    <div class="muted small">Líneas:</div>
    <div id="so_lines" class="small"></div>
  `);

  const list = card("Pedidos", `
    <table class="table">
      <thead><tr><th>ID</th><th>Cliente</th><th>Fecha</th><th>Estado</th><th>Total</th><th>Acción</th></tr></thead>
      <tbody>
        ${db.stockMoves /* pedidos se reflejan por movimientos; aquí listamos por referencia */
          .filter(m => m.type === "SALE")
          .slice(-30)
          .reverse()
          .map(m => {
            const p = productById(m.productId);
            return `<tr>
              <td class="muted">${m.ref ? String(m.ref).slice(-6) : "—"}</td>
              <td class="muted">—</td>
              <td>${m.date}</td>
              <td><span class="badge ok">DELIVERED</span></td>
              <td>${p ? money(num(p.price)*Math.abs(num(m.qty))) : "—"}</td>
              <td class="muted">Salida stock</td>
            </tr>`;
          }).join("")
        }
      </tbody>
    </table>
    <div class="muted small">En la demo, al “crear pedido” se descuenta stock como entregado (simple).</div>
  `);

  el.appendChild(form);
  el.appendChild(list);

  let tempLines = [];

  function paintLines() {
    const host = $("#so_lines");
    host.innerHTML = tempLines.length
      ? `<ul>${tempLines.map(l => {
          const p = productById(l.productId);
          return `<li>${p.sku}: ${l.qty} x ${money(l.price)}</li>`;
        }).join("")}</ul>`
      : `<span class="muted">Sin líneas</span>`;
  }

  setTimeout(() => {
    paintLines();

    $("#so_add_line").onclick = () => {
      const productId = $("#so_prod").value;
      const qty = num($("#so_qty").value);
      const price = num($("#so_price").value || (productById(productId)?.price ?? 0));
      if (!productId || qty <= 0) return alert("Producto y cantidad > 0.");
      tempLines.push({ productId, qty, price });
      paintLines();
    };

    $("#so_create").onclick = () => {
      const customer = $("#so_customer").value.trim() || "Cliente";
      const date = $("#so_date").value || todayISO();
      if (tempLines.length === 0) return alert("Agrega al menos 1 línea.");

      const soId = uid();

      // En demo: impacta stock directo
      tempLines.forEach(line => {
        db.stockMoves.push({
          id: uid(),
          ts: new Date().toISOString(),
          date,
          type: "SALE",
          productId: line.productId,
          qty: -Math.abs(num(line.qty)),
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
  const branchId = "BR-001";
  const warehouseId = "WH-001";

  const el = document.createElement("div");
  el.className = "grid cols2";

  const form = card("Registrar merma", `
    <div class="row">
      <div class="field">
        <label>Producto</label>
        <select id="w_prod">
          ${db.products.map(p => `<option value="${p.id}">${p.sku} — ${p.name}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>Cantidad</label><input id="w_qty" type="number" step="1" value="1" /></div>
      <div class="field">
        <label>Motivo</label>
        <select id="w_reason">
          <option value="CADUCIDAD">Caducidad</option>
          <option value="DANIADO">Dañado</option>
          <option value="OBSOLETO">Obsoleto / No se vendió</option>
        </select>
      </div>
    </div>
    <div class="row">
      <div class="field"><label>Nota</label><input id="w_note" placeholder="Detalle" /></div>
      <button class="btn danger" id="w_add">Registrar merma</button>
    </div>
  `);

  const list = card("Últimos registros", `
    <table class="table">
      <thead><tr><th>Fecha</th><th>Producto</th><th>Cant.</th><th>Motivo</th><th>Costo aprox</th></tr></thead>
      <tbody>
        ${db.stockMoves
          .filter(m => m.type === "WASTE")
          .slice(-30)
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
    $("#w_add").onclick = () => {
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
  const el = document.createElement("div");
  el.className = "grid cols2";

  const form = card("Captura benchmark (competencia)", `
    <div class="row">
      <div class="field">
        <label>Producto</label>
        <select id="b_prod">
          ${db.products.map(p => `<option value="${p.id}">${p.sku} — ${p.name}</option>`).join("")}
        </select>
      </div>
      <div class="field"><label>Competidor / Tienda</label><input id="b_store" placeholder="Ej: Tienda X" /></div>
      <div class="field"><label>Precio observado</label><input id="b_price" type="number" step="0.01" placeholder="0.00" /></div>
    </div>
    <div class="row">
      <div class="field"><label>Nota</label><input id="b_note" placeholder="Promo, presentación, etc." /></div>
      <button class="btn primary" id="b_add">Guardar</button>
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

  // último conteo físico por producto
  const lastCount = new Map();
  db.physicalCounts
    .filter(c => c.branchId === branchId && c.warehouseId === warehouseId)
    .sort((a,b)=> a.date.localeCompare(b.date))
    .forEach(c => lastCount.set(c.productId, c));

  // Merma 30 días en $
  const from = daysAgoISO(30);
  const wasteMoves = db.stockMoves.filter(m => m.type === "WASTE" && m.date >= from);
  const wasteCost = wasteMoves.reduce((acc,m)=> {
    const avg = calcWeightedAvgCost(m.productId, branchId, warehouseId);
    return acc + (Math.abs(num(m.qty)) * avg);
  }, 0);

  // Reabasto sugerido
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
      <thead><tr><th>Producto</th><th>Teórico</th><th>Real (último)</th><th>Diferencia</th></tr></thead>
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
    <div class="muted small">Captura conteos en Inventario → Tipo “Conteo (físico)”.</div>
  `));

  el.appendChild(card("Merma (últimos 30 días)", `
    <div class="kpi">
      <div class="v">${money(wasteCost)}</div>
      <div class="k">Costo aproximado de merma (promedio ponderado)</div>
    </div>
    <div class="muted small">Esto ya te sirve para vender “control”: si no se mide, solo se llora.</div>
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

// ---------- Arranque ----------
(function init() {
  // si el rol no permite pestaña, dashboard
  const allowedTabs = TABS.filter(t => {
    // can() depende del currentUser, que ya existe
    return can(t.perm);
  }).map(t => t.id);

  if (!allowedTabs.includes(currentTab)) currentTab = "dashboard";
  render();
})();
