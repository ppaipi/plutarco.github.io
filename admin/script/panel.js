/* ============================
      CONFIG
=============================== */
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbymVHpZITD-LgBBFSK1ThWucgVYURRLhztkfGo2tvGamiFhTL73nfK2BDrtSA9GKJQk/exec";


/* ============================
      HELPERS
=============================== */
const parsePrecio = v => {
  if (!v) return 0;
  return Number(String(v).replace(/\./g,'').replace(',','.')) || 0;
};

let allProducts = [];
let filtered = [];
let currentPage = 1;
let pageSize = 50;


/* ============================
      FETCH PRODUCTS (GET)
=============================== */
async function fetchFromSheets() {
  try {
    const res = await fetch(APPS_SCRIPT_URL);
    const data = await res.json();

    if (!data.products) throw new Error("Products missing in response");

    allProducts = data.products.map(p => ({
      Codigo: p.Codigo || "",
      Nombre: p.Nombre || "",
      Descripcion: p.Descripcion || "",
      Categoria: p.Categoria || "",
      SubCategoria: p.SubCategoria || "",
      Precio: parsePrecio(p.Precio),
      Proveedor: p.Proveedor || "",
      Habilitado: p.Habilitado ?? true,
      Orden: p.Orden ?? 999999,
      ImagenURL: p.ImagenURL || `/media/PRODUCTOS/${p.Codigo}.jpg`,
    }));

    applyFilterAndRender();

  } catch (err) {
    console.error(err);
    alert("Error cargando productos: " + err.message);
  }
}


/* ============================
      SAVE PRODUCTS (POST)
=============================== */
async function saveToSheets() {
  try {
    const payload = { products: allProducts };

    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await res.json();

    if (data.status === "saved")
      alert(`Guardado correctamente (${data.count} productos)`);
    else
      alert("Error guardando: " + JSON.stringify(data));

  } catch (err) {
    alert("Error guardando: " + err.message);
  }
}


/* ============================
      RENDER
=============================== */

function applyFilterAndRender() {
  const q = (document.getElementById("search").value || "").toLowerCase();

  filtered = allProducts.filter(p =>
    p.Codigo.toLowerCase().includes(q) ||
    p.Nombre.toLowerCase().includes(q)
  );

  renderList();
}

function renderList() {
  const container = document.getElementById("product-list");
  container.innerHTML = "";

  const start = (currentPage - 1) * pageSize;
  const page = filtered.slice(start, start + pageSize);

  page.forEach(p => {
    const row = document.createElement("div");
    row.className = "row";

    row.innerHTML = `
      <div class="code">${p.Codigo}</div>
      <div class="name">${p.Nombre}</div>
      <div class="price">$ ${p.Precio}</div>
      <button class="btn-edit">Editar</button>
    `;

    container.appendChild(row);
  });
}


/* ============================
      ADD PRODUCT
=============================== */
function addProduct() {
  const codigo = prompt("Código:");
  const nombre = prompt("Nombre:");

  if (!codigo) return alert("Código obligatorio");

  allProducts.unshift({
    Codigo: codigo,
    Nombre: nombre || "",
    Descripcion: "",
    Categoria: "",
    SubCategoria: "",
    Precio: 0,
    Proveedor: "",
    Habilitado: true,
    Orden: 999999,
    ImagenURL: `/media/PRODUCTOS/${codigo}.jpg`
  });

  applyFilterAndRender();
}


/* ============================
      INIT
=============================== */
document.getElementById("btn-fetch-products").onclick = fetchFromSheets;
document.getElementById("btn-save").onclick = saveToSheets;
document.getElementById("btn-add").onclick = addProduct;

fetchFromSheets(); // carga inicial
