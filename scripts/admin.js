const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbzXPqRns7UKWq_vr1ZpA98Dpj7DlLg7XvHiPcWu1usYqaFDY6iMgHgMPdnH_Jk04Qf_/exec";

const loginContainer = document.getElementById("login-container");
const panel = document.getElementById("panel");
const tableHead = document.querySelector("#orders-table thead");
const tableBody = document.querySelector("#orders-table tbody");
const overlay = document.getElementById("overlay");
const detalle = document.getElementById("detalle-contenido");
let Products = [];


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
    btn.onclick = () => { if (typeof a.onClick === "function") a.onClick(); };
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


if (searchBar) searchBar.onchange = applyFiltersAndRender;
if (filterEntregadoEl) filterEntregadoEl.onchange = applyFiltersAndRender;
if (filterStatusEl) filterStatusEl.onchange = applyFiltersAndRender;
if (sortOrderEl) sortOrderEl.onchange = applyFiltersAndRender;

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
      loadOrders();
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
  applyFiltersAndRender();
}

// helper: normalizar y comparar flags (TRUE/FALSE/true/false/boolean)
function matchesFlagField(value, filter) {
  if (filter === "all") return true;
  if (value === true || String(value).toUpperCase() === "TRUE") return filter === "TRUE";
  if (value === false || String(value).toUpperCase() === "FALSE") return filter === "FALSE";
  // fallback: compare uppercase string
  return String(value || "").toUpperCase() === filter;
}

function applyFiltersAndRender() {
  const query = document.getElementById("search") ? document.getElementById("search").value.toLowerCase() : "";
  const status = document.getElementById("filter-status") ? document.getElementById("filter-status").value : "all";
  const entregado = filterEntregadoEl ? filterEntregadoEl.value : "all";

  // usar selector global de orden siempre visible
  const sortOrder = sortOrderEl ? sortOrderEl.value : 'desc';

  let filtered = currentOrders.map((o, idx) => ({ o, originalIndex: idx }))
    .filter(({ o }) => {
      const matchesText = query === "" || Object.values(o).some(v => String(v).toLowerCase().includes(query));
      const matchesStatus = matchesFlagField(o["confirmado y pagado"], status);
      const matchesEntregado = matchesFlagField(o["entregado"], entregado);
      return matchesText && matchesStatus && matchesEntregado;
    });

  filtered.sort((a, b) => {
    const ta = new Date(a.o["Hora de envio"]).getTime() || 0;
    const tb = new Date(b.o["Hora de envio"]).getTime() || 0;
    return sortOrder === "asc" ? ta - tb : tb - ta;
  });

  renderTable(filtered);
}

function renderTable(items) {
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
    loadOrders();
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
    <p><strong>🚚 Fecha de entrega:</strong> ${
      o["dia de entrega"]
        ? new Date(o["dia de entrega"]).toLocaleDateString("es-AR")
        : "No especificada"
    }</p>

    ${editableField(i, "🏷️ Nombre", o.Nombre, "text")}
    ${editableLinkField(i, "Email", "📧 Email", o.Email, o.Email ? "mailto:" + encodeURIComponent(o.Email) : "#")}

    ${editableLinkField(i, "Telefono", "📞 Teléfono", o.Telefono || "-", o.Telefono ? "https://wa.me/" + String(o.Telefono).replace(/\D/g, "") : "#")}

    ${editableLinkField(i, "Direccion", "📍 Dirección", o.Direccion || "-", o.Direccion ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(o.Direccion) : "#")}

    ${editableField(i, "💬 Comentario", o.Comentario || "-", "text")}

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

// editableField: ahora render inline-edit contenteditable con commitInlineEdit (blur/Enter)
// Se usa el mismo formato de id que espera editarCampo: val_{row}_{col}
function editableField(row, name, value, type = "text") {
  const safeKey = String(name).replace(/[^a-z0-9_]/gi, '_');
  const safeId = `val_${row}_${safeKey}`;
  const display = (value === undefined || value === null || value === "") ? "-" : value;
  const safeNameEsc = String(name).replace(/'/g, "\\'");
  const safeType = String(type).replace(/'/g, "\\'");
  return `
    <p>
      <strong>${String(name).replace(/🏷️\s?/,'')}:</strong>
      <span id="${safeId}" class="inline-edit" contenteditable="true"
        onblur="commitInlineEdit(${row}, '${safeNameEsc}', '${safeType}', this)"
        onkeydown="if(event.key==='Enter'){ event.preventDefault(); this.blur(); }"
        >${display}</span>
      <button class="buttom_edit" onclick="editarCampo(${row}, '${safeNameEsc}', '${safeType}', '${safeId}')">✏️</button>
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
  const oldValue = el ? el.textContent.trim() : "";

  let nuevo = typeof nuevoValor !== "undefined" ? nuevoValor : null;

  if (nuevo === null) {
    // si no se pasó valor, usamos modal prompt ligero
    const res = await uiForm(`Editar ${columnName}`, [
      { name: "value", label: columnName, value: oldValue === "-" ? "" : oldValue, type: type === "number" ? "number" : "text", required: false }
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

    if (el) el.textContent = nuevo || "-";

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
  } catch (err) {
    uiAlert("Error al guardar: " + (err.message || err), { type: "error" });
  }
}
// ========================================================
// 🧩 UiFormProduct - versión avanzada (crear/editar producto)
// ========================================================
async function UiFormProduct(buscando) {
  return new Promise(res => {
    const wrapper = document.createElement("div");
    wrapper.className = "ui-form-product";

    // --- Fila inicial con cantidad y búsqueda ---
    const row = document.createElement("div");
    row.className = "ui-form-row";

    const qtyInput = document.createElement("input");
    qtyInput.type = "number";
    qtyInput.min = 1;
    qtyInput.value = 1;
    qtyInput.placeholder = "Cantidad";
    qtyInput.className = "ui-input qty-input";

    const searchInput = document.createElement("input");
    searchInput.type = "text";
    searchInput.placeholder = "Buscar código o producto...";
    searchInput.className = "ui-input search-input";
    searchInput.value = buscando || "";

    row.appendChild(qtyInput);
    row.appendChild(searchInput);

    // --- Lista de sugerencias ---
    const suggestions = document.createElement("div");
    suggestions.className = "ui-suggestions";

    // --- Contenedor de detalles del producto seleccionado ---
    const details = document.createElement("div");
    details.className = "ui-product-details";
    details.style.display = "none";

    wrapper.appendChild(row);
    wrapper.appendChild(suggestions);
    wrapper.appendChild(details);

    let selected = null;

    // --- Renderizar sugerencias ---
    function renderSuggestions(list, query) {
      suggestions.innerHTML = "";

      // Si no hay resultados, ofrecer crear nuevo
      if (list.length === 0 && query) {
        const createNew = document.createElement("div");
        createNew.className = "ui-suggestion-item new";
        createNew.innerHTML = `➕ Crear producto <strong>"${query}"</strong>`;
        createNew.onclick = async () => {
          const newProd = await uiForm("Nuevo producto", [
            { name: "Codigo", label: "Código", value: query, required: true },
            { name: "Nombre", label: "Nombre", value: query, required: true },
            { name: "Precio", label: "Precio unitario", type: "number", value: "", required: true },
          ]);
          if (!newProd) return;
          newProd.Precio = parseFloat(newProd.Precio) || 0;
          Products.push(newProd); // guardamos temporalmente
          selected = newProd;
          qtyInput.value = 1;
          renderDetails(newProd);
          suggestions.style.display = "none";
          uiNotify("Producto creado temporalmente", "success");
          UiFormProduct(newProd.Codigo); // reabrir modal con el nuevo producto
        };
        suggestions.appendChild(createNew);
        suggestions.style.display = "block";
        return;
      }

      list.forEach(prod => {
        const item = document.createElement("div");
        item.className = "ui-suggestion-item";
        item.innerHTML = `
          <strong>${prod.Nombre}</strong><br>
          <small>${prod.Codigo} — $${prod.Precio}</small>
        `;
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

    // --- Renderizar detalles + botón editar ---
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

      // --- Editar producto existente ---
      details.querySelector("#edit-product").onclick = async () => {
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
        uiNotify("Producto modificado", "info");
      };
    }

    // --- Evento de búsqueda dinámica ---
    searchInput.oninput = e => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        suggestions.style.display = "none";
        return;
      }
      const matches = Products.filter(p =>
        p.Nombre.toLowerCase().includes(q) ||
        p.Codigo.toLowerCase().includes(q)
      ).slice(0, 6);
      renderSuggestions(matches, q);
    };

    // --- Crear modal principal ---
    uiModalOpen({
      title: "Agregar producto",
      body: wrapper,
      actions: [
        { label: "Cancelar", class: "secondary", onClick: () => { uiModalClose(); res(null); } },
        { label: "Aceptar", class: "primary", onClick: () => {
            if (!selected) {
              uiNotify("Selecciona o crea un producto primero", "error");
              return;
            }
            const unidades = parseInt(qtyInput.value) || 1;
            const total = unidades * parseFloat(selected.Precio || 0);
            uiModalClose();
            res({
              codigo: selected.Codigo,
              nombre: selected.Nombre,
              unidades,
              total
            });
          } },
      ]
    });
  });
}


async function agregarProducto(row) {
  const form = await UiFormProduct();
  if (!form) return;

  const pedido = currentOrders[row];
  const productos = parseProductos(pedido.Productos || "");
  productos.push(form);

  await postData({ action: "updateProductos", rowIndex: row, productos });
  uiNotify("Producto agregado correctamente", "success");
  loadOrders();
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
  loadOrders();
  verDetalle(row);
}

async function eliminarProducto(row, codigo) {
  const ok = await uiConfirm("¿Eliminar este producto?");
  if (!ok) return;
  await postData({ action: "deleteProducto", rowIndex: row, codigo });
  uiNotify("Producto eliminado", "info");
  setTimeout(() => {
    loadOrders();
    verDetalle(row);
  }, 150);
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
    uiNotify("✅ Pedido creado correctamente", "success");
    loadOrders();
  } else {
    uiAlert("❌ Error al crear el pedido", { type: "error" });
  }
}

function exportExcel() {
  if (!currentOrders || !currentOrders.length) {
    uiNotify("No hay pedidos para exportar", "info");
    return;
  }
  const csv = [Object.keys(currentOrders[0]).join(",")].concat(
    currentOrders.map(o => Object.values(o).join(","))
  ).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "pedidos.csv";
  a.click();
}

async function postData(payload) {
  const formData = new URLSearchParams();
  formData.append('data', JSON.stringify(payload));
  try {
    const res = await fetch(WEBAPP_URL, { method: "POST", body: formData });
    // try to parse JSON, but guard against invalid JSON
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
}


if (localStorage.getItem("logged")) {
  if (loginContainer) loginContainer.classList.add("hidden");
  if (panel) panel.classList.remove("hidden");
  loadOrders();
  loadProducts();
}
