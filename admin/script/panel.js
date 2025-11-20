/* panel_admin.js - V2 (con drag&drop, modal upload, filtros y trigger workflow) */

/* === CONFIG === */
const FALLBACK_LOCAL_PATH = "/mnt/data/panel.js";
const DEFAULT_PRODUCTS_URL = "/products.json";
const DEFAULT_APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbzYuRooT4gimgVgM9QPP9HlsEacR0Ip2IHjZc5QgKeelAojQaaZdQLyG9viFvvLtjzu/exec";
const firebaseConfig = {
  apiKey: "AIzaSyCGuA_RkvEUptmUHO4YOAzr9qRKtK1cNDQ",
  authDomain: "plutarcodelivery-cf6cb.firebaseapp.com",
  projectId: "plutarcodelivery-cf6cb",
  storageBucket: "plutarcodelivery-cf6cb.appspot.com", // ← ✔ CORRECTO
  messagingSenderId: "714627263776",
  appId: "1:714627263776:web:3ee0e4fc657a6c12e37b45",
  measurementId: "G-99MNS9JHQN"
};
let batchSize = 50;
let renderLimit = 50;



/* === INIT FIREBASE (app + storage + auth) === */
if (window.firebase && firebase.initializeApp) {
  try { firebase.initializeApp(firebaseConfig); } catch (e) { console.log(e); }
}
const storage = (window.firebase && firebase.storage) ? firebase.storage() : null;
const auth = (window.firebase && firebase.auth) ? firebase.auth() : null;

/* STATE */
let productsMaster = [];
let cfgProducts = [];
let merged = [];
let APPS_URL = DEFAULT_APPSCRIPT_URL;
let PRODUCTS_URL = DEFAULT_PRODUCTS_URL;

/* Virtualization */
const ITEM_HEIGHT = 116;
const BUFFER = 20;

/* DOM helpers */
const $ = s => document.querySelector(s);
const create = (t, a={}) => { const e = document.createElement(t); Object.entries(a).forEach(([k,v])=>e.setAttribute(k,v)); return e; };
function toBool(v) {
  if (v === true) return true;
  if (v === false) return false;
  if (typeof v === "number") return v > 0;
  if (v === null || v === undefined) return false;

  v = String(v).trim().toLowerCase();

  return ["1", "true", "sí", "si", "enabled", "habilitado", "activo"].includes(v);
}


const elProductsUrl = document.getElementById('url-products');
const elAppsUrl = document.getElementById('url-appscript');
const btnLoad = document.getElementById('btn-load');
const btnSave = document.getElementById('btn-save');
const elSearch = document.getElementById('search');
const elOnlyEnabled = document.getElementById('only-enabled');
const elSort = document.getElementById('sort-by');
const elStats = document.getElementById('stats');

const elFilterCategory = document.getElementById('filter-category');
const elFilterSubcategory = document.getElementById('filter-subcategory');

const btnAuth = document.getElementById('btn-auth');
const elAdminUser = document.getElementById('admin-user');
const btnGithubSync = document.getElementById('btn-github-sync');

/* Ensure viewport */
(function ensureViewport(){
  let v = document.querySelector('.list-viewport');
  if(!v){
    const results = document.getElementById('results');
    const wrapper = create('div'); wrapper.className='list-viewport';
    const spacer = create('div'); spacer.className='inner-spacer'; spacer.style.height='0px';
    wrapper.appendChild(spacer);
    if(results){
      results.parentNode.replaceChild(wrapper, results);
      wrapper.appendChild(results);
      results.classList.add('inner-list');
      results.style.position = 'absolute';
      results.style.top = '0';
      results.style.left = '0';
    } else {
      const newRes = create('div'); newRes.id='results'; newRes.className='inner-list'; newRes.style.position='absolute';
      wrapper.appendChild(newRes);
      document.querySelector('.wrap').appendChild(wrapper);
    }
    v = document.querySelector('.list-viewport');
  }
})();
const viewport = document.querySelector('.list-viewport');
const innerSpacer = viewport.querySelector('.inner-spacer');
const resultsRoot = viewport.querySelector('.inner-list');

let visibleStart = 0, visibleEnd = 0;
/* filtered indices cache */
let filteredIdxes = [];

/* FETCH */
async function fetchJsonSafe(url){
  try{
    const r = await fetch(url, {cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    return await r.json();
  }catch(err){
    console.warn('fetchJsonSafe failed', url, err.message);
    try{
      const r2 = await fetch(FALLBACK_LOCAL_PATH, {cache:'no-store'});
      if(r2.ok){
        const t = await r2.text();
        try{ return JSON.parse(t); }catch(e){}
      }
    }catch(e){}
    throw err;
  }
}
async function fetchAppProducts(url){
  try{
    const r = await fetch(url, {cache:'no-store'});
    if(!r.ok) throw new Error('AppScript GET '+r.status);
    const j = await r.json();
    if(j.status === 'ok' && Array.isArray(j.products)) return j.products;
    if(Array.isArray(j)) return j;
    return [];
  }catch(err){
    console.warn('fetchAppProducts error', err.message);
    return [];
  }
}

/* MERGE */
function mergeProducts(){
  const map = new Map();
  cfgProducts.forEach(c => map.set(String(c.Codigo).trim(), c));
  merged = productsMaster.map(p => {
    const code = String(p.Codigo || p.ID || p['CODIGO BARRA'] || '').trim();
    const base = {
      Codigo: code,
      Nombre: p.Nombre || p['DESCRIPCION LARGA'] || p['DESCRIPCION'] || '',
      Categoria: p.Categoria || p['RUBRO'] || '',
      SubCategoria: p.SubCategoria || p['SUBRUBRO'] || '',
      Proveedor: p.Proveedor || '',
      Precio: Number(p.Precio || p['PRECIO VENTA C/IVA'] || 0) || 0,
      ImagenURL: p.ImagenURL || `/media/PRODUCTOS/${code}.jpg`,
      Descripcion: p.Descripcion || ''
    };
    const cfg = map.get(code) || {};
    return {
      ...base,
      Habilitado: (typeof cfg.Habilitado !== 'undefined') ? toBool(cfg.Habilitado) : !!p.Habilitado,
      Orden: Number(cfg.Orden || cfg.Ranking || p.Orden || 999999) || 999999,
      Ranking: Number(cfg.Ranking || p.Ranking || 999999) || 999999,
      ImagenURL: (cfg.ImagenURL && String(cfg.ImagenURL).startsWith('http')) ? cfg.ImagenURL : base.ImagenURL
    };
  });
}

/* FILTER + SORT -> devuelve array de indices en merged */
function filteredIndices(){
  const q = (elSearch?.value || '').trim().toLowerCase();
  const only = elOnlyEnabled?.checked;
  const catFilter = (elFilterCategory?.value || '').trim();
  const subFilter = (elFilterSubcategory?.value || '').trim();

  let arr = merged.map((_,i)=>i);
  if(q){
    arr = arr.filter(i => {
      const p = merged[i];
      return ((p.Codigo + ' ' + p.Nombre + ' ' + (p.Proveedor||'') + ' ' + (p.Categoria||'') + ' ' + (p.SubCategoria||'')).toLowerCase().indexOf(q) !== -1);
    });
  }
  if(only) arr = arr.filter(i => merged[i].Habilitado);
  if(catFilter) arr = arr.filter(i => (merged[i].Categoria||'') === catFilter);
  if(subFilter) arr = arr.filter(i => (merged[i].SubCategoria||'') === subFilter);

  const sortBy = elSort?.value || 'orden';
  arr.sort((a,b)=>{
    const A = merged[a], B = merged[b];
    if(sortBy === 'orden') return (A.Orden||999999) - (B.Orden||999999);
    if(sortBy === 'nombre') return (A.Nombre||'').localeCompare(B.Nombre||'');
    if(sortBy === 'precio') return (A.Precio||0) - (B.Precio||0);
    return 0;
  });

  filteredIdxes = arr;
  return arr;
}

/* RENDER / VIRTUAL */
function updateSpacerAndRender() {

  // 1) Aplicar el límite (batchSize / loadMore)
  const limited = filteredIndices().slice(0, renderLimit);
  const total = limited.length;

  // 2) Altura del spacer
  innerSpacer.style.height = (total * ITEM_HEIGHT) + 'px';

  // 3) Calcular ventana visible
  const scrollTop = viewport.scrollTop;
  const vpHeight = viewport.clientHeight;

  const firstVisible = Math.max(
    0,
    Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER
  );

  const visibleCount = Math.ceil(vpHeight / ITEM_HEIGHT) + BUFFER * 2;

  const lastVisible = Math.min(
    total - 1,
    firstVisible + visibleCount - 1
  );

  visibleStart = firstVisible;
  visibleEnd = lastVisible;

  // 4) Render de las tarjetas visibles
  resultsRoot.innerHTML = '';

  for (let slot = visibleStart; slot <= visibleEnd; slot++) {
    const globalIndex = limited[slot];
    const y = slot * ITEM_HEIGHT;
    const p = merged[globalIndex];
    const node = renderCardAbsolute(p, y, slot, globalIndex);
    resultsRoot.appendChild(node);
  }

  // 5) Stats
  elStats.textContent =
    `${total} items — mostrando ${Math.max(0, visibleEnd - visibleStart + 1)}`;

  // 6) Lazy loading de imágenes (nueva parte)
  observeLazyImages();
}


/* Render single card (absolute) with drag handlers */
function renderCardAbsolute(p, y, slot, globalIndex){
  const el = document.createElement('div');
  el.className = 'card admin-card';
  el.style.top = y + 'px';
  el.style.height = (ITEM_HEIGHT - 10) + 'px';
  el.setAttribute('draggable', 'true');
  el.dataset.index = String(globalIndex);

  el.innerHTML = `
    <img class="thumb" src="${p.ImagenURL}" loading="lazy" onerror="this.src='/media/PRODUCTOS/placeholder.jpg'"/>
    <div class="meta">
      <div class="name">${escapeHtml(p.Nombre)}</div>
      <div class="desc">${escapeHtml(p.Descripcion || '')}</div>
      <div class="code">${escapeHtml(p.Codigo)} • ${escapeHtml(p.Categoria || '')} / ${escapeHtml(p.SubCategoria||'')}</div>
    </div>
    <div class="controls-right">
      <label><input type="checkbox" class="toggle-hab" ${p.Habilitado ? 'checked' : ''}/> Habilitado</label>
      <label>Orden <input type="number" class="inp-orden" value="${p.Orden===999999?'':p.Orden}"></label>
      <label>Ranking <input type="number" class="inp-rank" value="${p.Ranking===999999?'':p.Ranking}"></label>
      <div style="display:flex;gap:6px">
        <button class="btn btn-ghost btn-photo">Imagen</button>
        <button class="btn btn-ghost btn-up">▲</button>
        <button class="btn btn-ghost btn-down">▼</button>
      </div>
    </div>
  `;

  // events
  const cb = el.querySelector('.toggle-hab');
  const inpOrden = el.querySelector('.inp-orden');
  const inpRank = el.querySelector('.inp-rank');
  const btnPhoto = el.querySelector('.btn-photo');
  const btnUp = el.querySelector('.btn-up');
  const btnDown = el.querySelector('.btn-down');

  cb.addEventListener('change', () => { p.Habilitado = cb.checked; markDirty(); });
  inpOrden.addEventListener('change', () => { p.Orden = Number(inpOrden.value) || 999999; markDirty(); });
  inpRank.addEventListener('change', () => { p.Ranking = Number(inpRank.value) || 999999; p.Orden = p.Ranking; markDirty(); });

  btnPhoto.addEventListener('click', () => openImageModal(p, el.querySelector('.thumb')));

  btnUp.addEventListener('click', () => swapWithNeighbor(globalIndex, -1));
  btnDown.addEventListener('click', () => swapWithNeighbor(globalIndex, +1));

  // Drag & drop handlers
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('text/plain', String(globalIndex));
    el.classList.add('dragging');
  });
  el.addEventListener('dragend', () => {
    el.classList.remove('dragging');
  });

  el.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; el.classList.add('drag-over'); });
  el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
  el.addEventListener('drop', (e) => {
    e.preventDefault();
    el.classList.remove('drag-over');
    const from = Number(e.dataTransfer.getData('text/plain'));
    const to = globalIndex;
    if(Number.isFinite(from) && from !== to) {
      swapRankingValues(from, to);
    }
  });

  return el;
}

/* Escape html */
function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

/* Swap neighbor via UI buttons */
function swapWithNeighbor(globalIndex, dir){
  // find in filteredIdxes position
  const pos = filteredIdxes.indexOf(globalIndex);
  if(pos === -1) return;
  const targetPos = pos + dir;
  if(targetPos < 0 || targetPos >= filteredIdxes.length) return;
  const otherIndex = filteredIdxes[targetPos];
  swapRankingValues(globalIndex, otherIndex);
}

/* Swap ranking values between two merged indices */
function swapRankingValues(idxA, idxB){
  const a = merged[idxA], b = merged[idxB];
  if(!a || !b) return;
  // swap Ranking & Orden (and keep numeric)
  const rA = Number(a.Ranking||a.Orden||999999), rB = Number(b.Ranking||b.Orden||999999);
  a.Ranking = rB; a.Orden = rB;
  b.Ranking = rA; b.Orden = rA;
  markDirty();
  // re-render - keep scroll position
  updateSpacerAndRender();
}

/* IMAGE MODAL + UPLOAD */
let currentModalProduct = null;
let currentModalImgEl = null;
function openImageModal(product, imgEl){
  currentModalProduct = product;
  currentModalImgEl = imgEl;
  const modal = document.getElementById('image-modal');
  const preview = document.getElementById('modal-img-preview');
  const input = document.getElementById('modal-file-input');
  const info = document.getElementById('modal-info');
  const uploadBtn = document.getElementById('modal-upload-btn');
  const closeBtn = document.getElementById('modal-close-btn');

  preview.src = product.ImagenURL || '/media/PRODUCTOS/placeholder.jpg';
  info.textContent = `Código: ${product.Codigo} — Nombre: ${product.Nombre || ''}`;
  input.value = '';

  uploadBtn.onclick = async () => {
    const file = input.files[0];
    if(!file) { alert('Seleccioná un archivo'); return; }
    try {
      uploadBtn.disabled = true;
      uploadBtn.textContent = 'Subiendo...';
      const url = await uploadFileToFirebase(product, file);
      product.ImagenURL = url;
      if(currentModalImgEl) currentModalImgEl.src = url;
      preview.src = url;
      markDirty();
      alert('Imagen subida OK');
    } catch (err) {
      console.error(err);
      alert('Error subiendo: ' + (err.message || err));
    } finally {
      uploadBtn.disabled = false;
      uploadBtn.textContent = 'Subir y reemplazar';
    }
  };

  closeBtn.onclick = () => { modal.style.display = 'none'; };
  modal.style.display = 'flex';
}

/* Helper upload that uses Firebase storage and returns downloadURL */
async function uploadFileToFirebase(product, file){
  if(!storage) throw new Error('Firebase Storage no inicializado');
  if(!auth) throw new Error('Firebase Auth no inicializado');
  const user = auth.currentUser;
  if(!user) {
    // try sign in silently? No — exigir login
    throw new Error('Debes iniciar sesión para subir imágenes');
  }
  const ext = (file.name.split('.').pop()||'jpg').toLowerCase();
  const name = `${String(product.Codigo||'no-code')}.${ext}`;
  const path = `productos/${name}`;
  const ref = storage.ref().child(path);
  const snap = await ref.put(file);
  const url = await snap.ref.getDownloadURL();
  return url;
}

/* Existing small handler (kept for compatibility) */
async function handleUpload(product, imgEl){
  // open modal with automatic file selection
  openImageModal(product, imgEl);
}

/* Save to Apps Script (POST) */
let saving = false;
async function saveToAppsScript(){
  if(saving) return;
  saving = true;
  btnSave.disabled = true;
  btnSave.textContent = 'Guardando...';
  try{
    const payload = { products: merged.map(p => ({
      Codigo: p.Codigo,
      Habilitado: !!p.Habilitado,
      Orden: p.Orden || 999999,
      Ranking: p.Ranking || 999999,
      ImagenURL: p.ImagenURL || '',
      Nombre: p.Nombre || '',
      Descripcion: p.Descripcion || '',
      Categoria: p.Categoria || '',
      SubCategoria: p.SubCategoria || '',
      Precio: p.Precio || 0,
      Proveedor: p.Proveedor || ''
    })) };

    const res = await fetch(APPS_URL, {
      method:'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)
    });

    if(!res.ok) throw new Error('POST '+res.status);
    const j = await res.json().catch(()=>({}));
    if(j.status==='saved' || j.status==='ok') { alert('Guardado OK'); markClean(); }
    else { console.log('Respuesta guardado', j); alert('Guardado completo'); markClean(); }
  }catch(err){ console.error(err); alert('Error guardando: '+(err.message||err)); }
  finally{ saving=false; btnSave.disabled=false; btnSave.textContent='Guardar cambios'; }
}

/* mark dirty / clean */
function markDirty(){ if(btnSave) btnSave.style.boxShadow = '0 0 0 6px rgba(6,182,212,0.12)'; }
function markClean(){ if(btnSave) btnSave.style.boxShadow = ''; }

/* Drag scroll render */
let updateScheduled = false;
viewport.addEventListener('scroll', () => {
  if(!updateScheduled){ updateScheduled = true; requestAnimationFrame(()=>{ updateSpacerAndRender(); updateScheduled=false; }); }
});

/* BOOT */
async function boot(){
  PRODUCTS_URL = (document.getElementById('url-products')?.value || DEFAULT_PRODUCTS_URL).trim();
  APPS_URL = (document.getElementById('url-appscript')?.value || DEFAULT_APPSCRIPT_URL).trim();
  try{
    // load products master from products.json (this is generated by your sync script)
    let prod = await fetchJsonSafe(PRODUCTS_URL);
    if(prod && prod.products) prod = prod.products;
    productsMaster = Array.isArray(prod) ? prod : [];

    // load config from apps script (app_products)
    cfgProducts = await fetchAppProducts(APPS_URL);

    mergeProducts();
    populateCategoryFilters();
    updateSpacerAndRender();
    markClean();
  }catch(err){
    console.error('boot error', err);
    alert('Error cargando datos: ' + err.message);
  }
}

/* Populate category/subcategory selects */
function populateCategoryFilters(){
  const cats = new Set();
  const subs = new Set();
  merged.forEach(p => { if(p.Categoria) cats.add(p.Categoria); if(p.SubCategoria) subs.add(p.SubCategoria); });
  // clear
  if(elFilterCategory){
    elFilterCategory.innerHTML = '<option value="">(Todas)</option>';
    Array.from(cats).sort().forEach(c => {
      const o = document.createElement('option'); o.value = c; o.textContent = c; elFilterCategory.appendChild(o);
    });
  }
  if(elFilterSubcategory){
    elFilterSubcategory.innerHTML = '<option value="">(Todas)</option>';
    Array.from(subs).sort().forEach(s => {
      const o = document.createElement('option'); o.value = s; o.textContent = s; elFilterSubcategory.appendChild(o);
    });
  }
}

/* Swap helper by product code (safer) */
function findIndexByCodigo(codigo){
  return merged.findIndex(m => String(m.Codigo) === String(codigo));
}

/* AUTH (Google signin) */
function setupAuth() {
  if(!auth) return;
  auth.onAuthStateChanged(user => {
    if(user){
      elAdminUser.textContent = user.email || user.displayName || user.uid;
      btnAuth.textContent = 'Cerrar sesión';
      btnAuth.onclick = () => auth.signOut();
    } else {
      elAdminUser.textContent = '';
      btnAuth.textContent = 'Iniciar sesión';
      btnAuth.onclick = () => {
        const provider = new firebase.auth.GoogleAuthProvider();
        auth.signInWithPopup(provider).catch(err => alert('Error login: ' + err.message));
      };
    }
  });
}

/* Trigger GitHub workflow (via Apps Script endpoint) */
async function triggerGithubWorkflow() {
  try {
    // Prefer using an Apps Script endpoint that does the actual GitHub call with token stored server-side.
    const triggerUrl = APPS_URL + '?triggerWorkflow=1'; // tu Apps Script debe chequear e.g. e.parameter.triggerWorkflow
    const res = await fetch(triggerUrl, { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'trigger', secret: '' }) });
    if(!res.ok) throw new Error('Trigger error ' + res.status);
    const j = await res.json();
    if(j.status === 'ok') alert('Workflow disparado OK');
    else alert('Trigger completo: ' + JSON.stringify(j));
  } catch(err) {
    console.error(err);
    alert('Error disparando workflow: ' + (err.message||err));
  }
}
const lazyObserver = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const img = entry.target;
      img.src = img.dataset.src;
      lazyObserver.unobserve(img);
    }
  });
});

function observeLazyImages() {
  document.querySelectorAll("img[data-src]").forEach(img => {
    lazyObserver.observe(img);
  });
}
document.getElementById("btn-load-more").addEventListener("click", () => {
  renderLimit += batchSize;
  updateSpacerAndRender();
});

/* Event wiring */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-load')?.addEventListener('click', boot);
  document.getElementById('btn-save')?.addEventListener('click', saveToAppsScript);
  document.getElementById('search')?.addEventListener('input', () => updateSpacerAndRender());
  document.getElementById('only-enabled')?.addEventListener('change', () => updateSpacerAndRender());
  document.getElementById('sort-by')?.addEventListener('change', () => updateSpacerAndRender());
  elFilterCategory?.addEventListener('change', () => updateSpacerAndRender());
  elFilterSubcategory?.addEventListener('change', () => updateSpacerAndRender());

  btnGithubSync?.addEventListener('click', () => {
    if(confirm('¿Disparar workflow de GitHub para regenerar products.json?')) triggerGithubWorkflow();
  });

  // auth
  setupAuth();

  // modal close click outside
  document.getElementById('image-modal')?.addEventListener('click', (ev) => {
    if(ev.target && ev.target.id === 'image-modal') ev.target.style.display = 'none';
  });

  // initial boot
  boot();
});
