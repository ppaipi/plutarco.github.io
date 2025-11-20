/* ================================
   admin.js - Panel Admin Plutarco
   Versión estable 2025
================================ */

/* ------------ CONFIG FIREBASE ------------ */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCGuA_RkvEUptmUHO4YOAzr9qRKtK1cNDQ",
  authDomain: "plutarcodelivery-cf6cb.firebaseapp.com",
  projectId: "plutarcodelivery-cf6cb",
  storageBucket: "plutarcodelivery-cf6cb.appspot.com", // FIX IMPORTANTE
  messagingSenderId: "714627263776",
  appId: "1:714627263776:web:3ee0e4fc657a6c12e37b45"
};

/* ------------ URL APPS SCRIPT ------------ */
/* ⚠️ REEMPLAZAR CON TU WEB APP URL (termina en /exec) */
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbymVHpZITD-LgBBFSK1ThWucgVYURRLhztkfGo2tvGamiFhTL73nfK2BDrtSA9GKJQk/exec";

/* ------------ INIT ------------ */
firebase.initializeApp(FIREBASE_CONFIG);
const storage = firebase.storage();

let allProducts = [];
let currentPage = 1;
let pageSize = 50;

/* ------------ HELPERS ------------ */

function toBool(v) {
  if (v === true || v === "true" || v === 1 || v === "1") return true;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return (s === "true" || s === "t" || s === "si" || s === "sí" || s === "yes");
  }
  return false;
}

function debounce(fn, wait = 250) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function parsePrecio(v) {
  if (v == null) return 0;
  return Number(String(v).replace(/[^\d\.\,]/g,'').replace(',','.')) || 0;
}

/* ------------ TRAER CONFIGURACIÓN REMOTA (app_products en Sheets) ------------ */
async function fetchRemoteConfigs() {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes("TU_URL")) {
    console.warn("APPS_SCRIPT_URL no configurado.");
    return {};
  }
  try {
    const res = await fetch(APPS_SCRIPT_URL);
    const data = await res.json();
    if (data.status !== "ok" || !Array.isArray(data.products)) return {};

    const map = {};
    data.products.forEach(p => {
      const code = (p.Codigo || "").toString().trim();
      if (!code) return;

      map[code] = {
        Habilitado: toBool(p.Habilitado),
        Orden: Number(p.Orden || 999999),
        Ranking: Number(p.Ranking || 999999),
        ImagenURL: p.ImagenURL || ""
      };
    });
    return map;
  } catch (err) {
    console.warn("Error fetchRemoteConfigs:", err.message);
    return {};
  }
}

/* ------------ IMPORTAR EXCEL ------------ */
document.getElementById("excel-input").addEventListener("change", async e => {
  const f = e.target.files[0];
  if (!f) return;

  const reader = new FileReader();
  reader.onload = async evt => {
    const data = new Uint8Array(evt.target.result);
    const wb = XLSX.read(data, { type: "array" });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    /* MERGE remoto (habilitado, orden, ranking, imagen) */
    const remoteMap = await fetchRemoteConfigs();

    allProducts = json.map(row => {
      const codigo = (row["CODIGO BARRA"] || row["ID"] || "").toString().trim();
      const cfg = remoteMap[codigo] || {};

      return {
        Codigo: codigo,
        Nombre: row["DESCRIPCION LARGA"] || row["DESCRIPCION"] || "",
        Descripcion: row["DESCRIPCION ADICIONAL"] || "",
        Categoria: row["RUBRO"] || "",
        SubCategoria: row["SUBRUBRO"] || "",
        Precio: parsePrecio(row["PRECIO VENTA C/IVA"]),
        Proveedor: row["PROVEEDOR"] || "",
        Habilitado: (typeof cfg.Habilitado !== "undefined") ? cfg.Habilitado : false,
        Orden: cfg.Orden || 999999,
        Ranking: cfg.Ranking || 999999,
        ImagenURL: (cfg.ImagenURL && String(cfg.ImagenURL).startsWith("http"))
                    ? cfg.ImagenURL
                    : ""  // placeholder se aplica en el render
      };
    });

    currentPage = 1;
    renderPage();
  };
  reader.readAsArrayBuffer(f);
});

/* ------------ EVENTOS DE BÚSQUEDA Y TAMAÑO PAGINA ------------ */
document.getElementById("search").addEventListener("input",
  debounce(() => { currentPage = 1; renderPage(); }, 200)
);

document.getElementById("page-size").addEventListener("change", e => {
  pageSize = Number(e.target.value);
  currentPage = 1;
  renderPage();
});

/* ------------ RENDER PAGE (PAGINACIÓN) ------------ */
function renderPage() {
  const q = document.getElementById("search").value.trim().toLowerCase();

  let filtered = allProducts.filter(p =>
    p.Codigo.toLowerCase().includes(q) ||
    p.Nombre.toLowerCase().includes(q) ||
    p.Proveedor.toLowerCase().includes(q)
  );

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  if (currentPage > pages) currentPage = pages;

  const start = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);

  const cont = document.getElementById("results");
  cont.innerHTML = "";
  const tpl = document.getElementById("row-tpl");

  pageItems.forEach(p => {
    const node = tpl.content.cloneNode(true);
    const row = node.querySelector(".product-row");

    /* ---- Imagen segura ---- */
    const imgEl = row.querySelector("img.thumb");
    imgEl.loading = "lazy";
    if (p.ImagenURL && p.ImagenURL.startsWith("http")) {
      imgEl.src = p.ImagenURL;
    } else {
      imgEl.src = "/media/no-image.png";
    }
    imgEl.onerror = () => imgEl.src = "/media/no-image.png";

    row.querySelector(".codigo").textContent = p.Codigo || "(sin código)";
    row.querySelector(".nombre").textContent = p.Nombre || "";
    row.querySelector(".proveedor").textContent = p.Proveedor || "";
    row.querySelector(".precio").textContent = p.Precio ? `$${p.Precio}` : "";

    /* ---- Habilitado ---- */
    const habil = row.querySelector(".habilitado");
    habil.checked = !!p.Habilitado;
    habil.onchange = () => { p.Habilitado = habil.checked; };

    /* ---- Orden ---- */
    const ordenInput = row.querySelector(".orden");
    ordenInput.value = p.Orden === 999999 ? "" : p.Orden;
    ordenInput.onchange = () => {
      p.Orden = Number(ordenInput.value) || 999999;
    };

    /* ---- Subir foto ---- */
    const btnPhoto = row.querySelector(".btn-photo");
    let fileInput = null;
    btnPhoto.onclick = () => {
      if (!fileInput) {
        fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = "image/*";
        fileInput.onchange = async ev => {
          const file = ev.target.files[0];
          if (!file) return;

          const name = `${p.Codigo}.jpg`;
          const ref = storage.ref().child(`productos/${name}`);

          try {
            const snap = await ref.put(file);
            const url = await snap.ref.getDownloadURL();
            p.ImagenURL = url;
            imgEl.src = url;
            alert("Imagen subida correctamente");
          } catch (err) {
            console.error(err);
            alert("Error al subir imagen: " + err.message);
          }
        };
        btnPhoto.parentElement.appendChild(fileInput);
      }
      fileInput.click();
    };

    cont.appendChild(node);
  });

  /* ---- PAGINADOR ---- */
  const pager = document.getElementById("pager");
  pager.innerHTML = `Página ${currentPage} / ${pages} — ${total} resultados`;

  const prev = document.createElement("button");
  prev.textContent = "◀ Prev";
  prev.disabled = currentPage === 1;
  prev.onclick = () => { currentPage--; renderPage(); };

  const next = document.createElement("button");
  next.textContent = "Next ▶";
  next.disabled = currentPage === pages;
  next.onclick = () => { currentPage++; renderPage(); };

  pager.appendChild(prev);
  pager.appendChild(next);

  /* ---- Estadísticas ---- */
  const habCount = allProducts.filter(x => x.Habilitado).length;
  document.getElementById("stats").textContent =
    `${habCount} habilitados / ${allProducts.length} productos`;
}

/* ------------ GUARDAR EN APPS SCRIPT ------------ */
document.getElementById("btn-save").addEventListener("click", async () => {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes("TU_URL")) {
    alert("Configurá APPS_SCRIPT_URL correctamente (URL WebApp)");
    return;
  }

  const payload = { products: allProducts };
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type":"application/json" },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    alert("Guardado en Sheets: " + JSON.stringify(data));
  } catch (err) {
    alert("Error guardando: " + err.message);
  }
});

/* FIN DEL ARCHIVO */
