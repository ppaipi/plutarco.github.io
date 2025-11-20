/* admin.js - Panel Admin Plutarco (final)
   - Conecta con Apps Script (GET/POST) y Firebase Storage (subida de imágenes)
   - Soporta import .xlsx, paginación, búsqueda, habilitar/orden, guardar en Sheets
   - Tiene fallback local (path suministrado): /mnt/data/panel.js
*/

/* ========== CONFIG ========== */
// APPS SCRIPT WEB APP (tuya, la que confirmaste)
const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzYuRooT4gimgVgM9QPP9HlsEacR0Ip2IHjZc5QgKeelAojQaaZdQLyG9viFvvLtjzu/exec";

// Firebase v8 config (ya validada)
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCGuA_RkvEUptmUHO4YOAzr9qRKtK1cNDQ",
  authDomain: "plutarcodelivery-cf6cb.firebaseapp.com",
  projectId: "plutarcodelivery-cf6cb",
  storageBucket: "plutarcodelivery-cf6cb.appspot.com",
  messagingSenderId: "714627263776",
  appId: "1:714627263776:web:3ee0e4fc657a6c12e37b45"
};

// LOCAL FALLBACK (archivo que subiste al entorno)
// Devs: el entorno transformará este path a una URL servible cuando lo necesiten.
const LOCAL_FALLBACK_PATH = "/mnt/data/panel.js";

/* ========== INIT FIREBASE (v8) ========== */
if (!window.firebase || !firebase.initializeApp) {
  console.error("Firebase v8 SDK missing. Include firebase-app.js and firebase-storage.js in panel.html");
}
try {
  firebase.initializeApp(FIREBASE_CONFIG);
} catch (e) {
  // si ya estaba inicializado no problemas
  console.warn("Firebase init:", e && e.message);
}
const storage = firebase.storage();

/* ========== STATE ========== */
let allProducts = [];      // array de productos
let currentPage = 1;
let pageSize = 50;
let isSaving = false;

/* ========== UTIL ========== */
function toBool(v) {
  if (v === true || v === "true" || v === 1 || v === "1") return true;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    return ["true","t","si","sí","yes","1"].includes(s);
  }
  return false;
}
function debounce(fn, wait = 200) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(()=>fn(...args), wait); };
}
function parsePrecio(v) {
  if (v == null) return 0;
  return Number(String(v).replace(/[^\d\.\,]/g,'').replace(',','.')) || 0;
}
function showToast(msg, type='info', timeout=3000) {
  const id = 'panel-toast';
  const existing = document.getElementById(id);
  if (existing) existing.remove();
  const el = document.createElement('div');
  el.id = id;
  el.textContent = msg;
  el.style.position = 'fixed';
  el.style.right = '16px';
  el.style.bottom = '18px';
  el.style.padding = '10px 12px';
  el.style.borderRadius = '8px';
  el.style.color = '#fff';
  el.style.zIndex = 99999;
  el.style.background = type==='error' ? '#c0392b' : type==='success' ? '#27ae60' : '#333';
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), timeout);
}

/* ========== FETCH DATA (GET) ========== */
async function fetchProductsFromWebApp() {
  try {
    const res = await fetch(APPS_SCRIPT_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP '+res.status);
    const json = await res.json();
    if (json.status === 'ok' && Array.isArray(json.products)) {
      return json.products.map(normalizeProductFromServer);
    } else {
      // fallback: try reading as direct array
      if (Array.isArray(json)) return json.map(normalizeProductFromServer);
      throw new Error('Payload inesperado');
    }
  } catch (err) {
    console.warn('Fetch WebApp error:', err.message);
    throw err;
  }
}

async function fetchProductsFromLocalFallback() {
  // intenta cargar un archivo JS o JSON local (el entorno lo convertirá a URL)
  try {
    const res = await fetch(LOCAL_FALLBACK_PATH, { cache: 'no-store' });
    if (!res.ok) throw new Error('local fallback HTTP ' + res.status);
    // el archivo puede ser JS con datos o un JSON - intentamos parsear
    const text = await res.text();
    // intentar extraer JSON si el archivo contiene export o var
    const jsonMatch = text.match(/\{[\s\S]*\}[\s\S]*$/m);
    try {
      return JSON.parse(text);
    } catch (e) {
      // no es JSON puro; intentar evaluar solo por seguridad: buscar array en el texto
      const arrMatch = text.match(/\[(?:[\s\S]*?)\]/m);
      if (arrMatch) return JSON.parse(arrMatch[0]);
      throw new Error('No JSON en fallback');
    }
  } catch (err) {
    console.warn('Local fallback error:', err.message);
    return [];
  }
}

function normalizeProductFromServer(p) {
  return {
    Codigo: String(p.Codigo || p.ID || p.code || '').trim(),
    Nombre: p.Nombre || p.name || '',
    Descripcion: p.Descripcion || p.description || '',
    Categoria: p.Categoria || p.category || '',
    SubCategoria: p.SubCategoria || p.subcategory || '',
    Precio: Number(p.Precio || p.Price || 0) || 0,
    Proveedor: p.Proveedor || p.proveedor || '',
    Habilitado: toBool(p.Habilitado),
    Orden: Number(p.Orden || 999999),
    Ranking: Number(p.Ranking || 999999),
    ImagenURL: p.ImagenURL || (p.ImagenURL === undefined ? `/media/PRODUCTOS/${p.Codigo}.jpg` : ''),
    source: p.source || 'server'
  };
}

/* ========== RENDER / PAGINACIÓN ========== */
function renderPage() {
  const q = (document.getElementById('search')?.value || '').trim().toLowerCase();
  const filtered = allProducts.filter(p => {
    const code = String(p.Codigo || '').toLowerCase();
    const name = String(p.Nombre || '').toLowerCase();
    const prov = String(p.Proveedor || '').toLowerCase();
    return code.includes(q) || name.includes(q) || prov.includes(q);
  });

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
  cont.innerHTML = '';
  const tpl = document.getElementById('row-tpl');
  if (!tpl) {
    cont.textContent = 'Template #row-tpl no encontrado';
    return;
  }

  pageItems.forEach(p => {
    const node = tpl.content.cloneNode(true);
    const row = node.querySelector('.product-row');

    // fill
    row.querySelector('.codigo').textContent = p.Codigo || '(sin código)';
    row.querySelector('.nombre').textContent = p.Nombre || '';
    row.querySelector('.proveedor').textContent = p.Proveedor || '';
    row.querySelector('.precio').textContent = p.Precio ? `$${p.Precio}` : '';

    const imgEl = row.querySelector('img.thumb');
    imgEl.src = p.ImagenURL || '/media/placeholder.jpg';
    imgEl.onerror = () => imgEl.src = '/media/placeholder.jpg';

    const habil = row.querySelector('.habilitado');
    habil.checked = !!p.Habilitado;
    habil.onchange = () => { p.Habilitado = !!habil.checked; markDirty(); updateStats(); };

    const ordenInput = row.querySelector('.orden');
    ordenInput.value = (Number(p.Orden) === 999999) ? '' : String(p.Orden);
    ordenInput.onchange = () => { p.Orden = Number(ordenInput.value) || 999999; markDirty(); };

    // upload foto
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
          const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
          const name = `${String(p.Codigo || 'no-code')}.${ext}`;
          const path = `productos/${name}`;
          try {
            showToast('Subiendo imagen...', 'info', 2500);
            const ref = storage.ref().child(path);
            const snap = await ref.put(file);
            const url = await snap.ref.getDownloadURL();
            p.ImagenURL = url;
            imgEl.src = url;
            markDirty();
            showToast('Imagen subida', 'success', 1800);
          } catch (err) {
            console.error('upload error', err);
            showToast('Error subiendo imagen', 'error', 4000);
          }
        };
        btnPhoto.parentElement.appendChild(fileInput);
      }
      fileInput.click();
    };

    cont.appendChild(node);
  });

  // pager
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

function updateStats() {
  const habCount = allProducts.filter(x => toBool(x.Habilitado)).length;
  const stats = document.getElementById('stats');
  if (stats) stats.textContent = `${habCount} habilitados / ${allProducts.length} productos`;
}

/* ========== IMPORT EXCEL ========== */
const excelInput = document.getElementById('excel-input');
if (excelInput) {
  excelInput.addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      showToast('Leyendo Excel...', 'info', 1400);
      const reader = new FileReader();
      reader.onload = async ev => {
        const data = new Uint8Array(ev.target.result);
        const wb = XLSX.read(data, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        // merge remoto: consulta el apps script (si disponible)
        const remoteMap = {};
        try {
          const serverProducts = await fetchProductsFromWebApp();
          serverProducts.forEach(x => { remoteMap[String(x.Codigo || '')] = x; });
        } catch (err) {
          console.warn('No se obtuvo remoteMap en import', err && err.message);
        }

        allProducts = json.map(row => {
          const codigo = String(row['CODIGO BARRA'] || row['ID'] || '').trim();
          const cfg = remoteMap[codigo] || {};
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
            ImagenURL: cfg.ImagenURL || ''
          };
        });

        currentPage = 1;
        renderPage();
        showToast('Excel cargado', 'success', 1500);
      };
      reader.readAsArrayBuffer(f);
    } catch (err) {
      console.error(err);
      showToast('Error leyendo Excel', 'error', 4000);
    }
  });
}

/* ========== GUARDAR (POST a Apps Script) ========== */
document.getElementById('btn-save')?.addEventListener('click', async () => {
  if (isSaving) return;
  if (!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes('TU_URL')) { alert('Configura APPS_SCRIPT_URL'); return; }
  try {
    isSaving = true;
    const btn = document.getElementById('btn-save');
    if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }

    const payload = {
      products: allProducts.map(p => ({
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
      })),
      timestamp: new Date().toISOString()
    };

    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json().catch(()=>({}));
    if (json.status === 'saved' || json.status === 'ok') {
      showToast(`Guardado OK (${json.count || payload.products.length})`, 'success', 3000);
    } else {
      console.log('Respuesta guardado', json);
      showToast('Guardado completado (revisar respuesta)', 'success', 3000);
    }
  } catch (err) {
    console.error('save error', err);
    showToast('Error guardando: ' + (err.message || ''), 'error', 6000);
    alert('Error guardando: ' + (err.message || err));
  } finally {
    isSaving = false;
    const btn = document.getElementById('btn-save');
    if (btn) { btn.disabled = false; btn.textContent = 'GUARDAR CAMBIOS'; }
  }
});

/* ========== BOOTSTRAP: cargar datos al inicio ========== */
async function boot() {
  try {
    showToast('Cargando productos...', 'info', 1200);
    try {
      allProducts = await fetchProductsFromWebApp();
    } catch (err) {
      // intentar fallback local
      const fallback = await fetchProductsFromLocalFallback();
      if (Array.isArray(fallback) && fallback.length) {
        allProducts = fallback.map(normalizeProductFromServer);
        showToast('Cargado fallback local', 'info', 1300);
      } else {
        allProducts = [];
        showToast('No se cargaron productos', 'error', 2200);
      }
    }
    updateStats();
    renderPage();
  } catch (err) {
    console.error('boot error', err);
    showToast('Error inicial', 'error', 4000);
  }
}

/* ========== AUX: marcar dirty (para UX) ========== */
function markDirty() {
  const btn = document.getElementById('btn-save');
  if (btn) btn.style.boxShadow = '0 0 0 4px rgba(0,123,255,0.12)';
}

/* ========== HOOKS UI ========== */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('search')?.addEventListener('input', debounce(()=>{ currentPage = 1; renderPage(); }, 220));
  document.getElementById('page-size')?.addEventListener('change', e => { pageSize = Number(e.target.value) || 50; currentPage = 1; renderPage(); });
  document.getElementById('btn-tienda')?.addEventListener('click', () => {
    const enabled = allProducts.filter(p => toBool(p.Habilitado));
    renderFiltered(enabled);
  });
  document.getElementById('btn-todos')?.addEventListener('click', () => renderPage());
  document.getElementById('btn-nuevo')?.addEventListener('click', () => {
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
    showToast('Producto creado localmente. Pulsá GUARDAR para persistir.', 'info', 3500);
  });

  boot();
});

/* ========== helper renderFiltered ========== */
function renderFiltered(list) {
  const cont = document.getElementById('results');
  cont.innerHTML = '';
  const tpl = document.getElementById('row-tpl');
  if (!tpl) return;
  list.forEach(p => {
    const node = tpl.content.cloneNode(true);
    node.querySelector('.codigo').textContent = p.Codigo || '(sin código)';
    node.querySelector('.nombre').textContent = p.Nombre || '';
    node.querySelector('.proveedor').textContent = p.Proveedor || '';
    node.querySelector('.precio').textContent = p.Precio ? `$${p.Precio}` : '';
    const imgEl = node.querySelector('img.thumb');
    imgEl.src = p.ImagenURL || '/media/no-image.png';
    imgEl.onerror = () => imgEl.src = '/media/no-image.png';
    const habil = node.querySelector('.habilitado');
    habil.checked = !!p.Habilitado;
    habil.onchange = () => { p.Habilitado = !!habil.checked; markDirty(); updateStats(); };
    const ordenInput = node.querySelector('.orden');
    ordenInput.value = (Number(p.Orden)===999999) ? '' : String(p.Orden);
    ordenInput.onchange = () => { p.Orden = Number(ordenInput.value) || 999999; };
    const btnPhoto = node.querySelector('.btn-photo');
    let fileInput = null;
    btnPhoto.onclick = () => {
      if (!fileInput) {
        fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = 'image/*';
        fileInput.onchange = async ev => {
          const file = ev.target.files[0];
          if (!file) return;
          const ext = (file.name.split('.').pop()||'jpg').toLowerCase();
          const name = `${String(p.Codigo||'no-code')}.${ext}`;
          const path = `productos/${name}`;
          try {
            showToast('Subiendo imagen...', 'info', 2000);
            const ref = storage.ref().child(path);
            const snap = await ref.put(file);
            const url = await snap.ref.getDownloadURL();
            p.ImagenURL = url;
            node.querySelector('img.thumb').src = url;
            markDirty();
            showToast('Imagen subida', 'success', 1600);
          } catch(err){ console.error(err); showToast('Error upload', 'error'); }
        };
        btnPhoto.parentElement.appendChild(fileInput);
      }
      fileInput.click();
    };
    cont.appendChild(node);
  });
  updateStats();
}
