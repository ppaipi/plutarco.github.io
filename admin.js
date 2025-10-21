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
  renderTable(res.orders);
}

let currentOrders = [];

function renderTable(orders) {
  currentOrders = orders;
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
      <td><button onclick="verDetalle(${i})">👁️ Ver</button></td>
    </tr>
  `).join("");
}

function verDetalle(i) {
  const o = currentOrders[i];
  overlay.classList.add("active");

  const productos = (o.Productos || "")
    .split(", ")
    .map(p => {
      const match = p.match(/^(.*?) x(\d+) \(\$(\d+)\)$/);
      if (!match) return null;
      const [_, nombre, unidades, precio] = match;
      const codigo = nombre.split(" ")[0];
      const img = `/media/PRODUCTOS/${codigo}.jpg`;
      return `
        <div class="producto">
          <img src="${img}" onerror="this.src='/media/PRODUCTOS/placeholder.jpg'">
          <div class="producto-info">
            <p><strong>${nombre}</strong></p>
            <p>${unidades} x $${precio}</p>
          </div>
        </div>`;
    })
    .filter(Boolean)
    .join("");

  detalle.innerHTML = `
    <button class="close-btn" onclick="cerrarDetalle()">✖</button>
    <h3>🧾 Pedido de ${o.Nombre}</h3>
    <p><strong>📅 Fecha:</strong> ${new Date(o["Hora de envio"]).toLocaleString()}</p>
    <p><strong>📞 Teléfono:</strong> ${o.Telefono}</p>
    <p><strong>📍 Dirección:</strong> ${o.Direccion}</p>
    <p><strong>💬 Comentario:</strong> ${o.Comentario || '-'}</p>
    <p><strong>💰 Total:</strong> $${o.total}</p>
    <h4>🧺 Productos:</h4>
    <div class="productos-grid">${productos}</div>

    <div class="order-status">
      <label>
        <input type="checkbox" ${o["confirmado y pagado"] === "TRUE" ? "checked" : ""} 
          onchange="toggleStatus(${i}, 'confirmado y pagado', this.checked)">
        Pedido confirmado
      </label>

      <label>
        <input type="checkbox" ${o["entregado"] === "TRUE" ? "checked" : ""} 
          onchange="toggleStatus(${i}, 'entregado', this.checked)">
        Pedido entregado
      </label>
    </div>
  `;
}

function cerrarDetalle() {
  overlay.classList.remove("active");
}

function toggleStatus(rowIndex, columnName, checked) {
  postData({
    action: "updateCell",
    rowIndex,
    columnName,
    value: checked ? "TRUE" : "FALSE"
  }).then(() => loadOrders());
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

// Auto-login
if (localStorage.getItem("logged")) {
  loginContainer.classList.add("hidden");
  panel.classList.remove("hidden");
  loadOrders();
}
