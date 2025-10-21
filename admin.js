const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbzXPqRns7UKWq_vr1ZpA98Dpj7DlLg7XvHiPcWu1usYqaFDY6iMgHgMPdnH_Jk04Qf_/exec";

const loginContainer = document.getElementById("login-container");
const panel = document.getElementById("panel");
const tableHead = document.querySelector("#orders-table thead");
const tableBody = document.querySelector("#orders-table tbody");

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
      ${headers.map(h => `<td contenteditable="true" onblur="editCell(${i}, '${h}', this.textContent)">${o[h]}</td>`).join("")}
      <td><button onclick="markDelivered(${i})">✔️</button></td>
    </tr>`).join("");
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
  const res = await fetch(WEBAPP_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return res.json();
}

// Auto-login
if (localStorage.getItem("logged")) {
  loginContainer.classList.add("hidden");
  panel.classList.remove("hidden");
  loadOrders();
}
