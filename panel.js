const loginContainer = document.getElementById("login-container");
const panel = document.getElementById("panel");
const tableHead = document.querySelector("#orders-table thead");
const tableBody = document.querySelector("#orders-table tbody");
const overlay = document.getElementById("overlay");
const productosList = document.getElementById("productos-list");
const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbzXPqRns7UKWq_vr1ZpA98Dpj7DlLg7XvHiPcWu1usYqaFDY6iMgHgMPdnH_Jk04Qf_/exec";
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
  const headers = Object.keys(orders[0]);
  tableHead.innerHTML = `<tr>${headers.map(h => `<th>${h}</th>`).join("")}<th>Acciones</th></tr>`;
  tableBody.innerHTML = orders.map((o, i) => `
    <tr>
      ${headers.map(h => `<td>${h === "productos" ? 
        `<button onclick="verProductos('${o[h]}')">👁️ Ver</button>` : 
        `<div contenteditable="true" onblur="editCell(${i}, '${h}', this.textContent)">${o[h]}</div>`}</td>`).join("")}
      <td><button onclick="markDelivered(${i})">✔️</button></td>
    </tr>`).join("");
}

function verProductos(texto) {
  const items = texto.split(", ").map(t => {
    const [nombre, resto] = t.split(" ($");
    const unidades = nombre.match(/x(\d+)/)?.[1] || "1";
    const nombreLimpio = nombre.replace(/x\d+$/, "").trim();
    const codigo = nombreLimpio.split(" ")[0]; // asume que el código está al inicio
    const precio = resto?.replace(")", "") || "0";
    return { codigo, nombre: nombreLimpio, unidades, precio };
  });

  productosList.innerHTML = items.map(p => `
    <div class="producto">
      <img src="/media/PRODUCTOS/${p.codigo}.jpg" onerror="this.src='/media/PRODUCTOS/default.jpg'">
      <div class="producto-info">
        <p><strong>${p.nombre}</strong></p>
        <p>x${p.unidades} — $${p.precio}</p>
      </div>
    </div>
  `).join("");
  overlay.classList.add("active");
}

function cerrarDetalle() {
  overlay.classList.remove("active");
}

async function markDelivered(i) {
  const res = await postData({ action: "markDelivered", rowIndex: i });
  if (res.ok) {
    alert("Marcado como entregado");
    loadOrders();
  }
}

async function editCell(rowIndex, columnName, value) {
  await postData({ action: "updateCell", rowIndex, columnName, value });
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

  const res = await fetch(WEBAPP_URL, {
    method: "POST",
    body: formData
  });
  return res.json();
}

if (localStorage.getItem("logged")) {
  loginContainer.classList.add("hidden");
  panel.classList.remove("hidden");
  loadOrders();
}
