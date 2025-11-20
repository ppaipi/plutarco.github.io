/** ===========================================
    CONFIG
=========================================== **/
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbymVHpZITD-LgBBFSK1ThWucgVYURRLhztkfGo2tvGamiFhTL73nfK2BDrtSA9GKJQk/exec";

firebase.initializeApp({
  apiKey: "AIzaSyCGuA_RkvEUptmUHO4YOAzr9qRKtK1cNDQ",
  authDomain: "plutarcodelivery-cf6cb.firebaseapp.com",
  projectId: "plutarcodelivery-cf6cb",
  storageBucket: "plutarcodelivery-cf6cb.firebasestorage.app",
});
const storage = firebase.storage();

/** ===========================================
    STATE
=========================================== **/
let allProducts = [];       // todos los productos del Excel
let viewMode = "tienda";    // tienda | todos
let dragInstance = null;


/** ===========================================
    FETCH PRODUCTS FROM SHEETS (GET)
=========================================== **/
async function loadProducts() {
  try {
    const res = await fetch(APPS_SCRIPT_URL);
    const data = await res.json();

    allProducts = data.products || [];

    render();
  } catch (err) {
    alert("Error cargando: " + err.message);
  }
}


/** ===========================================
    SAVE PRODUCTS CHANGES (POST)
=========================================== **/
async function saveToSheets() {
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ products: allProducts })
    });

    const data = await res.json();
    alert("Guardado: " + JSON.stringify(data));

  } catch (err) {
    alert("Error guardando: " + err.message);
  }
}


/** ===========================================
    RENDER PRODUCTS
=========================================== **/
function render() {
  const container = document.getElementById("product-list");
  container.innerHTML = "";

  // Filtrar dependiendo del modo
  let products = viewMode === "tienda"
    ? allProducts.filter(p => p.Habilitado)
    : allProducts;

  // Ordenar por ranking
  products.sort((a, b) => (a.Orden || 999999) - (b.Orden || 999999));

  // Agrupar por categoría → subcategoría
  const cats = {};
  for (const p of products) {
    const cat = p.Categoria || "Sin categoría";
    const sub = p.SubCategoria || "General";

    if (!cats[cat]) cats[cat] = {};
    if (!cats[cat][sub]) cats[cat][sub] = [];

    cats[cat][sub].push(p);
  }

  // Render por categoría
  for (const cat in cats) {
    const catEl = document.createElement("h2");
    catEl.textContent = cat;
    container.appendChild(catEl);

    for (const sub in cats[cat]) {
      const subEl = document.createElement("h3");
      subEl.textContent = sub;
      container.appendChild(subEl);

      const list = document.createElement("div");
      list.className = "sortable-list";

      cats[cat][sub].forEach(p => {
        const row = document.createElement("div");
        row.className = "product-row";
        row.dataset.codigo = p.Codigo;

        row.innerHTML = `
          <img src="${p.ImagenURL}" class="thumb" />

          <div class="info">
            <div class="name">${p.Nombre}</div>
            <div class="code">#${p.Codigo}</div>
          </div>

          <div class="controls">
            <label>
              <input type="checkbox" class="chk-hab" ${p.Habilitado ? "checked" : ""}>
              Habilitado
            </label>
            <input type="number" class="orden" value="${p.Orden || ""}" />
          </div>

          <button class="drag">↕</button>
        `;

        // eventos
        row.querySelector(".chk-hab").onchange = e => {
          p.Habilitado = e.target.checked;
        };

        row.querySelector(".orden").onchange = e => {
          p.Orden = Number(e.target.value) || 999999;
        };

        list.appendChild(row);
      });

      container.appendChild(list);

      // Activar drag sobre esta lista
      enableDrag(list);
    }
  }
}


/** ===========================================
    DRAG & DROP (RANKING)
=========================================== **/
function enableDrag(listEl) {
  if (dragInstance) dragInstance.destroy();

  dragInstance = Sortable.create(listEl, {
    animation: 150,
    handle: ".drag",

    onEnd: ev => {
      const items = [...ev.from.querySelectorAll(".product-row")];

      // reasignar ranking nuevo según el orden visible
      items.forEach((row, i) => {
        const code = row.dataset.codigo;
        const prod = allProducts.find(p => p.Codigo === code);
        prod.Orden = i + 1;
      });

      render(); // actualizar todo DOM
    }
  });
}


/** ===========================================
    HABILITAR NUEVO PRODUCTO
=========================================== **/
async function enableNewProduct() {
  const codigo = prompt("Código del producto del Excel:");
  if (!codigo) return;

  const prod = allProducts.find(p => p.Codigo === codigo);
  if (!prod) return alert("Producto inexistente en el Excel");

  // pedir foto
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "image/*";
  fileInput.click();

  fileInput.onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;

    const ext = file.name.split(".").pop();
    const ref = storage.ref().child(`productos/${codigo}.${ext}`);

    try {
      await ref.put(file);
      const url = await ref.getDownloadURL();

      prod.ImagenURL = url;
      prod.Habilitado = true;
      prod.Orden = 999999; // al final

      alert("Producto habilitado. Guardando en Sheets...");
      render();
      saveToSheets();

    } catch (err) {
      alert("Error subiendo imagen: " + err.message);
    }
  };
}


/** ===========================================
    BUTTONS
=========================================== **/
document.getElementById("btn-tienda").onclick = () => { viewMode = "tienda"; render(); };
document.getElementById("btn-todos").onclick = () => { viewMode = "todos"; render(); };
document.getElementById("btn-save").onclick = saveToSheets;
document.getElementById("btn-nuevo").onclick = enableNewProduct;


/** ===========================================
    INIT
=========================================== **/
loadProducts();
