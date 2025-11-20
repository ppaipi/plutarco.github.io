/* ============= PANEL PLUTARCO ADMIN ============= */

let productsMaster = [];
let cfgProducts = [];
let merged = [];

let APPS_URL = "";
let PRODUCTS_URL = "";

let currentPage = 1;
const PAGE_SIZE = 50;

/* ========= SELECTORS ========= */
const $ = s => document.querySelector(s);

/* ========= LOAD DATA ========= */
async function loadAll() {
  PRODUCTS_URL = $("#url-products").value.trim();
  APPS_URL = $("#url-appscript").value.trim();

  productsMaster = await (await fetch(PRODUCTS_URL)).json();
  cfgProducts = (await (await fetch(APPS_URL)).json()).products;

  mergeProducts();
  renderPage();
}

/* ========= MERGE EXCEL + CONFIG ========= */
function mergeProducts() {
  const cfgMap = new Map();
  cfgProducts.forEach(c => cfgMap.set(c.Codigo, c));

  merged = productsMaster.map(p => {
    const cfg = cfgMap.get(p.Codigo) || {};
    return {
      Codigo: p.Codigo,
      Nombre: p.Nombre,
      Categoria: p.Categoria,
      Precio: Number(p.Precio) || 0,
      Proveedor: p.Proveedor,
      ImagenURL: cfg.ImagenURL || p.ImagenURL,
      Habilitado: cfg.Habilitado ?? false,
      Orden: cfg.Orden ?? 999999,
      Ranking: cfg.Ranking ?? 999999
    };
  });
}

/* ========= RENDER PAGE (PAGINATED) ========= */
function renderPage() {
  const q = $("#search").value.trim().toLowerCase();
  const onlyEnabled = $("#only-enabled").checked;
  const sortBy = $("#sort-by").value;

  let arr = merged.slice();

  if (q) arr = arr.filter(p =>
    (p.Codigo + p.Nombre + p.Proveedor).toLowerCase().includes(q)
  );

  if (onlyEnabled) arr = arr.filter(p => p.Habilitado);

  if (sortBy === "orden") arr.sort((a, b) => a.Orden - b.Orden);
  if (sortBy === "nombre") arr.sort((a, b) => a.Nombre.localeCompare(b.Nombre));
  if (sortBy === "precio") arr.sort((a, b) => a.Precio - b.Precio);

  const start = (currentPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE;
  const pageItems = arr.slice(start, end);

  $("#results").innerHTML = "";
  pageItems.forEach(p => renderCard(p));

  renderPagination(arr.length);
}

/* ========= CARD UI ========= */
function renderCard(p) {
  const div = document.createElement("div");
  div.className = "card";

  div.innerHTML = `
    <img class="thumb" src="${p.ImagenURL}" onerror="this.src='/media/no-image.png'">

    <div class="meta">
      <div class="name">${p.Nombre}</div>
      <div class="code">${p.Codigo} • ${p.Categoria}</div>
    </div>

    <div class="controls-row">
      <label><input type="checkbox" ${p.Habilitado ? "checked":""}> Habilitado</label>
      <label>Orden <input type="number" value="${p.Orden===999999 ? "" : p.Orden}"></label>
      <label>Ranking <input type="number" value="${p.Ranking===999999 ? "" : p.Ranking}"></label>
      <button class="btn-primary btn-photo">Imagen</button>
    </div>
  `;

  const [cb, ord, rank] = div.querySelectorAll("input");
  const btnPhoto = div.querySelector(".btn-photo");

  cb.onchange = () => { p.Habilitado = cb.checked; };
  ord.onchange = () => { p.Orden = Number(ord.value) || 999999; };
  rank.onchange = () => { p.Ranking = Number(rank.value) || 999999; };

  btnPhoto.onclick = () => uploadImage(p, div.querySelector("img"));

  $("#results").appendChild(div);
}

/* ========= PAGINATION ========= */
function renderPagination(total) {
  const totalPages = Math.ceil(total / PAGE_SIZE);

  $("#results").insertAdjacentHTML(
    "afterend",
    `
      <div class="pagination">
        <button ${currentPage<=1 ? "disabled":""} onclick="pagePrev()">Anterior</button>
        <div style="padding:6px 10px">Página ${currentPage} / ${totalPages}</div>
        <button ${currentPage>=totalPages ? "disabled":""} onclick="pageNext()">Siguiente</button>
      </div>
    `
  );
}

function pagePrev() { if (currentPage>1) { currentPage--; renderPage(); } }
function pageNext() { currentPage++; renderPage(); }

/* ========= UPLOAD FIREBASE ========= */
async function uploadImage(product, imgElement) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";

  input.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;

    const ref = firebase.storage().ref().child(`productos/${product.Codigo}.jpg`);

    await ref.put(file);
    const url = await ref.getDownloadURL();

    product.ImagenURL = url;
    imgElement.src = url;
  };

  input.click();
}

/* ========= SAVE ========= */
async function save() {
  const payload = { products: merged };

  await fetch(APPS_URL, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(payload)
  });

  alert("Cambios guardados ✓");
}

/* ========= INIT ========= */
document.addEventListener("DOMContentLoaded", () => {
  $("#btn-load").onclick = loadAll;
  $("#btn-save").onclick = save;

  $("#search").oninput = () => renderPage();
  $("#sort-by").onchange = () => renderPage();
  $("#only-enabled").onchange = () => renderPage();

  loadAll();
});
