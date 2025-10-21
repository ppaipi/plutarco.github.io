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
document.getElementById("filter-status").onchange = loadOrders;
document.getElementById("search").oninput = filterOrders;

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
  currentOrders = res.orders;
  renderTable(res.orders);
}

function renderTable(orders) {
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

  tableBody.innerHTML = orders.map((o, i) => `
    <tr>
      <td>${new Date(o["Hora de envio"]).toLocaleString()}</td>
      <td>${o.Nombre}</td>
      <td>${o.Direccion}</td>
      <td>$${o.total}</td>
      <td>
        <input type="checkbox" ${o["confirmado y pagado"] === true || o["confirmado y pagado"] === "TRUE" ? "checked" : ""} 
        onchange="toggleCheck(${i}, 'confirmado y pagado', this.checked)">
      </td>
      <td>
        <input type="checkbox" ${o["entregado"] === true || o["entregado"] === "TRUE" ? "checked" : ""} 
        onchange="toggleCheck(${i}, 'entregado', this.checked)">
      </td>
      <td>
        <button onclick="verDetalle(${i})">👁️ Ver</button>
      </td>
    </tr>
  `).join("");
}

async function toggleCheck(i, field, checked) {
  await postData({ action: "updateCell", rowIndex: i, columnName: field, value: checked ? "TRUE" : "FALSE" });
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
      <img src="/media/PRODUCTOS/${p.codigo}.jpg" onerror="this.src='/media/PRODUCTOS/placeholder.jpg'">
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

    <p><strong>📦 Fecha de envío:</strong> ${new Date(o["Hora de envio"]).toLocaleString("es-AR")}</p>
    <p><strong>🚚 Fecha de entrega:</strong> ${
      o["dia de entrega"]
        ? new Date(o["dia de entrega"]).toLocaleDateString("es-AR")
        : "No especificada"
    }</p>

    ${editableField(i, "Nombre", o.Nombre, "text", "🏷️ Nombre")}
    ${editableField(i, "Email", o.Email, "text", "📧 Email")}
    ${editableField(i, "Telefono", o.Telefono, "text", "📞 Teléfono")}
    ${editableField(i, "Direccion", o.Direccion, "text", "📍 Dirección")}
    ${editableField(i, "Comentario", o.Comentario || "-", "text", "💬 Comentario")}

    <h4>💵 Resumen del Pedido</h4>
    <table class="resumen-precios" style="width:100%; border-collapse:collapse;">
      <tr><td>💰 Subtotal:</td><td style="text-align:right;">$${o.Subtotal}</td></tr>
      <tr><td>🚗 Envío cobrado:</td><td style="text-align:right;">$${o.Envio}</td></tr>
      <tr><td>📦 Costo envío (real):</td><td style="text-align:right;">$${o["COSTO ENVIO"] || 0}</td></tr>
      <tr><td>💵 Total:</td><td style="text-align:right;"><strong>$${o.total}</strong></td></tr>
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

async function editarCampo(row, name, type) {
  const span = document.getElementById(`val-${row}-${name}`);
  const oldValue = span.textContent;
  const nuevo = prompt(`Editar ${name}:`, oldValue);
  if (nuevo !== null) {
    span.textContent = nuevo;
    await postData({ action: "updateCell", rowIndex: row, columnName: name, value: nuevo });
    loadOrders();
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
  loadOrders();
  verDetalle(row);
}

function filterOrders() {
  const query = document.getElementById("search").value.toLowerCase();
  const status = document.getElementById("filter-status").value;
  const filtered = currentOrders.filter(o => {
    const matchesText = Object.values(o).some(v => String(v).toLowerCase().includes(query));
    const matchesStatus = status === "all" || String(o["confirmado y pagado"]) === status;
    return matchesText && matchesStatus;
  });
  renderTable(filtered);
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

if (localStorage.getItem("logged")) {
  loginContainer.classList.add("hidden");
  panel.classList.remove("hidden");
  loadOrders();
}
