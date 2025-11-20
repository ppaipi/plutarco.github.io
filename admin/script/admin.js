const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbzXPqRns7UKWq_vr1ZpA98Dpj7DlLg7XvHiPcWu1usYqaFDY6iMgHgMPdnH_Jk04Qf_/exec";

const loginContainer = document.getElementById("login-container");
const panel = document.getElementById("panel");
const tableHead = document.querySelector("#orders-table thead");
const tableBody = document.querySelector("#orders-table tbody");
const overlay = document.getElementById("overlay");
const detalle = document.getElementById("detalle-contenido");
const ordersTable = document.getElementById("orders-table");
let Products = [];
// Add this helper near the top with other constants
const isOrdersPage = Boolean(document.getElementById('orders-table'));




async function loadProducts() {
  try {
    const res = await fetch('../media/articulos.xlsx?cacheBust=' + Date.now());
    const data = await res.arrayBuffer();

    // Leer el Excel
    const workbook = XLSX.read(data, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convertir la hoja a JSON
    const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    // Mapear a tu formato
    Products = jsonData.map(row => ({
      Codigo: (row["CODIGO BARRA"] || "").toString().trim(),
      Nombre: row["DESCRIPCION LARGA"] || "",
      Descripcion: row["DESCRIPCION ADICIONAL"] || "",
      Categoria: row["RUBRO"] || "",
      SubCategoria: row["SUBRUBRO"] || "",
      Precio: parsePrecio(row["PRECIO VENTA C/IVA"]),
      Proveedor: row["PROVEEDOR"] || "",
    }));

  } catch (err) {
    console.error("Error cargando productos:", err);
  }
}
function parsePrecio(str) {
  if (!str) return 0;
  // Quitar puntos de miles y reemplazar coma decimal por punto
  const limpio = str.replace(/\./g, '').replace(',', '.');
  return parseFloat(limpio) || 0;
}

// ===== Helper: formateo seguro de fechas (evita ReferenceError) =====
function formatDateDisplay(val) {
  if (!val) return "-";
  const iso = String(val).trim();
  // esperar formato YYYY-MM-DD preferido
  const mIso = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (mIso) {
    const y = parseInt(mIso[1], 10);
    const mm = parseInt(mIso[2], 10);
    const dd = parseInt(mIso[3], 10);
    const d = new Date(y, mm - 1, dd); // crear fecha en tiempo local
    return d.toLocaleDateString("es-AR");
  }
  // intentar dd/mm/yyyy => convertir a ISO y reutilizar
  const m = String(val).match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) {
    const iso2 = `${m[3]}-${m[2]}-${m[1]}`;
    return formatDateDisplay(iso2);
  }
  // intento fallback con Date (no recomendado para YYYY-MM-DD strings)
  const d2 = new Date(val);
  if (!isNaN(d2.getTime())) return d2.toLocaleDateString("es-AR");
  return String(val);
}

// ===== Helper: normalizar cualquier valor a ISO YYYY-MM-DD (preferir evitar new Date on YYYY-MM-DD) =====
function parseToISO(val) {
  if (!val) return "";
  const s = String(val).trim();

  // ya es ISO
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  // formato dd/mm/yyyy
  const dmy = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;

  // intentar parsear con Date y extraer componentes en local (fallback)
  const d = new Date(s);
  if (!isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }

  return "";
}


// --- UI HELPERS: modal / confirm / prompt / form / toast ---
// Se añaden aquí para evitar ReferenceError (uiForm no definido)

function uiModalOpen({ title = "", body = "", actions = [] } = {}) {
  const modal = document.getElementById("ui-modal");
  if (!modal) return;
  document.getElementById("ui-modal-title").textContent = title;
  const bodyEl = document.getElementById("ui-modal-body");
  const actionsEl = document.getElementById("ui-modal-actions");
  bodyEl.innerHTML = "";
  actionsEl.innerHTML = "";
  if (typeof body === "string") bodyEl.innerHTML = body;
  else if (body instanceof Node) bodyEl.appendChild(body);

  actions.forEach(a => {
    const btn = document.createElement("button");
    btn.className = `ui-btn ${a.class || ""}`.trim();
    btn.textContent = a.label;
    // proteger contra doble-click: deshabilitar mientras la acción (sincronica o async) se ejecuta
    btn.onclick = async () => {
      if (typeof a.onClick === "function") {
        try {
          btn.disabled = true;
          // permitir que onClick sea sync o async
          await Promise.resolve(a.onClick());
        } finally {
          btn.disabled = false;
        }
      }
    };
    actionsEl.appendChild(btn);
  });

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function uiModalClose() {
  const modal = document.getElementById("ui-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  const bodyEl = document.getElementById("ui-modal-body");
  const actionsEl = document.getElementById("ui-modal-actions");
  if (bodyEl) bodyEl.innerHTML = "";
  if (actionsEl) actionsEl.innerHTML = "";
}

// Toast simple
function uiNotify(text, type = "info", timeout = 3500) {
  const container = document.getElementById("ui-toast-container");
  if (!container) return;
  const t = document.createElement("div");
  t.className = `ui-toast ${type}`;
  t.textContent = text;
  container.appendChild(t);
  setTimeout(() => {
    t.style.opacity = 0;
    setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 220);
  }, timeout);
}

// Alert-like (awaitable)
function uiAlert(message, opts = {}) {
  return new Promise(res => {
    uiModalOpen({
      title: opts.title || (opts.type === "error" ? "Error" : "Aviso"),
      body: `<p style="margin:0 0 8px;">${message}</p>`,
      actions: [
        { label: opts.okLabel || "Aceptar", class: "primary", onClick: () => { uiModalClose(); res(true); } },
      ]
    });
  });
}

// Confirm-like (awaitable)
function uiConfirm(message, opts = {}) {
  return new Promise(res => {
    uiModalOpen({
      title: opts.title || "Confirmar",
      body: `<p style="margin:0 0 8px;">${message}</p>`,
      actions: [
        { label: opts.cancelLabel || "Cancelar", class: "secondary", onClick: () => { uiModalClose(); res(false); } },
        { label: opts.okLabel || "Sí", class: "primary", onClick: () => { uiModalClose(); res(true); } },
      ]
    });
  });
}

// Form helper (awaitable). fields: [{ name, label, type, value, placeholder, required }]
function uiForm(title, fields = []) {
  return new Promise(res => {
    const form = document.createElement("div");
    fields.forEach(f => {
      const label = document.createElement("label");
      label.style.display = "block";
      label.style.marginBottom = "6px";
      label.textContent = f.label || f.name;

      let input;
      if (f.type === "textarea") {
        input = document.createElement("textarea");
        input.className = "ui-textarea";
        input.value = f.value || "";
        input.placeholder = f.placeholder || "";
      } else {
        input = document.createElement("input");
        input.type = f.type || "text";
        input.className = "ui-input";
        input.value = f.value || "";
        input.placeholder = f.placeholder || "";
      }
      input.id = `ui-field-${Math.random().toString(36).slice(2)}`;
      label.appendChild(input);
      form.appendChild(label);
      f._el = input;
    });

    uiModalOpen({
      title: title || "Formulario",
      body: form,
      actions: [
        { label: "Cancelar", class: "secondary", onClick: () => { uiModalClose(); res(null); } },
        { label: "Guardar", class: "primary", onClick: () => {
            const result = {};
            let valid = true;
            fields.forEach(f => {
              const v = f._el.value.trim();
              if (f.required && !v) valid = false;
              result[f.name] = v;
            });
            if (!valid) {
              uiNotify("Completa los campos requeridos", "error");
              return;
            }
            uiModalClose();
            res(result);
          } },
      ]
    });
  });
}

// Commit inline edits desde contenteditable
function commitInlineEdit(row, columnName, type, el) {
  const nuevo = (el.textContent || "").trim();
  const valueToSend = nuevo === "" ? "-" : nuevo;
  // llamar editarCampo pasando el id del elemento y el nuevo valor para evitar prompt
  editarCampo(row, columnName, type, el.id, null, valueToSend);
}

// --- NEW: bind new controls (simplificado) ---
const filterEntregadoEl = document.getElementById("filter-entregado"); // "all"|"TRUE"|"FALSE"
const filterStatusEl = document.getElementById("filter-status"); // "all"|"TRUE"|"FALSE"
const sortOrderEl = document.getElementById("sort-order"); // único selector siempre visible
const searchBar = document.getElementById("searchBar"); // único selector siempre visible
const filterMonthEl = document.getElementById("filter-month"); // nuevo filtro de mes


if (searchBar) searchBar.onchange = applyFiltersAndRender;
if (filterEntregadoEl) filterEntregadoEl.onchange = applyFiltersAndRender;
if (filterStatusEl) filterStatusEl.onchange = applyFiltersAndRender;
if (sortOrderEl) sortOrderEl.onchange = applyFiltersAndRender;
if (filterMonthEl) filterMonthEl.onchange = applyFiltersAndRender; // enlazar nuevo filtro

loginContainer.addEventListener("submit", function(event) {
  event.preventDefault()
    login()
});

document.getElementById("password").addEventListener("keypress", function(event) {
    if (event.key === "Enter") {
       login()
    }
});
let currentOrders = [];

async function login() {
  try {
    const userEl = document.getElementById("user");
    const passEl = document.getElementById("password");
    const msgEl = document.getElementById("login-msg");
    if (msgEl) msgEl.textContent = "";

    const user = userEl ? userEl.value : "";
    const password = passEl ? passEl.value : "";

    const res = await postData({ action: "login", user, password });
    console.log("login response:", res);

    if (res && res.ok) {
      localStorage.setItem("logged", "1");
      if (loginContainer) loginContainer.classList.add("hidden");
      if (panel) panel.classList.remove("hidden");
      await loadOrders();
    } else {
      const reason = (res && (res.error || res.message)) ? (res.error || res.message) : "Usuario o contraseña incorrectos";
      if (msgEl) msgEl.textContent = reason;
      else uiAlert(reason, { type: "error" });
    }
  } catch (err) {
    console.error("login error:", err);
    const msgEl = document.getElementById("login-msg");
    if (msgEl) msgEl.textContent = "Error al conectar con el servidor";
    else uiAlert("Error al conectar con el servidor", { type: "error" });
  }
}

function logout() {
  localStorage.removeItem("logged");
  location.reload();
}

async function loadOrders() {
  const res = await postData({ action: "getOrders" });
  if (!res.ok) { uiAlert("Error al cargar pedidos", { type: "error" }); return; }
  currentOrders = res.orders || [];
  
  // Only do UI updates if we're on orders page
  if (isOrdersPage) {
    initializeMonthFilter();
    applyFiltersAndRender();
  }
  
  return currentOrders; // Return orders for other pages to use
}

// helper: normalizar y comparar flags (TRUE/FALSE/true/false/boolean)
function matchesFlagField(value, filter) {
  if (filter === "all") return true;
  if (value === true || String(value).toUpperCase() === "TRUE") return filter === "TRUE";
  if (value === false || String(value).toUpperCase() === "FALSE") return filter === "FALSE";
  // fallback: compare uppercase string
  return String(value || "").toUpperCase() === filter;
}

// Add this function after loadOrders
function initializeMonthFilter() {
  if (!filterMonthEl) return;
  
  const months = [...new Set(currentOrders.map(order => {
    const date = new Date(order["Hora de envio"]);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }))].sort().reverse();

  filterMonthEl.innerHTML = `
    <option value="all">Todos los meses</option>
    ${months.map(month => {
      const [year, monthNum] = month.split('-');
      const date = new Date(year, monthNum - 1, 1);
      const monthName = date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
      return `<option value="${month}">${monthName}</option>`;
    }).join('')}
  `;

  // Select latest month by default if exists
  if (months.length > 0) {
    filterMonthEl.value = months[0]; // First month is latest since array is reversed
  }
}

// Update applyFiltersAndRender to include month filter
function applyFiltersAndRender() {
  if (!isOrdersPage) return;

  const query = document.getElementById("search")?.value.toLowerCase() || "";
  const status = document.getElementById("filter-status")?.value || "all";
  const entregado = filterEntregadoEl?.value || "all";
  const sortOrder = sortOrderEl?.value || "desc";
  const month = document.getElementById("filter-month")?.value || "all"; // Add this line

  let filtered = currentOrders.map((o, idx) => ({ o, originalIndex: idx }))
    .filter(({ o }) => {
      const matchesText = query === "" || Object.values(o).some(v => String(v).toLowerCase().includes(query));
      const matchesStatus = matchesFlagField(o["confirmado y pagado"], status);
      const matchesEntregado = matchesFlagField(o["entregado"], entregado);
      
      // Fix month filtering
      const matchesMonth = month === "all" || (() => {
        const date = new Date(o["Hora de envio"]);
        const orderMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        return orderMonth === month;
      })();

      return matchesText && matchesStatus && matchesEntregado && matchesMonth;
    });

  filtered.sort((a, b) => {
    const ta = new Date(a.o["Hora de envio"]).getTime() || 0;
    const tb = new Date(b.o["Hora de envio"]).getTime() || 0;
    return sortOrder === "asc" ? ta - tb : tb - ta;  // Now uses the correctly defined sortOrder
  });

  renderTable(filtered);
}

function renderTable(items) {
  // Skip if not on orders page
  if (!isOrdersPage) return;
  
  // items: array de { o: orderObject, originalIndex: number }
  tableHead.innerHTML = `
    <tr>
      <th>Fecha</th>
      <th>Nombre</th>
      <th>Dirección</th>
      <th>Total</th>
      <th>Confirmado</th>
      <th>Entregado</th>
      <th>Acciones</th>
    </tr>`;

  tableBody.innerHTML = items.map(({ o, originalIndex }, i) => `
    <tr>
      <td>${new Date(o["Hora de envio"]).toLocaleString()}</td>
      <td>${o.Nombre}</td>
      <td>
        <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.Direccion)}" 
          target="_blank" 
          style="color: var(--accent); text-decoration: none;">
          ${o.Direccion}
        </a>
      </td>
      <td>$${o.total}</td>
      <td>
        <input class="check" type="checkbox" ${o["confirmado y pagado"] === true || o["confirmado y pagado"] === "TRUE" ? "checked" : ""} 
        onchange="toggleCheck(${originalIndex}, 'confirmado y pagado', this.checked)">
      </td>
      <td>
        <input class="check" type="checkbox" ${o["entregado"] === true || o["entregado"] === "TRUE" ? "checked" : ""} 
        onchange="toggleCheck(${originalIndex}, 'entregado', this.checked)">
      </td>
      <td class="acciones">
        <button class="btn-ver" onclick="verDetalle(${originalIndex})">👁️ Ver</button>
        <button class="btn-eliminar" onclick="eliminarPedido(${originalIndex})">🗑️ Eliminar</button>
      </td>
    </tr>
  `).join("");
}

async function toggleCheck(i, field, checked) {
  await postData({ action: "updateCell", rowIndex: i, columnName: field, value: checked ? "TRUE" : "FALSE" });
}

// actualizar eliminarPedido -> usar uiConfirm y uiNotify
async function eliminarPedido(i) {
  const ok = await uiConfirm("¿Seguro que deseas eliminar este pedido completo?");
  if (!ok) return;
  const res = await postData({ action: "deleteOrder", rowIndex: i });
  if (res.ok) {
    uiNotify("Pedido eliminado correctamente", "success");
    await loadOrders();
  } else {
    uiAlert("Error al eliminar pedido", { type: "error" });
  }
}


function parseProductos(str) {
  if (!str) return [];

  // Formato viejo (sin |)
  if (!str.includes("|")) {
    return str.split(", ").map(p => {
      const match = p.match(/(.+?) x(\d+) \(\$(\d+)\)/);
      if (!match) return null;
      return { codigo: "", nombre: match[1], unidades: match[2], total: match[3] };
    }).filter(Boolean);
  }

  // Formato nuevo con posibles errores
  return str.split(",").map(p => {
    let parts = p.trim().split("|").map(x => x.trim()).filter(Boolean);

    if (parts.length < 4) {
      // caso raro: precio y cantidad invertidos o faltantes
      if (parts.length === 3) {
        const [codigo, nombre, resto] = parts;
        const nums = resto.match(/\d+/g) || [];
        return {
          codigo,
          nombre,
          unidades: nums[1] || nums[0] || "1",
          total: nums[0] || "0"
        };
      }
      return null;
    }

    let [codigo, nombre, unidades, total] = parts;

    // Detectar si precio y unidades están invertidos
    if (parseInt(unidades) > 1000 && parseInt(total) <= 10) {
      [unidades, total] = [total, unidades];
    }

    return { codigo, nombre, unidades, total };
  }).filter(Boolean);
}

function verDetalle(i) {
  const o = currentOrders[i];
  overlay.classList.add("active");

  const productos = parseProductos(o.Productos || "");

  const productosHTML = productos.map((p, idx) => `
    <div class="producto">
      <img src="../media/PRODUCTOS/${p.codigo}.jpg" onerror="this.src='../media/PRODUCTOS/placeholder.jpg'">
      <div class="producto-info">
        <p><strong>${p.nombre}</strong></p>
        <p>${p.unidades} x $${p.total}</p>
      </div>
      <div class="producto-actions">
        <button class="buttom_edit" onclick="editarProducto(${i}, ${idx})">✏️</button>
        <button class="buttom_edit" onclick="eliminarProducto(${i}, '${p.codigo}')">🗑️</button>
      </div>
    </div>
  `).join("");

detalle.innerHTML = `
  <button class="cerrar" onclick="cerrarDetalle()">❌</button>

  <div class="detalle-scroll">
    <h3>🛍️ Pedido de ${o.Nombre}</h3>

    <p><strong>📦 Envío de Pedido:</strong> ${new Date(o["Hora de envio"]).toLocaleString("es-AR")}</p>

    ${editableField(i, "🚚 Fecha de entrega", "dia de entrega", o["dia de entrega"], "date")}

    ${editableField(i, "🏷️ Nombre", "Nombre", o.Nombre, "text")}
    ${editableLinkField(i, "Email", "📧 Email", o.Email, o.Email ? "mailto:" + encodeURIComponent(o.Email) : "#")}

    ${editableLinkField(i, "Telefono", "📞 Teléfono", o.Telefono || "-", o.Telefono ? "https://wa.me/" + String(o.Telefono).replace(/\D/g, "") : "#")}

    ${editableLinkField(i, "Direccion", "📍 Dirección", o.Direccion || "-", o.Direccion ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(o.Direccion) : "#")}

    ${editableField(i, "💬 Comentario", "Comentario", o.Comentario || "-", "text")}

    <h4>💵 Resumen del Pedido</h4>
    <table class="resumen-precios" style="width:100%; border-collapse:collapse;">
      <tr>
        <td>💰 Subtotal:</td>
        <td style="text-align:right;">$${o.Subtotal}</td>
      </tr>

      <tr>
        <td>🚗 Envío cobrado:</td>
        <td style="text-align:right;">
          <button class="buttom_edit" onclick="editarCampo(${i}, 'Envio', 'number')">✏️</button>
          $<span id="val_${i}_Envio">${o.Envio || 0}</span>
        </td>
      </tr>

      <tr>
        <td>📦 Costo envío (real):</td>
        <td style="text-align:right;">
          <button class="buttom_edit" onclick="editarCampo(${i}, 'COSTO ENVIO', 'number')">✏️</button>
          $<span id="val_${i}_COSTO_ENVIO">${o["COSTO ENVIO"] || 0}</span>
        </td>
      </tr>

      <tr>
        <td>💵 Total:</td>
        <td style="text-align:right;"><strong>$${o.total}</strong></td>
      </tr>
    </table>


    <h4>🧺 Productos</h4>
    <div class="productos-grid">
      ${productosHTML}
    </div>

    <div style="margin-top:12px;">
      <button onclick="agregarProducto(${i})">➕ Agregar producto</button>
    </div>
  </div>
`;
}

function cerrarDetalle() {
  overlay.classList.remove("active");
}

function editableField(row, label, columnName, value, type = "text") {
  const safeKey = String(columnName).replace(/[^a-z0-9_]/gi, '_');
  const safeId = `val_${row}_${safeKey}`;
  const raw = (value === undefined || value === null || value === "") ? "" : String(value);
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const colEsc = String(columnName).replace(/'/g, "\\'");
  const typeEsc = String(type).replace(/'/g, "\\'");

  // Si es campo fecha, no usar contenteditable: almacenamos valor ISO en dataset.value y mostramos legible
  if (type === "day" || type === "date") {
    // normalizar a ISO usando helper (evita crear Date con UTC)
    const iso = parseToISO(raw);
    const display = iso ? esc(formatDateDisplay(iso)) : "-";
    return `
      <p>
        <strong>${esc(label)}:</strong>
        <span id="${safeId}" class="inline-view" data-value="${iso}">${display}</span>
        <button class="buttom_edit" onclick="editarCampo(${row}, '${colEsc}', 'date', '${safeId}')">✏️</button>
      </p>
    `;
  }

  // comportamiento por defecto (texto editable inline)
  const display = (raw === "") ? "-" : esc(raw);

  return `
    <p>
      <strong>${esc(label)}:</strong>
      <span id="${safeId}" class="inline-view" contenteditable="true"
            data-old="${esc(raw)}"
            onfocus="this.dataset.old=this.textContent;"
            onblur="commitInlineEdit(${row}, '${colEsc}', '${typeEsc}', this)"
            onkeydown="if(event.key==='Enter'){event.preventDefault(); this.blur();} else if(event.key==='Escape'){this.textContent=this.dataset.old||''; this.blur();}">
        ${display}
      </span>
      <button class="buttom_edit" onclick="editarCampo(${row}, '${colEsc}', '${typeEsc}', '${safeId}')">✏️</button>
    </p>
  `;
}


// 1) Generador de campo link + botón editar
function editableLinkField(row, columnName, label, value, href, type = "text") {
  const safeId = `val_${row}_${String(columnName).replace(/[^a-z0-9_]/gi, '_')}`;
  const safeHref = href ? href.replace(/'/g, "\\'") : '#';
  const safeColumn = String(columnName).replace(/'/g, "\\'");
  const safeType = String(type).replace(/'/g, "\\'");
  const safeLabel = String(label).replace(/'/g, "\\'");

  return `
    <p>
      <strong>${safeLabel}:</strong>
      <a id="${safeId}" href="${safeHref}" target="_blank" style="color: var(--accent); text-decoration: none;">
        ${value || '-'}
      </a>
      <button class="buttom_edit" onclick="editarCampo(${row}, '${safeColumn}', '${safeType}', '${safeId}', '${safeHref}')">✏️</button>
    </p>
  `;
}


async function editarCampo(row, columnName, type = "text", elementId = null, hrefTemplate = null, nuevoValor) {
  if (!elementId) {
    elementId = `val_${row}_${String(columnName).replace(/[^a-z0-9_]/gi, '_')}`;
  }

  const el = document.getElementById(elementId);
  // obtener oldValue preferentemente desde dataset.value (usado por campos fecha)
  let oldValue = "";
  if (el) {
    if (el.dataset && typeof el.dataset.value !== "undefined" && el.dataset.value !== "") {
      oldValue = el.dataset.value;
    } else {
      oldValue = el.textContent.trim();
      // si estaba '-' considerarlo vacío
      if (oldValue === "-") oldValue = "";
    }
  }

  let nuevo = typeof nuevoValor !== "undefined" ? nuevoValor : null;

  if (nuevo === null) {
    // si no se pasó valor, usamos modal prompt ligero
    const fieldType = (type === "date" || type === "day") ? "date" : (type === "number" ? "number" : "text");
    const res = await uiForm(`Editar ${columnName}`, [
      { name: "value", label: columnName, value: oldValue || "", type: fieldType, required: false }
    ]);
    if (!res) return; // canceló
    nuevo = res.value;
  }

  if (type === "number" && nuevo !== "" && isNaN(nuevo)) {
    uiNotify("Por favor ingresa un número válido", "error");
    return;
  }

  try {
    await postData({
      action: "updateCell",
      rowIndex: row,
      columnName: columnName,
      value: nuevo
    });

    // si el elemento tiene dataset.value (campo fecha) actualizar dataset y texto mostrado
    if (el) {
      if (type === "date" || type === "day") {
        // normalizar nuevo a ISO y mostrar con formato local
        const isoNuevo = parseToISO(nuevo);
        el.dataset.value = isoNuevo;
        el.textContent = isoNuevo ? formatDateDisplay(isoNuevo) : "-";
      } else {
        el.textContent = nuevo || "-";
      }
    }

    if (currentOrders && currentOrders[row]) {
      currentOrders[row][columnName] = nuevo;
    }

    if (columnName === "Envio" || columnName === "Subtotal") {
      const sub = parseFloat(currentOrders[row].Subtotal) || 0;
      const envio = parseFloat(currentOrders[row].Envio) || 0;
      const nuevoTotal = sub + envio;

      currentOrders[row].total = nuevoTotal;

      const totalEl = document.querySelector(`#detalle-contenido strong`);
      if (totalEl) totalEl.textContent = `$${nuevoTotal.toFixed(2)}`;
      await postData({
        action: "updateCell",
        rowIndex: row,
        columnName: "total",
        value: nuevoTotal
      });
    }

    if (columnName === "Email") {
      if (el && el.tagName === "A") el.href = nuevo ? `mailto:${encodeURIComponent(nuevo)}` : "#";
    } else if (columnName === "Telefono") {
      const digits = String(nuevo || "").replace(/\D/g, "");
      if (el && el.tagName === "A") el.href = digits ? `https://wa.me/${digits}` : "#";
    } else if (columnName === "Direccion") {
      if (el && el.tagName === "A") el.href = nuevo
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nuevo)}`
        : "#";
    }

    uiNotify("Guardado correctamente", "success");
    await loadOrders();
    verDetalle(row);
  } catch (err) {
    uiAlert("Error al guardar: " + (err.message || err), { type: "error" });
  }
}
async function UiFormProduct(buscando) {
  return new Promise(res => {
    const wrapper = document.createElement("div");
    wrapper.className = "ui-form-product";

    // --- Fila principal (cantidad + búsqueda) ---
    const row = document.createElement("div");
    row.className = "ui-form-row";

    const qtyInput = createInput("number", "Cantidad", "ui-input qty-input", 1);
    const searchInput = createInput("text", "Buscar código o producto...", "ui-input search-input", buscando || "");
    row.appendChild(qtyInput);
    row.appendChild(searchInput);

    const suggestions = document.createElement("div");
    suggestions.className = "ui-suggestions";

    const details = document.createElement("div");
    details.className = "ui-product-details";
    details.style.display = "none";

    wrapper.append(row, suggestions, details);
    let selected = null;

    // ===============================
    // 🔹 SUBFUNCIONES
    // ===============================

    function createInput(type, placeholder, cls, value = "") {
      const input = document.createElement("input");
      input.type = type;
      input.placeholder = placeholder;
      input.className = cls;
      if (value !== undefined) input.value = value;
      return input;
    }

    function buscarProductos(q) {
      q = q.toLowerCase().trim();
      if (!q) {
        suggestions.style.display = "none";
        return;
      }
      const matches = Products.filter(p =>
        p.Nombre.toLowerCase().includes(q) ||
        p.Codigo.toLowerCase().includes(q)
      ).slice(0, 6);
      renderSuggestions(matches, q);
    }

    function renderSuggestions(list, query) {
      suggestions.innerHTML = "";

      if (list.length === 0 && query) {
        // ➕ Opción de crear nuevo producto
        const createNew = document.createElement("div");
        createNew.className = "ui-suggestion-item new";
        createNew.innerHTML = `➕ Crear producto <strong>"${query}"</strong>`;
        createNew.onclick = () => crearNuevoProducto(query);
        suggestions.appendChild(createNew);
        suggestions.style.display = "block";
        return;
      }

      list.forEach(prod => {
        const item = document.createElement("div");
        item.className = "ui-suggestion-item";
        item.innerHTML = `<strong>${prod.Nombre}</strong><br><small>${prod.Codigo} — $${prod.Precio}</small>`;
        item.onclick = () => {
          selected = prod;
          qtyInput.value = 1;
          renderDetails(prod);
          suggestions.style.display = "none";
        };
        suggestions.appendChild(item);
      });
      suggestions.style.display = "block";
    }

    async function crearNuevoProducto(query) {
      const newProd = await uiForm("Nuevo producto", [
        { name: "Codigo", label: "Código", value: query, required: true },
        { name: "Nombre", label: "Nombre", value: query, required: true },
        { name: "Precio", label: "Precio unitario", type: "number", value: "", required: true },
      ]);
      if (!newProd) return;

      newProd.Precio = parseFloat(newProd.Precio) || 0;
      Products.push(newProd);
      selected = newProd;

      renderDetails(newProd);
      suggestions.style.display = "none";
      uiNotify(`Producto "${newProd.Nombre}" creado`, "success");

      // 🔹 Simular que el usuario apretó "Aceptar"
      const unidades = parseInt(qtyInput.value) || 1;
      const total = unidades * parseFloat(selected.Precio || 0);
      uiModalClose();

      res({
        codigo: selected.Codigo,
        nombre: selected.Nombre,
        unidades,
        total,
        precioUnitario: selected.Precio
      });
    }



    async function editarProductoExistente(prod) {
      const editProd = await uiForm("Editar producto", [
        { name: "Codigo", label: "Código", value: prod.Codigo, required: true },
        { name: "Nombre", label: "Nombre", value: prod.Nombre, required: true },
        { name: "Precio", label: "Precio unitario", type: "number", value: prod.Precio, required: true },
      ]);
      if (!editProd) return;

      editProd.Precio = parseFloat(editProd.Precio) || 0;
      Object.assign(prod, editProd);
      selected = prod;
      renderDetails(prod);
      uiNotify("Producto actualizado", "info");
    }

    function renderDetails(prod) {
      details.innerHTML = `
        <p><strong>Código:</strong> ${prod.Codigo}</p>
        <p><strong>Producto:</strong> ${prod.Nombre}</p>
        <p><strong>Precio unitario:</strong> $${prod.Precio}</p>
        <div style="margin-top:10px;">
          <button class="btn-mini" id="edit-product">✏️ Editar antes de agregar</button>
        </div>
      `;
      details.style.display = "block";

      // Editar producto
      details.querySelector("#edit-product").onclick = () => editarProductoExistente(prod);
    }

    // ===============================
    // 🔹 EVENTOS
    // ===============================

    searchInput.oninput = e => buscarProductos(e.target.value);

    if (buscando) {
      selected = Products.find(p => p.Codigo === buscando) || null;
      if (selected) renderDetails(selected);
    }

    // ===============================
    // 🔹 MODAL PRINCIPAL
    // ===============================

    uiModalOpen({
      title: "Agregar producto",
      body: wrapper,
      actions: [
        { label: "Cancelar", class: "secondary", onClick: () => { uiModalClose(); res(null); } },
        {
          label: "Aceptar",
          class: "primary",
          onClick: () => {
            if (!selected) {
              uiNotify("Selecciona o crea un producto primero", "error");
              return;
            }
            const unidades = parseInt(qtyInput.value) || 1;
            const total = unidades * parseFloat(selected.Precio || 0);
            uiModalClose();

            // ✅ Retornar producto seleccionado (nuevo o existente)
            res({
              codigo: selected.Codigo,
              nombre: selected.Nombre,
              unidades,
              total,
              precioUnitario: selected.Precio
            });
          }
        },
      ]
    });
  });
}



async function agregarProducto(row) {
  const form = await UiFormProduct();
  if (!form) return;

  const pedido = currentOrders[row];
  const productos = parseProductos(pedido.Productos || "");

  // Agregar el nuevo producto a la lista
  productos.push(form);

  // 🔹 Actualizar localmente el string de productos
  pedido.Productos = productos.map(p => `${p.codigo}|${p.nombre}|${p.unidades}|${p.total}`).join(",");

  // 🔹 Recalcular subtotal y total en memoria
  const subtotal = productos.reduce((acc, p) => acc + parseFloat(p.total || 0), 0);
  pedido.Subtotal = subtotal.toFixed(2);
  pedido.total = (subtotal + (parseFloat(pedido.Envio) || 0)).toFixed(2);

  // 🔹 Enviar los cambios al servidor (sin esperar recarga completa)
  await postData({ action: "updateProductos", rowIndex: row, productos });

  // 🔹 Actualizar visualmente el detalle sin cerrar
  uiNotify("Producto agregado correctamente", "success");
  verDetalle(row);
}



async function editarProducto(row, idx) {
  const pedido = currentOrders[row];
  const productos = parseProductos(pedido.Productos || "");
  const p = productos[idx];

  const form = await uiForm("Editar producto", [
    { name: "codigo", label: "Código", value: p.codigo || "", required: true },
    { name: "nombre", label: "Nombre", value: p.nombre || "", required: true },
    { name: "unidades", label: "Cantidad", value: p.unidades || "", type: "number", required: true },
    { name: "total", label: "Precio total", value: p.total || "", type: "number", required: true },
  ]);
  if (!form) return;

  productos[idx] = { codigo: form.codigo, nombre: form.nombre, unidades: form.unidades, total: form.total };
  await postData({ action: "updateProductos", rowIndex: row, productos });
  uiNotify("Producto editado", "success");
  await loadOrders();
  verDetalle(row);
}

async function eliminarProducto(row, codigo) {
  const ok = await uiConfirm("¿Eliminar este producto?");
  if (!ok) return;
  await postData({ action: "deleteProducto", rowIndex: row, codigo });
  await loadOrders();
  verDetalle(row);
  uiNotify("Producto eliminado", "info");
}





// === CREAR NUEVO PEDIDO ===
const newOrderBtn = document.getElementById("new-order-btn");
if (newOrderBtn) newOrderBtn.onclick = crearNuevoPedido;

async function crearNuevoPedido() {
  const res = await uiForm("Nuevo pedido", [
    { name: "nombre", label: "Nombre del cliente", value: "", required: true },
    { name: "direccion", label: "Dirección de entrega", value: "", required: true },
    { name: "telefono", label: "Teléfono", value: "", required: false },
    { name: "mail", label: "Email", value: "", required: false },
    { name: "comentario", label: "Comentario u observación", value: "", type: "textarea", required: false },
  ]);
  if (!res) return;

  const nuevoPedido = {
    action: "createOrder",
    nombre: res.nombre,
    direccion: res.direccion,
    telefono: res.telefono,
    mail: res.mail,
    comentario: res.comentario
  };

  const r = await postData(nuevoPedido);

  if (r.ok) {
    await loadOrders();
    uiNotify("✅ Pedido creado correctamente", "success");
  } else {
    uiAlert("❌ Error al crear el pedido", { type: "error" });
  }
}



// ======= NUEVAS UTILIDADES PARA EVITAR DOBLE-ENVÍO / COLAS POR CELDA =======
const inflightRequests = new Map(); // dedupe por payloadKey
const cellQueues = new Map(); // serializar por celda (action|rowIndex|columnName)

function makePayloadKey(payload) {
  // Para peticiones generales: stringify completo
  try { return JSON.stringify(payload); } catch (e) { return String(payload); }
}

function makeCellKey(payload) {
  // Para operaciones por celda (si aplican) queremos serializar por celda
  if (payload && typeof payload.rowIndex !== "undefined" && payload.columnName) {
    return `${payload.action}|${payload.rowIndex}|${payload.columnName}`;
  }
  return null;
}

// Encola llamadas por celda: garantiza ejecución secuencial
function enqueueByCell(payload, fn) {
  const cellKey = makeCellKey(payload);
  if (!cellKey) {
    // no es una operación por celda -> ejecutar directamente con dedupe normal
    return fn();
  }
  const prev = cellQueues.get(cellKey) || Promise.resolve();
  const next = prev.then(() => fn()).catch(err => { throw err; });
  cellQueues.set(cellKey, next.finally(() => {
    // limpiar si es la misma promesa final
    if (cellQueues.get(cellKey) === next) cellQueues.delete(cellKey);
  }));
  return next;
}

// ======= REEMPLAZO: postData con dedupe y serialización por celda =======
async function postData(payload) {
  // si ya hay una petición idéntica en vuelo, reutilizar su promesa
  const payloadKey = makePayloadKey(payload);
  if (inflightRequests.has(payloadKey)) {
    return inflightRequests.get(payloadKey);
  }

  const doFetch = async () => {
    const formData = new URLSearchParams();
    formData.append('data', JSON.stringify(payload));
    try {
      const res = await fetch(WEBAPP_URL, { method: "POST", body: formData });
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        return json;
      } catch (e) {
        console.error("Invalid JSON from server:", text);
        return { ok: false, error: "Respuesta inválida del servidor", raw: text };
      }
    } catch (err) {
      console.error("postData error", err);
      return { ok: false, error: err.message || String(err) };
    }
  };

  // Encolar por celda si aplica, y utilizar inflightRequests para dedupe exacto
  const promise = enqueueByCell(payload, doFetch);
  inflightRequests.set(payloadKey, promise);

  // asegurarse de limpiar el inflight cuando termine
  promise.finally(() => {
    if (inflightRequests.get(payloadKey) === promise) inflightRequests.delete(payloadKey);
  });

  return promise;
}

// Restaurar comprobación de sesión: si ya está logueado cargar panel (productos + pedidos)
// Se ejecuta en IIFE async para poder await loadProducts/loadOrders y evitar carreras.
if (localStorage.getItem("logged")) {
  (async () => {
    if (loginContainer) loginContainer.classList.add("hidden");
    if (panel) panel.classList.remove("hidden");
    // cargar productos primero (si aplica) y luego pedidos
    try {
      await loadProducts();
    } catch (e) {
      console.warn("loadProducts failed on startup:", e);
    }
    try {
      await loadOrders();
    } catch (e) {
      console.warn("loadOrders failed on startup:", e);
    }
  })();
}