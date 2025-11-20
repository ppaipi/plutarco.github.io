// === panel.js para panel.html ===

// -------------- CONFIG: PONER TU WEBAPP URL y firebaseConfig --------------
const WEBAPP_URL = "https://script.google.com/macros/s/YOUR_DEPLOY_ID/exec"; // <-- pegá tu url del WebApp
// firebaseConfig: reemplazá con la configuración que te da Firebase (apiKey, authDomain, etc.)
const firebaseConfig = {
  apiKey: "APIKEY",
  authDomain: "PROJECT.firebaseapp.com",
  projectId: "plutarcodelivery-cf6cb",
  storageBucket: "plutarcodelivery-cf6cb.appspot.com", // importante
  messagingSenderId: "",
  appId: ""
};
// Carpeta dentro del bucket donde guardaremos las imágenes
const FIREBASE_FOLDER = "productos"; // => /productos/{codigo}.jpg
// -------------------------------------------------------------------------

// Inicializar Firebase (si no está ya)
if (!window.firebase.apps || !window.firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const storage = firebase.storage();

// DOM
const productList = document.getElementById("product-list");
const btnTienda = document.getElementById("btn-tienda");
const btnTodos = document.getElementById("btn-todos");
const btnSave = document.getElementById("btn-save");
const btnNuevo = document.getElementById("btn-nuevo");

let allProducts = []; // array original traído del backend
let viewProducts = []; // productos en la vista (filtrados)
let showOnlyTienda = true;

// --- Cargar productos desde el WebApp ---
async function loadProducts() {
  productList.innerHTML = "Cargando productos…";
  try {
    const res = await fetch(WEBAPP_URL);
    const data = await res.json();
    if (data.status !== "ok") throw new Error(data.message || "Error al leer API");
    allProducts = data.products || [];
    // Asegurarnos campos clave
    allProducts = allProducts.map(p => {
      return {
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
      };
    });

    // Por defecto mostrar solo habilitados (si querés todos, clic en "TODOS LOS PRODUCTOS")
    applyView();
  } catch (err) {
    productList.innerHTML = "Error cargando productos: " + err.message;
    console.error(err);
  }
}

function applyView() {
  if (showOnlyTienda) {
    viewProducts = allProducts.filter(p => p.Habilitado);
  } else {
    viewProducts = [...allProducts];
  }
  renderProducts();
}

// --- Renderizar listado por categorías y subcategoria ---
function renderProducts() {
  // Agrupar por categoria -> subcategoria
  const groups = {};
  viewProducts.forEach(p => {
    const cat = p.Categoria || "Sin categoría";
    const sub = p.SubCategoria || "General";
    groups[cat] = groups[cat] || {};
    groups[cat][sub] = groups[cat][sub] || [];
    groups[cat][sub].push(p);
  });

  // Render HTML
  productList.innerHTML = "";
  for (const cat of Object.keys(groups).sort()) {
    const catDiv = document.createElement("div");
    catDiv.className = "category-section";

    const title = document.createElement("h2");
    title.className = "category-title";
    title.textContent = cat;
    catDiv.appendChild(title);

    const subcats = groups[cat];
    for (const sub of Object.keys(subcats).sort()) {
      const subTitle = document.createElement("h3");
      subTitle.className = "subcategory-title";
      subTitle.textContent = sub;
      catDiv.appendChild(subTitle);

      const list = document.createElement("div");
      list.className = "sortable-list";
      // cada item fila
      subcats[sub].sort((a,b) => (a.Orden||999999) - (b.Orden||999999)).forEach(p => {
        const row = createProductRow(p);
        list.appendChild(row);
      });

      // Hacer sortable por drag & drop
      catDiv.appendChild(list);
      new Sortable(list, {
        animation: 150,
        handle: ".drag",
        onEnd: (evt) => {
          // Recalcular orden según nueva posición en ese contenedor
          const items = Array.from(list.children);
          items.forEach((r, idx) => {
            const code = r.dataset.code;
            const prod = allProducts.find(x => x.Codigo === code);
            if (prod) {
              prod.Orden = idx + 1; // orden base 1
            }
          });
          // Re-render para reflejar cambios en otros lugares
          renderProducts();
        }
      });
    }

    productList.appendChild(catDiv);
  }
}

// --- Crear fila de producto para panel ---
function createProductRow(p) {
  const row = document.createElement("div");
  row.className = "product-row";
  row.dataset.code = p.Codigo;

  const thumb = document.createElement("img");
  thumb.className = "thumb";
  thumb.src = p.ImagenURL || "/media/PRODUCTOS/" + p.Codigo + ".jpg";
  thumb.onerror = () => { thumb.src = "/media/PRODUCTOS/placeholder.png"; };
  row.appendChild(thumb);

  const info = document.createElement("div");
  info.className = "info";
  const name = document.createElement("div");
  name.className = "name";
  name.textContent = p.Nombre + "  ";
  info.appendChild(name);
  const code = document.createElement("div");
  code.className = "code";
  code.textContent = p.Codigo + " — $" + p.Precio;
  info.appendChild(code);
  row.appendChild(info);

  const controls = document.createElement("div");
  controls.className = "controls";

  // Habilitado toggle
  const habilLabel = document.createElement("label");
  const habil = document.createElement("input");
  habil.type = "checkbox";
  habil.checked = !!p.Habilitado;
  habil.onchange = (e) => {
    p.Habilitado = e.target.checked;
  };
  habilLabel.appendChild(habil);
  habilLabel.appendChild(document.createTextNode(" Habilitado"));
  controls.appendChild(habilLabel);

  // Ranking (editable)
  const rank = document.createElement("input");
  rank.type = "number";
  rank.value = p.Ranking || 999999;
  rank.style.width = "80px";
  rank.onchange = (e) => {
    p.Ranking = Number(e.target.value || 999999);
  };
  const rankLabel = document.createElement("div");
  rankLabel.appendChild(document.createTextNode("Ranking: "));
  rankLabel.appendChild(rank);
  controls.appendChild(rankLabel);

  // Botón subir imagen
  const imgInput = document.createElement("input");
  imgInput.type = "file";
  imgInput.accept = "image/*";
  imgInput.style.display = "none";
  imgInput.onchange = async (evt) => {
    const f = evt.target.files[0];
    if (!f) return;
    // subir a firebase
    try {
      const uploadPath = `${FIREBASE_FOLDER}/${p.Codigo}.jpg`;
      const storageRef = storage.ref().child(uploadPath);
      const snap = await storageRef.put(f);
      const url = await snap.ref.getDownloadURL();
      p.ImagenURL = url;
      thumb.src = url;
      showToast("Imagen subida: " + p.Codigo);
    } catch (err) {
      console.error(err);
      alert("Error subiendo la imagen: " + err.message);
    }
  };

  const btnImg = document.createElement("button");
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

// --- Guardar cambios: construir array y POST a WebApp ---
async function saveChanges() {
  // Construir array completo basado en allProducts (NO modificamos Nombre/Precio desde panel)
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
      showToast("Cambios guardados (" + data.count + ")");
      // recargar desde backend para estar seguros
      await loadProducts();
    } else {
      throw new Error(data.message || "Error guardando");
    }
  } catch (err) {
    alert("Error al guardar: " + err.message);
    console.error(err);
  } finally {
    btnSave.disabled = false;
    btnSave.textContent = "GUARDAR CAMBIOS";
  }
}

// --- UI buttons ---
btnTienda.onclick = () => {
  showOnlyTienda = true;
  applyView();
};
btnTodos.onclick = () => {
  showOnlyTienda = false;
  applyView();
};
btnSave.onclick = () => saveChanges();
btnNuevo.onclick = () => {
  alert("La creación de nuevos productos está deshabilitada (según tu configuración).");
};

// --- Toast simple ---
function showToast(msg) {
  console.log("TOAST:", msg);
  // podés mejorar y mostrar en UI si querés
}

// Inicializar
loadProducts();
