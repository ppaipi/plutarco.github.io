const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbzXPqRns7UKWq_vr1ZpA98Dpj7DlLg7XvHiPcWu1usYqaFDY6iMgHgMPdnH_Jk04Qf_/exec";

const loginContainer = document.getElementById("login-container");
const panel = document.getElementById("panel");
const tableHead = document.querySelector("#orders-table thead");
const tableBody = document.querySelector("#orders-table tbody");
const overlay = document.getElementById("overlay");
const detalle = document.getElementById("detalle-contenido");

document.getElementById("login-btn").onclick = login;
document.getElementById("logout-btn").onclick = logout;
document.getElementById("export-btn").onclick = exportExcel;
// usar el filtrado local para respuestas instantáneas
document.getElementById("filter-status").onchange = applyFiltersAndRender;
document.getElementById("search").oninput = applyFiltersAndRender;

// --- NEW: bind new controls (simplificado) ---
const filterEntregadoEl = document.getElementById("filter-entregado"); // "all"|"TRUE"|"FALSE"
const sortOrderEl = document.getElementById("sort-order"); // único selector siempre visible

if (filterEntregadoEl) filterEntregadoEl.onchange = applyFiltersAndRender;
if (sortOrderEl) sortOrderEl.onchange = applyFiltersAndRender;

let currentOrders = [];

async function login() {
  const user = document.getElementById("user").value;
  const password = document.getElementById("password").value;
  const res = await postData({ action: "login", user, password });
  if (res.ok) {
    localStorage.setItem("logged", "1");
    loginContainer.classList.add("hidden");
    panel.classList.remove("hidden");
    loadOrders();
  } else {
    document.getElementById("login-msg").textContent = "Usuario o contraseña incorrectos";
  }
}

function logout() {
  localStorage.removeItem("logged");
  location.reload();
}

async function loadOrders() {
  const res = await postData({ action: "getOrders" });
  if (!res.ok) return alert("Error al cargar pedidos");
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

async function eliminarPedido(i) {
  if (!confirm("¿Seguro que deseas eliminar este pedido completo?")) return;
  const res = await postData({ action: "deleteOrder", rowIndex: i });
  if (res.ok) {
    alert("Pedido eliminado correctamente");
    loadOrders();
  } else {
    alert("Error al eliminar pedido");
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

  const productos = parseProductos(o.Productos);

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

    ${editableField(i, "🏷️ Nombre", o.Nombre, "text", "Nombre")}
    ${editableLinkField(i, "Email", "📧 Email", o.Email, o.Email ? "mailto:" + encodeURIComponent(o.Email) : "#")}

    ${editableLinkField(i, "Telefono", "📞 Teléfono", o.Telefono || "-", o.Telefono ? "https://wa.me/" + String(o.Telefono).replace(/\D/g, "") : "#")}

    ${editableLinkField(i, "Direccion", "📍 Dirección", o.Direccion || "-", o.Direccion ? "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(o.Direccion) : "#")}

    ${editableField(i, "💬 Comentario", o.Comentario || "-", "text", "Comentario")}

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

function editableField(row, name, value, type = "text") {
  return `
    <p><strong>${name}:</strong> 
      <span id="val-${row}-${name}">${value}</span>
      <button class="buttom_edit" onclick="editarCampo(${row}, '${name}', '${type}')">✏️</button>
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


async function editarCampo(row, columnName, type = "text", elementId = null, hrefTemplate = null) {
  if (!elementId) {
    elementId = `val_${row}_${String(columnName).replace(/[^a-z0-9_]/gi, '_')}`;
  }

  const el = document.getElementById(elementId);
  const oldValue = el ? el.textContent.trim() : "";
  const nuevo = prompt(`Editar ${columnName}:`, oldValue === "-" ? "" : oldValue);
  if (nuevo === null) return; // canceló

  // Validar número si corresponde
  if (type === "number" && isNaN(nuevo)) {
    alert("Por favor ingresa un número válido");
    return;
  }

  try {
    // Actualizar en Google Sheets
    await postData({
      action: "updateCell",
      rowIndex: row,
      columnName: columnName,
      value: nuevo
    });

    // Actualizar valor mostrado
    if (el) el.textContent = nuevo || "-";

    // 🔄 Actualizar en memoria
    if (currentOrders && currentOrders[row]) {
      currentOrders[row][columnName] = nuevo;
    }

    // 🧮 Si cambió el envío, recalcular total
    if (columnName === "Envio" || columnName === "Subtotal") {
      const sub = parseFloat(currentOrders[row].Subtotal) || 0;
      const envio = parseFloat(currentOrders[row].Envio) || 0;
      const nuevoTotal = sub + envio;

      currentOrders[row].total = nuevoTotal;

      // Actualizar visualmente el total en pantalla si existe
      const totalEl = document.querySelector(`#detalle-contenido strong`);
      if (totalEl) totalEl.textContent = `$${nuevoTotal.toFixed(2)}`;

      // También actualizar en Google Sheets (opcional)
      await postData({
        action: "updateCell",
        rowIndex: row,
        columnName: "total",
        value: nuevoTotal
      });
    }

    // Actualizar hrefs si son campos especiales
    if (columnName === "Email") {
      el.href = nuevo ? `mailto:${encodeURIComponent(nuevo)}` : "#";
    } else if (columnName === "Telefono") {
      const digits = String(nuevo || "").replace(/\D/g, "");
      el.href = digits ? `https://wa.me/${digits}` : "#";
    } else if (columnName === "Direccion") {
      el.href = nuevo
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nuevo)}`
        : "#";
    }

  } catch (err) {
    alert("Error al guardar: " + (err.message || err));
  }
}





async function agregarProducto(row) {
  const codigo = prompt("Código del producto:");
  const nombre = prompt("Nombre del producto:");
  const unidades = prompt("Cantidad:", 1);
  const total = prompt("Precio total:");
  if (!codigo || !nombre || !total) return;

  const pedido = currentOrders[row];
  const productos = parseProductos(pedido.Productos);
  productos.push({ codigo, nombre, unidades, total });

  await postData({ action: "updateProductos", rowIndex: row, productos });
  alert("Producto agregado");
  loadOrders();
  verDetalle(row);
}

async function editarProducto(row, idx) {
  const pedido = currentOrders[row];
  const productos = parseProductos(pedido.Productos);
  const p = productos[idx];

  const nuevoNombre = prompt("Nuevo nombre:", p.nombre);
  const nuevasUnidades = prompt("Cantidad:", p.unidades);
  const nuevoPrecio = prompt("Precio total:", p.total);
  if (!nuevoNombre || !nuevoPrecio) return;

  productos[idx] = { ...p, nombre: nuevoNombre, unidades: nuevasUnidades, total: nuevoPrecio };
  await postData({ action: "updateProductos", rowIndex: row, productos });
  alert("Producto editado");
  loadOrders();
  verDetalle(row);
}

async function eliminarProducto(row, codigo) {
  if (!confirm("¿Eliminar este producto?")) return;
  await postData({ action: "deleteProducto", rowIndex: row, codigo });
  alert("Producto eliminado");
  setTimeout(() => {
    loadOrders();
    verDetalle(row);
  }, 100);

}

function filterOrders() {
  // ahora solo reaplica filtros locales sin volver a consultar al backend
  applyFiltersAndRender();
}

function exportExcel() {
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
  const res = await fetch(WEBAPP_URL, { method: "POST", body: formData });
  return res.json();
}

// Asegurarse de mostrar/ocultar controles al iniciar si ya está logueado
if (localStorage.getItem("logged")) {
  loginContainer.classList.add("hidden");
  panel.classList.remove("hidden");
  // actualizar visibilidad antes de cargar
  updateSortControlsVisibility();
  loadOrders();
}
