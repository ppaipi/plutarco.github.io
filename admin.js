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
  if (res.ok) {
    currentOrders = res.orders;
    renderTable(currentOrders);
  }
}

function renderTable(orders) {
  tableHead.innerHTML = `
    <tr>
      <th>Fecha</th>
      <th>Nombre</th>
      <th>Dirección</th>
      <th>Total</th>
      <th>Ver</th>
    </tr>`;

  tableBody.innerHTML = orders.map((o, i) => `
    <tr class="${o.entregado === "TRUE" ? "entregado" : ""}">
      <td>${new Date(o["Hora de envio"]).toLocaleString()}</td>
      <td>${o.Nombre}</td>
      <td>${o.Direccion}</td>
      <td>$${o.total}</td>
      <td><button onclick="verDetalle(${i})">👁️</button></td>
    </tr>
  `).join("");
}

function verDetalle(i) {
  const o = currentOrders[i];
  overlay.classList.add("active");

  const productos = (o.Productos || "")
    .split(", ")
    .map(p => {
      const parts = p.includes("|") ? p.split("|") : null;
      if (parts) {
        const [codigo, nombre, unidades, precio] = parts;
        const img = `/media/PRODUCTOS/${codigo}.jpg`;
        return `
          <div class="producto">
            <img src="${img}" onerror="this.src='/media/PRODUCTOS/placeholder.jpg'">
            <div class="producto-info">
              <p><strong>${nombre}</strong></p>
              <p>${unidades} x $${precio}</p>
            </div>
          </div>`;
      } else {
        return `<div class="producto"><div class="producto-info"><p>${p}</p></div></div>`;
      }
    })
    .join("");

  detalle.innerHTML = `
    <button class="close-btn" onclick="cerrarDetalle()">✖</button>

    <div class="detalle-scroll">
      <h3>🧾 Pedido de ${o.Nombre}</h3>
      ${editableField("Nombre", o.Nombre, i)}
      ${editableField("Email", o.Email, i)}
      ${editableField("Telefono", o.Telefono, i)}
      ${editableField("Direccion", o.Direccion, i)}
      ${editableField("Comentario", o.Comentario || '-', i)}

      <p><strong>💰 Subtotal:</strong> $${o.Subtotal}</p>
      <p><strong>🚚 Envío:</strong> $${o.Envio}</p>
      <p><strong>💸 Costo Envío:</strong> $${o["COSTO ENVIO"] || 0}</p>
      <p><strong>🧾 Total:</strong> $${o.total}</p>

      <h4>🧺 Productos:</h4>
      <div class="productos-grid">${productos}</div>
      <button class="add-product" onclick="agregarProducto(${i})">➕ Agregar producto</button>
    </div>

    <div class="order-status-buttons">
      <button class="btn-confirm ${o["confirmado y pagado"] === "TRUE" ? "active" : ""}"
        onclick="toggleStatus(${i}, 'confirmado y pagado', this)">✅ Confirmar pago</button>

      <button class="btn-delivered ${o.entregado === "TRUE" ? "active" : ""}"
        onclick="setDelivered(${i}, this)">🚚 Pedido entregado</button>
    </div>
  `;
}

function editableField(label, value, i) {
  return `
    <p><strong>${label}:</strong>
    <span contenteditable="true" onblur="saveField(${i}, '${label}', this)">${value}</span>
    </p>`;
}

async function saveField(rowIndex, label, el) {
  await postData({ action: "updateCell", rowIndex, columnName: label, value: el.textContent.trim() });
}

async function toggleStatus(i, column, btn) {
  const newValue = btn.classList.toggle("active") ? "TRUE" : "FALSE";
  await postData({ action: "updateCell", rowIndex: i, columnName: column, value: newValue });
  loadOrders();
}

async function setDelivered(i, btn) {
  const costoEnvio = prompt("💰 Ingresá el costo de envío:");
  if (costoEnvio !== null) {
    btn.classList.add("active");
    await postData({ action: "updateEnvio", rowIndex: i, costoEnvio });
    await postData({ action: "updateCell", rowIndex: i, columnName: "entregado", value: "TRUE" });
    loadOrders();
  }
}

function agregarProducto(i) {
  const codigo = prompt("Código del producto:");
  const nombre = prompt("Nombre del producto:");
  const unidades = prompt("Cantidad:");
  const precio = prompt("Precio unitario:");
  if (!codigo || !nombre || !precio) return;
  const o = currentOrders[i];
  const nuevo = `${codigo}|${nombre}|${unidades}|${precio}`;
  const productosActualizados = (o.Productos ? o.Productos + ", " : "") + nuevo;
  postData({ action: "updateCell", rowIndex: i, columnName: "Productos", value: productosActualizados });
  alert("✅ Producto agregado");
  loadOrders();
}

function cerrarDetalle() {
  overlay.classList.remove("active");
}

function filterOrders() {
  const query = document.getElementById("search").value.toLowerCase();
  const filtered = currentOrders.filter(o =>
    Object.values(o).some(v => String(v).toLowerCase().includes(query))
  );
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
  formData.append("data", JSON.stringify(payload));
  const res = await fetch(WEBAPP_URL, { method: "POST", body: formData });
  return res.json();
}

// Auto-login
if (localStorage.getItem("logged")) {
  loginContainer.classList.add("hidden");
  panel.classList.remove("hidden");
  loadOrders();
}
