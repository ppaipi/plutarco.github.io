// panel.js - Panel de Productos (completo)
// Reemplazá WEBAPP_URL con la URL de tu Apps Script Web App (doGet/doPost desplegada).

const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbymVHpZITD-LgBBFSK1ThWucgVYURRLhztkfGo2tvGamiFhTL73nfK2BDrtSA9GKJQk/exec"; // <-- REEMPLAZAR

// --- Firebase config (adaptado desde tu config) ---
const firebaseConfig = {
  apiKey: "AIzaSyCGuA_RkvEUptmUHO4YOAzr9qRKtK1cNDQ",
  authDomain: "plutarcodelivery-cf6cb.firebaseapp.com",
  projectId: "plutarcodelivery-cf6cb",
  storageBucket: "plutarcodelivery-cf6cb.appspot.com", // <- importante .appspot.com
  messagingSenderId: "714627263776",
  appId: "1:714627263776:web:3ee0e4fc657a6c12e37b45",
  measurementId: "G-99MNS9JHQN"
};

// Carpeta dentro del bucket (ruta final: /productos/{codigo}.jpg)
const FIREBASE_FOLDER = "productos";

// Inicializar Firebase v8 (panel.html debe cargar firebase-app.js y firebase-storage.js)
if (!window.firebase || !firebase.apps || firebase.apps.length === 0) {
  if (window.firebase && firebase.initializeApp) {
    firebase.initializeApp(firebaseConfig);
  } else {
    console.warn("Firebase SDK no detectado - asegura los scripts de Firebase en panel.html");
  }
}
const storage = (window.firebase && firebase.storage) ? firebase.storage() : null;

// --- DOM references ---
const productList = document.getElementById("product-list");
const btnTienda = document.getElementById("btn-tienda");
const btnTodos = document.getElementById("btn-todos");
const btnSave = document.getElementById("btn-save");
const btnNuevo = document.getElementById("btn-nuevo");

let allProducts = [];
let viewProducts = [];
let renderIndex = 0;
const PAGE_SIZE = 50; // cantidad de productos por página
let showOnlyTienda = true;

// --- Utilidades ---
function showToast(msg, ms = 2200) {
  // console fallback; podés mejorar esto mostrando un elemento UI si querés
  console.log("[TOAST]", msg);
}

// Safe fetch JSON
async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`HTTP ${res.status} ${res.statusText} - ${txt}`);
  }
  return res.json();
}

// --- Cargar productos desde Apps Script (doGet) ---
async function loadProducts() {
  productList.innerHTML = "<em>Cargando productos…</em>";
  try {
    const data = await fetchJSON(WEBAPP_URL);
    if (data.status !== "ok") throw new Error(data.message || "Respuesta inválida");
    allProducts = (data.products || []).map(p => ({
      Codigo: String(p.Codigo || "").trim(),
      Nombre: p.Nombre || "",
      Descripcion: p.Descripcion || "",
      Categoria: p.Categoria || "",
      SubCategoria: p.SubCategoria || "",
      Precio: p.Precio || 0,
      Proveedor: p.Proveedor || "",
      Habilitado: !!p.Habilitado,
      Orden: Number(p.Orden || 999999),
      Ranking: Number(p.Ranking || 999999),
      ImagenURL: p.ImagenURL || ""
    }));
    applyView();
  } catch (err) {
    productList.innerHTML = `<div style="color:red">Error cargando productos: ${err.message}</div>`;
    console.error(err);
  }
}

// Aplicar vista (solo tienda o todos)
function applyView() {
  renderIndex = 0; // <<--- importante
  viewProducts = showOnlyTienda ? 
    allProducts.filter(p => p.Habilitado) : 
    [...allProducts];

  renderProducts();
}


// --- Render por categoría/subcategoria ---
function renderProducts() {
  productList.innerHTML = "";

  if (!viewProducts || viewProducts.length === 0) {
    productList.innerHTML = "<div style='padding:20px;color:#555'>No hay productos para mostrar.</div>";
    return;
  }

  // Reset si estamos cambiando de vista
  if (renderIndex === 0) {
    productList.innerHTML = "";
  }

  // Calcular el rango visible
  const slice = viewProducts.slice(0, renderIndex + PAGE_SIZE);

  // Agrupar por categoría / subcategoría
  const groups = {};
  slice.forEach(p => {
    const cat = p.Categoria && p.Categoria.trim() ? p.Categoria : "Sin categoría";
    const sub = p.SubCategoria && p.SubCategoria.trim() ? p.SubCategoria : "General";

    if (!groups[cat]) groups[cat] = {};
    if (!groups[cat][sub]) groups[cat][sub] = [];

    groups[cat][sub].push(p);
  });

  Object.keys(groups).sort().forEach(cat => {
    const catDiv = document.createElement("div");
    
    const h2 = document.createElement("h2");
    h2.textContent = cat;
    catDiv.appendChild(h2);

    Object.keys(groups[cat]).sort().forEach(sub => {
      const h3 = document.createElement("h3");
      h3.textContent = sub;
      catDiv.appendChild(h3);

      const list = document.createElement("div");
      list.className = "sortable-list";

      groups[cat][sub].forEach(p => {
        list.appendChild(createProductRow(p));
      });

      new Sortable(list, {
        animation: 150,
        handle: ".drag",
        onEnd: () => {
          Array.from(list.children).forEach((el, idx) => {
            const code = el.dataset.code;
            const prod = allProducts.find(x => x.Codigo === code);
            if (prod) prod.Orden = idx + 1;
          });
        }
      });

      catDiv.appendChild(list);
    });

    productList.appendChild(catDiv);
  });

  // Botón cargar más
  if (slice.length < viewProducts.length) {
    const btn = document.createElement("button");
    btn.textContent = "Cargar más productos";
    btn.style.margin = "20px auto";
    btn.style.display = "block";
    btn.style.padding = "12px 20px";
    btn.style.background = "#3498db";
    btn.style.color = "white";
    btn.style.border = "none";
    btn.style.borderRadius = "6px";
    btn.style.cursor = "pointer";

    btn.onclick = () => {
      renderIndex += PAGE_SIZE; 
      renderProducts();
    };

    productList.appendChild(btn);
  }
}



// --- Crear fila de producto ---
function createProductRow(p) {
  const row = document.createElement("div");
  row.className = "product-row";
  row.dataset.code = p.Codigo;

  const thumb = document.createElement("img");
  thumb.className = "thumb";
  thumb.src = p.ImagenURL || `/media/PRODUCTOS/${p.Codigo}.jpg`;
  thumb.onerror = () => { thumb.src = "/media/PRODUCTOS/placeholder.png"; };
  row.appendChild(thumb);

  const info = document.createElement("div");
  info.className = "info";
  const name = document.createElement("div");
  name.className = "name";
  name.textContent = p.Nombre;
  info.appendChild(name);
  const code = document.createElement("div");
  code.className = "code";
  code.textContent = `${p.Codigo} — $${p.Precio}`;
  info.appendChild(code);
  row.appendChild(info);

  const controls = document.createElement("div");
  controls.className = "controls";

  // Habilitado toggle
  const habilLabel = document.createElement("label");
  const habil = document.createElement("input");
  habil.type = "checkbox";
  habil.checked = !!p.Habilitado;
  habil.onchange = (e) => { p.Habilitado = e.target.checked; };
  habilLabel.appendChild(habil);
  habilLabel.appendChild(document.createTextNode(" Habilitado"));
  controls.appendChild(habilLabel);

  // Ranking input
  const rankWrapper = document.createElement("div");
  rankWrapper.style.marginTop = "6px";
  const rankLabel = document.createElement("span");
  rankLabel.textContent = "Ranking: ";
  const rank = document.createElement("input");
  rank.type = "number";
  rank.value = p.Ranking || 999999;
  rank.style.width = "80px";
  rank.onchange = (e) => { p.Ranking = Number(e.target.value || 999999); };
  rankWrapper.appendChild(rankLabel);
  rankWrapper.appendChild(rank);
  controls.appendChild(rankWrapper);

  // Upload image input (hidden)
  const imgInput = document.createElement("input");
  imgInput.type = "file";
  imgInput.accept = "image/*";
  imgInput.style.display = "none";
  imgInput.onchange = async (evt) => {
    const f = evt.target.files[0];
    if (!f) return;
    try {
      if (!storage) throw new Error("Firebase storage no inicializado.");
      const path = `${FIREBASE_FOLDER}/${p.Codigo}.jpg`;
      const ref = storage.ref().child(path);
      const snap = await ref.put(f);
      const url = await snap.ref.getDownloadURL();
      p.ImagenURL = url;
      thumb.src = url;
      showToast(`Imagen subida (${p.Codigo})`);
    } catch (err) {
      console.error(err);
      alert("Error subiendo la imagen: " + err.message);
    }
  };

  const btnImg = document.createElement("button");
  btnImg.type = "button";
  btnImg.textContent = "Subir imagen";
  btnImg.onclick = () => imgInput.click();
  controls.appendChild(btnImg);
  controls.appendChild(imgInput);

  // Drag handle
  const drag = document.createElement("button");
  drag.className = "drag";
  drag.innerHTML = "☰";
  drag.title = "Arrastrar para ordenar";
  controls.appendChild(drag);

  row.appendChild(controls);
  return row;
}

// --- Guardar cambios en app_products via POST ---
async function saveChanges() {
  // Construir payload a partir de allProducts
  const payload = allProducts.map(p => ({
    Codigo: p.Codigo,
    Nombre: p.Nombre,
    Descripcion: p.Descripcion,
    Categoria: p.Categoria,
    SubCategoria: p.SubCategoria,
    Precio: p.Precio,
    Proveedor: p.Proveedor,
    Habilitado: !!p.Habilitado,
    Orden: Number(p.Orden || 999999),
    Ranking: Number(p.Ranking || 999999),
    ImagenURL: p.ImagenURL || ""
  }));

  try {
    btnSave.disabled = true;
    btnSave.textContent = "Guardando…";
    const res = await fetch(WEBAPP_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ products: payload })
    });
    const data = await res.json();
    if (data.status === "saved") {
      showToast(`Guardado (${data.count})`);
      // recargar para asegurarnos que backend aplicó todo
      await loadProducts();
    } else {
      throw new Error(data.message || "Error al guardar");
    }
  } catch (err) {
    alert("Error guardando cambios: " + err.message);
    console.error(err);
  } finally {
    btnSave.disabled = false;
    btnSave.textContent = "GUARDAR CAMBIOS";
  }
}

// --- UI Buttons ---
btnTienda.onclick = () => { showOnlyTienda = true; applyView(); };
btnTodos.onclick = () => { showOnlyTienda = false; applyView(); };
btnSave.onclick = () => saveChanges();
btnNuevo.onclick = () => { alert("Crear nuevos productos está deshabilitado."); };

// Inicializar carga
loadProducts();
