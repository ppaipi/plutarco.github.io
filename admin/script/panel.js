/* ====================================================
      APP ADMIN - PLUTARCO DELIVERY
   3000 productos - Fast UI + Sheets como DB
   Con drag & drop, upload fotos, búsqueda, Excel.
==================================================== */

/* ---------- CONFIG ---------- */
const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbweNzPe4gwxiH9tP4LyObsYbOlOqshemkYlDcpw9-IT6u17lXgfceElMcOIKQDNbhXE/exec";

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCGuA_RkvEUptmUHO4YOAzr9qRKtK1cNDQ",
  authDomain: "plutarcodelivery-cf6cb.firebaseapp.com",
  projectId: "plutarcodelivery-cf6cb",
  storageBucket: "plutarcodelivery-cf6cb.firebasestorage.app",
  messagingSenderId: "714627263776",
  appId: "1:714627263776:web:3ee0e4fc657a6c12e37b45",
};

/* ---------- INIT FIREBASE ---------- */
firebase.initializeApp(FIREBASE_CONFIG);
const storage = firebase.storage();

/* ---------- DOM ---------- */
const tpl = document.getElementById("row-tpl");
const listEl = document.getElementById("product-list");
const searchInput = document.getElementById("search");
const pageSizeSelect = document.getElementById("page-size");
const pagerEl = document.getElementById("pager");

/* ---------- STATE ---------- */
let allProducts = [];
let filtered = [];
let currentPage = 1;
let pageSize = Number(pageSizeSelect.value || 50);

/* ---------- HELPERS ---------- */

const parsePrecio = (v) => {
  if (v == null) return 0;
  const s = String(v).replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return isNaN(n) ? 0 : n;
};

/* ====================================================
    GET PRODUCTS FROM APPS SCRIPT
==================================================== */
async function fetchFromSheets() {
  if (!APPS_SCRIPT_URL)
    return alert("ERROR: Falta APPS_SCRIPT_URL en app.js");

  document.querySelector("#btn-fetch-products").disabled = true;

  try {
    const res = await fetch(APPS_SCRIPT_URL + "?action=getProducts");
    if (!res.ok) throw new Error("HTTP " + res.status);

    const data = await res.json();

    // Normalizar
    allProducts = data.map((p) => ({
      Codigo: (p.Codigo || "").trim(),
      Nombre: p.Nombre || "",
      Descripcion: p.Descripcion || "",
      Categoria: p.Categoria || "",
      SubCategoria: p.SubCategoria || "",
      Precio: parsePrecio(p.Precio),
      Proveedor: p.Proveedor || "",
      Habilitado:
        p.Habilitado === true ||
        String(p.Habilitado || "").toUpperCase() === "TRUE",
      Orden: Number(p.Orden) || 999999,
      ImagenURL:
        p.ImagenURL ||
        `/media/PRODUCTOS/${(p.Codigo || "").toString().trim()}.jpg`,
    }));

    currentPage = 1;
    applyFilterAndRender();
  } catch (err) {
    console.error(err);
    alert("Error al leer Sheets: " + err.message);
  } finally {
    document.querySelector("#btn-fetch-products").disabled = false;
  }
}

document
  .getElementById("btn-fetch-products")
  .addEventListener("click", fetchFromSheets);

/* ====================================================
    IMPORT XLSX (local)
==================================================== */
document.getElementById("file-xlsx").addEventListener("change", async (e) => {
  const f = e.target.files[0];
  if (!f) return;

  const buf = await f.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

  allProducts = json.map((row) => ({
    Codigo: (row["CODIGO BARRA"] || "").toString().trim(),
    Nombre: row["DESCRIPCION LARGA"] || "",
    Descripcion: row["DESCRIPCION ADICIONAL"] || "",
    Categoria: row["RUBRO"] || "",
    SubCategoria: row["SUBRUBRO"] || "",
    Precio: parsePrecio(row["PRECIO VENTA C/IVA"]),
    Proveedor: row["PROVEEDOR"] || "",
    Habilitado: false,
    Orden: 999999,
    ImagenURL: `/media/PRODUCTOS/${
      (row["CODIGO BARRA"] || "").toString().trim()
    }.jpg`,
  }));

  currentPage = 1;
  applyFilterAndRender();
});

/* ====================================================
    SEARCH + PAGINATION
==================================================== */
searchInput.addEventListener("input", () => {
  currentPage = 1;
  applyFilterAndRender();
});

pageSizeSelect.addEventListener("change", () => {
  pageSize = Number(pageSizeSelect.value);
  currentPage = 1;
  applyFilterAndRender();
});

function applyFilterAndRender() {
  const q = (searchInput.value || "").trim().toLowerCase();

  filtered = allProducts.filter((p) => {
    if (!q) return true;
    return (
      (p.Codigo || "").toLowerCase().includes(q) ||
      (p.Nombre || "").toLowerCase().includes(q) ||
      (p.Proveedor || "").toLowerCase().includes(q)
    );
  });

  renderPage();
}

function renderPage() {
  listEl.innerHTML = "";
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  if (currentPage > pages) currentPage = pages;

  const start = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);

  pageItems.forEach((p, idx) => {
    const node = tpl.content.cloneNode(true);
    const row = node.querySelector(".row");
    row.dataset.index = start + idx;

    const img = row.querySelector(".thumb");
    img.src = p.ImagenURL || "/media/no-image.png";

    row.querySelector(".code").textContent = p.Codigo || "(sin código)";
    row.querySelector(".name").textContent = p.Nombre || "";
    row.querySelector(".prov").textContent = p.Proveedor || "";
    row.querySelector(".price-col").textContent = p.Precio
      ? `$ ${p.Precio}`
      : "";

    const chk = row.querySelector(".habilitado");
    chk.checked = !!p.Habilitado;
    chk.addEventListener("change", (e) => {
      p.Habilitado = e.target.checked;
    });

    const orden = row.querySelector(".orden");
    orden.value = p.Orden === 999999 ? "" : p.Orden;
    orden.addEventListener("change", (e) => {
      p.Orden = Number(e.target.value) || 999999;
    });

    row
      .querySelector(".btn-photo")
      .addEventListener("click", () => triggerPhotoUpload(p, img));

    row.querySelector(".btn-delete").addEventListener("click", () => {
      if (!confirm("Eliminar producto " + p.Codigo + "?")) return;
      const i = allProducts.findIndex((x) => x.Codigo === p.Codigo);
      if (i >= 0) allProducts.splice(i, 1);
      applyFilterAndRender();
    });

    row.querySelector(".btn-edit").addEventListener("click", () =>
      showPreview(p)
    );

    listEl.appendChild(node);
  });

  enableDragOnList();

  pagerEl.innerHTML = `Página ${currentPage} / ${pages} — ${total} resultados &nbsp;`;
  const prev = document.createElement("button");
  prev.textContent = "◀ Prev";
  prev.disabled = currentPage === 1;
  prev.onclick = () => {
    currentPage--;
    renderPage();
  };

  const next = document.createElement("button");
  next.textContent = "Next ▶";
  next.disabled = currentPage === pages;
  next.onclick = () => {
    currentPage++;
    renderPage();
  };

  pagerEl.appendChild(prev);
  pagerEl.appendChild(next);
}

/* ====================================================
    DRAG & DROP
==================================================== */
function enableDragOnList() {
  if (window._sortableInstance) {
    try {
      window._sortableInstance.destroy();
    } catch (e) {}
  }

  window._sortableInstance = Sortable.create(listEl, {
    animation: 150,
    handle: ".thumb",
    onEnd: function (evt) {
      const pageStart = (currentPage - 1) * pageSize;
      const removed = filtered.splice(pageStart + evt.oldIndex, 1)[0];
      filtered.splice(pageStart + evt.newIndex, 0, removed);

      const pageCodes = filtered
        .slice(pageStart, pageStart + pageSize)
        .map((x) => x.Codigo);

      pageCodes.forEach((code, i) => {
        const globalIndex = allProducts.findIndex((p) => p.Codigo === code);
        if (globalIndex >= 0)
          allProducts[pageStart + i] = allProducts.splice(
            globalIndex,
            1,
            allProducts[pageStart + i]
          )[0];
      });

      renderPage();
    },
  });
}

/* ====================================================
    PHOTO UPLOAD
==================================================== */
function triggerPhotoUpload(product, imgEl) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";

  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const ext = file.name.split(".").pop();
    const filename = `${product.Codigo}.${ext || "jpg"}`;

    const ref = storage.ref().child(`productos/${filename}`);

    try {
      const up = await ref.put(file);
      const url = await up.ref.getDownloadURL();
      product.ImagenURL = url;
      imgEl.src = url;
      alert("Imagen subida correctamente.");
    } catch (err) {
      console.error(err);
      alert("Error subiendo imagen: " + err.message);
    }
  };

  input.click();
}

/* ====================================================
    PREVIEW
==================================================== */
function showPreview(p) {
  document.getElementById("preview-img").src =
    p.ImagenURL || "/media/no-image.png";
  document.getElementById("preview-name").textContent =
    p.Nombre || p.Codigo || "";
  document.getElementById("preview-desc").textContent =
    p.Descripcion || "";
  document.getElementById("preview-price").textContent = p.Precio
    ? `$ ${p.Precio}`
    : "";
  document.getElementById("preview-cat").textContent = `${p.Categoria ||
    ""} ${p.SubCategoria ? " / " + p.SubCategoria : ""}`;
}

/* ====================================================
    ADD PRODUCT
==================================================== */
document.getElementById("btn-add").addEventListener("click", () => {
  const codigo = document.getElementById("add-codigo").value.trim();
  if (!codigo) return alert("El Código es obligatorio");

  const exists = allProducts.find((p) => p.Codigo === codigo);
  if (exists) return alert("Ya existe un producto con ese código");

  const newP = {
    Codigo: codigo,
    Nombre: document.getElementById("add-nombre").value || "",
    Descripcion: "",
    Categoria: "",
    SubCategoria: "",
    Precio: parsePrecio(document.getElementById("add-precio").value),
    Proveedor: document.getElementById("add-proveedor").value || "",
    Habilitado: true,
    Orden: 999999,
    ImagenURL: `/media/PRODUCTOS/${codigo}.jpg`,
  };

  allProducts.unshift(newP);
  applyFilterAndRender();
});

/* ====================================================
    SAVE TO SHEETS (POST)
==================================================== */
document.getElementById("btn-save").addEventListener("click", async () => {
  if (!APPS_SCRIPT_URL) return alert("Configura APPS_SCRIPT_URL");

  const payload = { products: allProducts };

  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    alert("Guardado en Sheets: " + data.status);
  } catch (err) {
    console.error(err);
    alert("Error guardando: " + err.message);
  }
});

/* ====================================================
    EXPORT HELPERS
==================================================== */
document.getElementById("btn-export-hab").addEventListener("click", () => {
  const hab = allProducts.filter((p) => p.Habilitado).map((p) => p.Codigo);
  downloadBlob(JSON.stringify(hab, null, 2), "habilitados.json", "application/json");
});

document.getElementById("btn-export-ranking").addEventListener("click", () => {
  const rows = allProducts
    .map((p) => ({ Codigo: p.Codigo, Orden: p.Orden || 999999 }))
    .sort((a, b) => a.Orden - b.Orden);

  const csv = [
    "Ranking;Producto",
    ...rows.map((r, i) => `${i + 1};${r.Codigo}`),
  ].join("\n");

  downloadBlob(csv, "ranking.csv", "text/csv");
});

function downloadBlob(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ====================================================
    INIT
==================================================== */
(async function init() {
  await fetchFromSheets();
})();
