/* ================================
   admin.js - Panel Admin Plutarco
   Versión actualizada 2025-11
   - Mejora: gestión robusta, toasts, bloqueo UI al guardar,
     manejo de uploads a Firebase Storage, paginación y búsqueda.
================================ */

/* ------------ CONFIG FIREBASE & APPSCRIPT ------------ */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCGuA_RkvEUptmUHO4YOAzr9qRKtK1cNDQ",
  authDomain: "plutarcodelivery-cf6cb.firebaseapp.com",
  projectId: "plutarcodelivery-cf6cb",
  storageBucket: "plutarcodelivery-cf6cb.appspot.com", // <-- correcto
  messagingSenderId: "714627263776",
  appId: "1:714627263776:web:3ee0e4fc657a6c12e37b45"
};

// Tu WebApp URL (Google Apps Script)
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbymVHpZITD-LgBBFSK1ThWucgVYURRLhztkfGo2tvGamiFhTL73nfK2BDrtSA9GKJQk/exec";

/* ------------ INIT FIREBASE (v8 compat) ------------ */
// Asegurate de cargar firebase v8 en panel.html: 
// <script src="https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js"></script>
// <script src="https://www.gstatic.com/firebasejs/8.10.0/firebase-storage.js"></script>

if (!window.firebase || !firebase.initializeApp) {
  console.error('Firebase SDK v8 no está cargado. Asegurate de incluir firebase-app.js y firebase-storage.js');
}
try {
  firebase.initializeApp(FIREBASE_CONFIG);
} catch (e) {
  // si ya estaba inicializado, ok
  console.warn('Firebase init warning', e && e.message);
}
const storage = firebase.storage();

/* ------------ STATE ------------ */
let allProducts = [];
let currentPage = 1;
let pageSize = 50;
let lastFetchTime = null;
let isSaving = false;

/* ------------ UTIL ------------ */
function toBool(v) {
  if (v === true || v === "true" || v === 1 || v === "1") return true;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return (s === "true" || s === "t" || s === "si" || s === "sí" || s === "yes" || s === "1");
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

function showToast(msg, type = 'info', timeout = 3000) {
  // type: info|success|error
  const id = 'admin-toast';
  let el = document.getElementById(id);
  if (el) el.remove();
  el = document.createElement('div');
  el.id = id;
  el.style.position = 'fixed';
  el.style.right = '16px';
  el.style.bottom = '18px';
  el.style.padding = '10px 14px';
  el.style.borderRadius = '8px';
  el.style.color = '#fff';
  el.style.zIndex = 99999;
  el.style.fontFamily = 'Inter, Arial, sans-serif';
  el.style.boxShadow = '0 8px 28px rgba(0,0,0,0.18)';
  el.style.background = (type === 'success') ? '#2e7d32' : (type === 'error' ? '#c62828' : '#333');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el && el.remove(), timeout);
}

/* ------------ FETCH REMOTE CONFIG (GET from Apps Script) ------------ */
async function fetchRemoteConfigs() {
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes('TU_URL')) {
    console.warn('APPS_SCRIPT_URL no configurado');
    return {};
  }
  try {
    const res = await fetch(APPS_SCRIPT_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    if (payload.status !== 'ok' || !Array.isArray(payload.products)) {
      console.warn('Payload inesperado de apps script', payload);
      return {};
    }
    const map = {};
    payload.products.forEach(p => {
      const code = String(p.Codigo || '').trim();
      if (!code) return;
      map[code] = {
        Habilitado: toBool(p.Habilitado),
        Orden: Number(p.Orden || 999999),
        Ranking: Number(p.Ranking || 999999),
        ImagenURL: p.ImagenURL || ''
      };
    });
    lastFetchTime = new Date();
    return map;
  } catch (err) {
    console.warn('fetchRemoteConfigs error', err);
    return {};
  }
}

/* ------------ IMPORT EXCEL (input#excel-input) ------------ */
const excelInput = document.getElementById('excel-input');
if (excelInput) {
  excelInput.addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      showToast('Leyendo archivo Excel...', 'info', 2200);
      const reader = new FileReader();
      reader.onload = async evt => {
        const data = new Uint8Array(evt.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        const remote = await fetchRemoteConfigs();

        // Mapear
        allProducts = json.map(row => {
          const codigo = String(row['CODIGO BARRA'] || row['ID'] || '').trim();
          const cfg = remote[codigo] || {};
          return {
            Codigo: codigo,
            Nombre: row['DESCRIPCION LARGA'] || row['DESCRIPCION'] || '',
            Descripcion: row['DESCRIPCION ADICIONAL'] || '',
            Categoria: row['RUBRO'] || '',
            SubCategoria: row['SUBRUBRO'] || '',
            Precio: parsePrecio(row['PRECIO VENTA C/IVA']),
            Proveedor: row['PROVEEDOR'] || '',
            Habilitado: (typeof cfg.Habilitado !== 'undefined') ? cfg.Habilitado : false,
            Orden: cfg.Orden || 999999,
            Ranking: cfg.Ranking || 999999,
            ImagenURL: (cfg.ImagenURL && String(cfg.ImagenURL).startsWith('http')) ? cfg.ImagenURL : '',
          };
        });

        currentPage = 1;
        renderPage();
        showToast('Excel procesado', 'success', 1500);
      };
      reader.readAsArrayBuffer(f);
    } catch (err) {
      console.error(err);
      showToast('Error al leer Excel', 'error', 4000);
    }
  });
}

/* ------------ SEARCH & PAGE SIZE HOOKS ------------ */
const searchEl = document.getElementById('search');
if (searchEl) {
  searchEl.addEventListener('input', debounce(() => { currentPage = 1; renderPage(); }, 220));
}
const pageSizeEl = document.getElementById('page-size');
if (pageSizeEl) {
  pageSizeEl.addEventListener('change', e => { pageSize = Number(e.target.value) || 50; currentPage = 1; renderPage(); });
}

/* ------------ RENDER (PAGINADO) ------------ */
function renderPage() {
  const q = (document.getElementById('search')?.value || '').trim().toLowerCase();

  let filtered = allProducts.filter(p => {
    // proteger si campos vacíos
    const code = String(p.Codigo || '').toLowerCase();
    const nombre = String(p.Nombre || '').toLowerCase();
    const prov = String(p.Proveedor || '').toLowerCase();
    return code.includes(q) || nombre.includes(q) || prov.includes(q);
  });

  // Orden natural por Orden, luego Nombre
  filtered.sort((a,b) => {
    const oa = Number(a.Orden || 999999);
    const ob = Number(b.Orden || 999999);
    if (oa !== ob) return oa - ob;
    return String(a.Nombre || '').localeCompare(String(b.Nombre || ''));
  });

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (currentPage > pages) currentPage = pages;
  const start = (currentPage - 1) * pageSize;
  const pageItems = filtered.slice(start, start + pageSize);

  const cont = document.getElementById('results');
  if (!cont) {
    console.error('#results no existe en el DOM');
    return;
  }
  cont.innerHTML = '';

  const tpl = document.getElementById('row-tpl');
  if (!tpl) {
    cont.innerHTML = `<div style="color: #a00">Falta template #row-tpl en panel.html</div>`;
    return;
  }

  pageItems.forEach(p => {
    const node = tpl.content.cloneNode(true);
    const row = node.querySelector('.product-row');

    // Thumb
    const imgEl = row.querySelector('img.thumb');
    imgEl.loading = 'lazy';
    const src = (p.ImagenURL && String(p.ImagenURL).startsWith('http')) ? p.ImagenURL : '/media/no-image.png';
    imgEl.src = src;
    imgEl.onerror = () => imgEl.src = '/media/no-image.png';

    row.querySelector('.codigo').textContent = p.Codigo || '(sin código)';
    row.querySelector('.nombre').textContent = p.Nombre || '';
    row.querySelector('.proveedor').textContent = p.Proveedor || '';
    row.querySelector('.precio').textContent = p.Precio ? `$${p.Precio}` : '';

    // Habilitado checkbox (editable)
    const habil = row.querySelector('.habilitado');
    habil.checked = !!p.Habilitado;
    habil.onchange = () => { p.Habilitado = !!habil.checked; updateStats(); };

    // Orden input (editable)
    const ordenInput = row.querySelector('.orden');
    ordenInput.value = (Number(p.Orden) === 999999) ? '' : String(p.Orden);
    ordenInput.onchange = () => { p.Orden = Number(ordenInput.value) || 999999; };

    // Bot subir foto
    const btnPhoto = row.querySelector('.btn-photo');
    let fileInput = null;
    btnPhoto.onclick = () => {
      if (!fileInput) {
        fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.onchange = async ev => {
          const file = ev.target.files[0];
          if (!file) return;
          const ext = file.name.split('.').pop().toLowerCase();
          const name = `${String(p.Codigo || 'no-code')}.${ext || 'jpg'}`;
          const path = `productos/${name}`;
          try {
            showToast('Subiendo imagen...', 'info', 2500);
            const ref = storage.ref().child(path);
            const snap = await ref.put(file);
            const url = await snap.ref.getDownloadURL();
            p.ImagenURL = url;
            // actualizar thumbnail inmediato
            imgEl.src = url;
            showToast('Imagen subida', 'success', 1800);
          } catch (err) {
            console.error('upload error', err);
            showToast('Error subiendo imagen', 'error', 3500);
          }
        };
        btnPhoto.parentElement.appendChild(fileInput);
      }
      fileInput.click();
    };

    cont.appendChild(node);
  });

  // Pager
  const pager = document.getElementById('pager');
  pager.innerHTML = `Página ${currentPage} / ${pages} — ${total} resultados`;
  const prev = document.createElement('button');
  prev.textContent = '◀ Prev';
  prev.disabled = currentPage === 1;
  prev.onclick = () => { currentPage--; renderPage(); };

  const next = document.createElement('button');
  next.textContent = 'Next ▶';
  next.disabled = currentPage === pages;
  next.onclick = () => { currentPage++; renderPage(); };

  pager.appendChild(prev);
  pager.appendChild(next);

  updateStats();
}

/* ------------ ESTADÍSTICAS ------------ */
function updateStats() {
  const habCount = allProducts.filter(x => toBool(x.Habilitado)).length;
  document.getElementById('stats').textContent = `${habCount} habilitados / ${allProducts.length} productos`;
}

/* ------------ GUARDAR EN APPS SCRIPT (POST) ------------ */
const saveBtn = document.getElementById('btn-save');
if (saveBtn) {
  saveBtn.addEventListener('click', async () => {
    if (isSaving) return;
    if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes('TU_URL')) { alert('Configura APPS_SCRIPT_URL'); return; }

    try {
      isSaving = true;
      saveBtn.disabled = true;
      saveBtn.textContent = 'Guardando...';
      showToast('Guardando en Sheets...', 'info', 2500);

      // Normalizar payload: mantener las keys que usa tu Apps Script
      const payload = { products: allProducts.map(p => ({
        Codigo: p.Codigo,
        Habilitado: p.Habilitado,
        Orden: p.Orden,
        Ranking: p.Ranking,
        ImagenURL: p.ImagenURL || '',
        Nombre: p.Nombre,
        Descripcion: p.Descripcion || '',
        Categoria: p.Categoria || '',
        SubCategoria: p.SubCategoria || '',
        Precio: p.Precio || 0,
        Proveedor: p.Proveedor || ''
      })) };

      const res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json().catch(() => ({}));
      if (json.status === 'saved' || json.status === 'ok') {
        showToast(`Guardado OK (${json.count || allProducts.length})`, 'success', 3000);
      } else {
        showToast('Guardado completado (ver respuesta)', 'success', 2800);
        console.log('Respuesta apps script:', json);
      }
    } catch (err) {
      console.error('save error', err);
      showToast('Error al guardar: ' + (err.message || ''), 'error', 5000);
      alert('Error guardando: ' + (err.message || err));
    } finally {
      isSaving = false;
      saveBtn.disabled = false;
      saveBtn.textContent = 'GUARDAR CAMBIOS';
    }
  });
}

/* ------------ INIT: hook botones y auto-fetch (opcional) ------------ */
document.addEventListener('DOMContentLoaded', () => {
  // Botones superiores (si existen)
  const btnTienda = document.getElementById('btn-tienda');
  const btnTodos = document.getElementById('btn-todos');
  const btnNuevo = document.getElementById('btn-nuevo');

  if (btnTienda) btnTienda.onclick = () => {
    // mostrar solo habilitados
    const enabled = allProducts.filter(p => toBool(p.Habilitado));
    // reemplazamos la vista temporal para mostrar solo habilitados
    // Nota: para simplicidad actualizamos allProductsDisplayed y renderizamos.
    // Mantendremos allProducts intacto.
    // Implementamos cambiando temporalmente pageSize y currentPage
    // pero la forma más simple: actualizar DOM con lista filtrada
    renderFiltered(enabled);
  };

  if (btnTodos) btnTodos.onclick = () => { renderPage(); };

  if (btnNuevo) btnNuevo.onclick = () => {
    const nombre = prompt('Nombre nuevo producto:');
    if (!nombre) return;
    const codigo = prompt('Código (SKU):');
    if (!codigo) return;
    const precio = parsePrecio(prompt('Precio:', '0'));
    const nuevo = {
      Codigo: String(codigo).trim(),
      Nombre: String(nombre).trim(),
      Descripcion: '',
      Categoria: 'Sin categoría',
      SubCategoria: 'principal',
      Precio: precio,
      Proveedor: '',
      Habilitado: true,
      Orden: 999999,
      Ranking: 999999,
      ImagenURL: ''
    };
    allProducts.unshift(nuevo);
    renderPage();
    showToast('Producto creado (solo local). Pulsá GUARDAR para persistir.', 'info', 3500);
  };

  // Auto fetch remote on load to pre-populate if sheet ya tiene datos
  (async () => {
    try {
      const remoteMap = await fetchRemoteConfigs();
      // Si hay remoteMap, y allProducts vacío -> fetch via GET (tu GET ya devuelve combined excel+config)
      // Llamamos al endpoint para obtener products combinados (tu doGet).
      if (APPS_SCRIPT_URL && Object.keys(remoteMap || {}).length >= 0) {
        try {
          const res = await fetch(APPS_SCRIPT_URL, { cache: 'no-cache' });
          if (res.ok) {
            const json = await res.json();
            if (json.status === 'ok' && Array.isArray(json.products)) {
              allProducts = json.products.map(p => ({
                Codigo: p.Codigo || '',
                Nombre: p.Nombre || '',
                Descripcion: p.Descripcion || '',
                Categoria: p.Categoria || '',
                SubCategoria: p.SubCategoria || '',
                Precio: p.Precio || 0,
                Proveedor: p.Proveedor || '',
                Habilitado: toBool(p.Habilitado),
                Orden: Number(p.Orden || 999999),
                Ranking: Number(p.Ranking || 999999),
                ImagenURL: p.ImagenURL || (p.ImagenURL === undefined ? `/media/PRODUCTOS/${p.Codigo}.jpg` : '')
              }));
              renderPage();
              showToast('Productos cargados desde Sheets', 'success', 1400);
              return;
            }
          }
        } catch (err) {
          console.warn('No se pudo obtener lista desde Apps Script (GET)', err);
        }
      }
    } catch (e) { console.warn(e); }

    // si no cargó nada, dejamos vacío hasta que se importe Excel
    renderPage();
  })();
});

/* ------------ RENDER FILTERED (helper) ------------ */
function renderFiltered(list) {
  // renderiza una lista simple (sin paginador) — usada por btn-tienda
  const cont = document.getElementById('results');
  cont.innerHTML = '';
  const tpl = document.getElementById('row-tpl');
  if (!tpl) return;
  list.forEach(p => {
    const node = tpl.content.cloneNode(true);
    const row = node.querySelector('.product-row');

    const imgEl = row.querySelector('img.thumb');
    imgEl.src = p.ImagenURL || '/media/no-image.png';
    imgEl.onerror = () => imgEl.src = '/media/no-image.png';

    row.querySelector('.codigo').textContent = p.Codigo || '(sin código)';
    row.querySelector('.nombre').textContent = p.Nombre || '';
    row.querySelector('.proveedor').textContent = p.Proveedor || '';
    row.querySelector('.precio').textContent = p.Precio ? `$${p.Precio}` : '';

    const habil = row.querySelector('.habilitado');
    habil.checked = !!p.Habilitado;
    habil.onchange = () => { p.Habilitado = !!habil.checked; updateStats(); };

    const ordenInput = row.querySelector('.orden');
    ordenInput.value = (Number(p.Orden) === 999999) ? '' : String(p.Orden);
    ordenInput.onchange = () => { p.Orden = Number(ordenInput.value) || 999999; };

    // Upload button as before
    const btnPhoto = row.querySelector('.btn-photo');
    let fileInput = null;
    btnPhoto.onclick = () => {
      if (!fileInput) {
        fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.onchange = async ev => {
          const file = ev.target.files[0];
          if (!file) return;
          const ext = file.name.split('.').pop().toLowerCase();
          const name = `${String(p.Codigo || 'no-code')}.${ext || 'jpg'}`;
          const path = `productos/${name}`;
          try {
            showToast('Subiendo imagen...', 'info', 2500);
            const ref = storage.ref().child(path);
            const snap = await ref.put(file);
            const url = await snap.ref.getDownloadURL();
            p.ImagenURL = url;
            row.querySelector('img.thumb').src = url;
            showToast('Imagen subida', 'success', 1800);
          } catch (err) {
            console.error('upload error', err);
            showToast('Error subiendo imagen', 'error', 3500);
          }
        };
        btnPhoto.parentElement.appendChild(fileInput);
      }
      fileInput.click();
    };

    cont.appendChild(node);
  });

  updateStats();
}

/* END OF FILE */
