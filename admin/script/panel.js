/* panel_admin.js
   Virtualized admin list: only render visible items (windowing).
   Requirements: panel_admin.css + Firebase v8 scripts included in HTML.
*/

const FALLBACK_LOCAL_PATH = "/mnt/data/panel.js"; // tu path local (lo transforma el entorno)
const DEFAULT_PRODUCTS_URL = "/products.json";
const DEFAULT_APPSCRIPT_URL = "https://script.google.com/macros/s/AKfycbzYuRooT4gimgVgM9QPP9HlsEacR0Ip2IHjZc5QgKeelAojQaaZdQLyG9viFvvLtjzu/exec";

/* Firebase config (igual que antes) */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCGuA_RkvEUptmUHO4YOAzr9qRKtK1cNDQ",
  authDomain: "plutarcodelivery-cf6cb.firebaseapp.com",
  projectId: "plutarcodelivery-cf6cb",
  storageBucket: "plutarcodelivery-cf6cb.appspot.com",
  messagingSenderId: "714627263776",
  appId: "1:714627263776:web:3ee0e4fc657a6c12e37b45"
};

if(window.firebase && firebase.initializeApp){
  try{ firebase.initializeApp(FIREBASE_CONFIG); }catch(e){}
}
const storage = (window.firebase && firebase.storage) ? firebase.storage() : null;

/* STATE */
let productsMaster = [];   // raw from products.json
let cfgProducts = [];      // from app_products
let merged = [];           // merged items
let APPS_URL = DEFAULT_APPSCRIPT_URL;
let PRODUCTS_URL = DEFAULT_PRODUCTS_URL;

/* Virtualization params */
const ITEM_HEIGHT = 116;  // px, approx card height + gap
const BUFFER = 20;        // number of extra items above/below viewport
const PAGE_SIZE = 50;     // not used for loading but useful for UI

/* Simple helpers */
const $ = s => document.querySelector(s);
const create = (tag, attrs={}) => { const e=document.createElement(tag); Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v)); return e; };
const toBool = v => (v===true||v==='true'||v===1||v==='1');

/* UI elements (must exist in HTML) */
const elProductsUrl = document.getElementById('url-products');
const elAppsUrl = document.getElementById('url-appscript');
const btnLoad = document.getElementById('btn-load');
const btnSave = document.getElementById('btn-save');
const elSearch = document.getElementById('search');
const elOnlyEnabled = document.getElementById('only-enabled');
const elSort = document.getElementById('sort-by');
const elStats = document.getElementById('stats');
const containerViewport = null; // will create below

/* Build main viewport dynamically in DOM if not present */
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
      results.classList.add('inner-list'); // not visible directly
      results.style.position = 'absolute'; // inner-list will be unused: we'll render into spacer absolute positions
      results.style.top = '0';
      results.style.left = '0';
    } else {
      // create results container
      const newRes = create('div'); newRes.id='results'; newRes.className='inner-list'; newRes.style.position='absolute';
      wrapper.appendChild(newRes);
      document.querySelector('.wrap').appendChild(wrapper);
    }
    v = document.querySelector('.list-viewport');
  }
})();

/* pointers to elements created */
const viewport = document.querySelector('.list-viewport');
const innerSpacer = viewport.querySelector('.inner-spacer');
const resultsRoot = viewport.querySelector('.inner-list');

/* Virtual render state */
let visibleStart = 0, visibleEnd = 0;

/* Fetch helpers */
async function fetchJsonSafe(url){
  try{
    const r = await fetch(url, {cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    return await r.json();
  }catch(err){
    // try fallback local path if exists
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

/* Merge logic */
function mergeProducts(){
  const map = new Map();
  cfgProducts.forEach(c => map.set(String(c.Codigo).trim(), c));

  merged = productsMaster.map(p => {
    const code = String(p.Codigo || p.ID || p['CODIGO BARRA'] || '').trim();
    const base = {
      Codigo: code,
      Nombre: p.Nombre || p['DESCRIPCION LARGA'] || p['DESCRIPCION'] || '',
      Categoria: p.Categoria || p['RUBRO'] || '',
      Proveedor: p.Proveedor || '',
      Precio: Number(p.Precio || p['PRECIO VENTA C/IVA'] || 0) || 0,
      ImagenURL: p.ImagenURL || `/media/PRODUCTOS/${code}.jpg`
    };
    const cfg = map.get(code) || {};
    return {
      ...base,
      Habilitado: (typeof cfg.Habilitado !== 'undefined') ? toBool(cfg.Habilitado) : false,
      Orden: Number(cfg.Orden || cfg.Ranking || 999999) || 999999,
      Ranking: Number(cfg.Ranking || 999999) || 999999,
      ImagenURL: (cfg.ImagenURL && String(cfg.ImagenURL).startsWith('http')) ? cfg.ImagenURL : base.ImagenURL
    };
  });
}

/* Filtering and sorting (returns indices array for items matching) */
function filteredIndices(){
  const q = (elSearch?.value || '').trim().toLowerCase();
  const only = elOnlyEnabled?.checked;
  let arr = merged.map((_,i)=>i);

  if(q){
    arr = arr.filter(i => {
      const p = merged[i];
      return ((p.Codigo + ' ' + p.Nombre + ' ' + (p.Proveedor||'')).toLowerCase().indexOf(q) !== -1);
    });
  }
  if(only) arr = arr.filter(i => merged[i].Habilitado);
  const sortBy = elSort?.value || 'orden';
  arr.sort((a,b)=>{
    const A = merged[a], B = merged[b];
    if(sortBy === 'orden') return (A.Orden||999999) - (B.Orden||999999);
    if(sortBy === 'nombre') return (A.Nombre||'').localeCompare(B.Nombre||'');
    if(sortBy === 'precio') return (A.Precio||0) - (B.Precio||0);
    return 0;
  });
  return arr;
}

/* Virtual render: given indices array, compute height and visible range */
function updateSpacerAndRender(){
  const indices = filteredIndices();
  const total = indices.length;
  innerSpacer.style.height = (total * ITEM_HEIGHT) + 'px';

  // compute visible start index based on scrollTop
  const scrollTop = viewport.scrollTop;
  const vpHeight = viewport.clientHeight;
  const firstVisible = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - BUFFER);
  const visibleCount = Math.ceil(vpHeight / ITEM_HEIGHT) + BUFFER*2;
  const lastVisible = Math.min(total-1, firstVisible + visibleCount - 1);

  visibleStart = firstVisible;
  visibleEnd = lastVisible;

  // clear and render only visibleStart..visibleEnd
  resultsRoot.innerHTML = '';
  for(let slot = visibleStart; slot <= visibleEnd; slot++){
    const globalIndex = indices[slot];
    const y = slot * ITEM_HEIGHT;
    const p = merged[globalIndex];
    const node = renderCardAbsolute(p, y, slot);
    resultsRoot.appendChild(node);
  }

  // update stats
  elStats.textContent = `${total} items — mostrando ${visibleEnd - visibleStart + 1}`;
}

/* Render a single card positioned absolutely at y */
function renderCardAbsolute(p, y, slot){
  const el = document.createElement('div');
  el.className = 'card';
  el.style.top = y + 'px';
  el.style.height = (ITEM_HEIGHT - 10) + 'px';

  // inner HTML (compact)
  el.innerHTML = `
    <img class="thumb" src="${p.ImagenURL}" onerror="this.src='/media/no-image.png'">
    <div class="meta">
      <div class="name">${escapeHtml(p.Nombre)}</div>
      <div class="desc">${escapeHtml(p.Descripcion || '')}</div>
      <div class="code">${escapeHtml(p.Codigo)} • ${escapeHtml(p.Categoria || '')}</div>
    </div>
    <div class="controls-right">
      <label><input type="checkbox" class="toggle-hab" ${p.Habilitado ? 'checked' : ''}/> Habilitado</label>
      <label>Orden <input type="number" class="inp-orden" value="${p.Orden===999999?'':p.Orden}"></label>
      <label>Ranking <input type="number" class="inp-rank" value="${p.Ranking===999999?'':p.Ranking}"></label>
      <div style="display:flex;gap:6px">
        <button class="btn btn-ghost btn-photo">Imagen</button>
      </div>
    </div>
  `;

  // wire events
  const cb = el.querySelector('.toggle-hab');
  const inpOrden = el.querySelector('.inp-orden');
  const inpRank = el.querySelector('.inp-rank');
  const btnPhoto = el.querySelector('.btn-photo');

  cb.addEventListener('change', () => { p.Habilitado = cb.checked; markDirty(); });
  inpOrden.addEventListener('change', () => { p.Orden = Number(inpOrden.value) || 999999; markDirty(); });
  inpRank.addEventListener('change', () => { p.Ranking = Number(inpRank.value) || 999999; p.Orden = p.Ranking; markDirty(); });
  btnPhoto.addEventListener('click', () => handleUpload(p, el.querySelector('.thumb')));

  return el;
}

/* small util */
function escapeHtml(s){ if(!s) return ''; return String(s).replace(/[&<>"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }

/* Upload handler (firebase) */
async function handleUpload(product, imgEl){
  if(!storage) { alert('Firebase Storage no inicializado'); return; }
  const input = document.createElement('input'); input.type='file'; input.accept='image/*';
  input.onchange = async (ev) => {
    const file = ev.target.files[0]; if(!file) return;
    const ext = (file.name.split('.').pop()||'jpg').toLowerCase();
    const name = `${String(product.Codigo||'no-code')}.${ext}`;
    const path = `productos/${name}`;
    try{
      const ref = storage.ref().child(path);
      const snap = await ref.put(file);
      const url = await snap.ref.getDownloadURL();
      product.ImagenURL = url;
      imgEl.src = url;
      markDirty();
    }catch(err){ console.error(err); alert('Error subiendo imagen: '+err.message); }
  };
  document.body.appendChild(input);
  input.click();
  input.remove();
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

/* Event wiring for viewport scroll */
let updateScheduled = false;
viewport.addEventListener('scroll', () => {
  if(!updateScheduled){ updateScheduled = true; requestAnimationFrame(()=>{ updateSpacerAndRender(); updateScheduled=false; }); }
});

/* Boot: load data and init */
async function boot(){
  PRODUCTS_URL = (document.getElementById('url-products')?.value || DEFAULT_PRODUCTS_URL).trim();
  APPS_URL = (document.getElementById('url-appscript')?.value || DEFAULT_APPSCRIPT_URL).trim();
  try{
    // load products master
    let prod = await fetchJsonSafe(PRODUCTS_URL);
    if(prod && prod.products) prod = prod.products;
    productsMaster = Array.isArray(prod) ? prod : [];
    // load config from apps script
    cfgProducts = await fetchAppProducts(APPS_URL);
    mergeProducts();
    updateSpacerAndRender();
    markClean();
  }catch(err){
    console.error('boot error', err);
    alert('Error cargando datos: ' + err.message);
  }
}

/* controls wiring */
document.addEventListener('DOMContentLoaded', () => {
  // wire buttons (exist in your HTML)
  document.getElementById('btn-load')?.addEventListener('click', boot);
  document.getElementById('btn-save')?.addEventListener('click', saveToAppsScript);
  document.getElementById('search')?.addEventListener('input', () => { updateSpacerAndRender(); });
  document.getElementById('only-enabled')?.addEventListener('change', () => updateSpacerAndRender());
  document.getElementById('sort-by')?.addEventListener('change', () => updateSpacerAndRender());

  // initial boot
  boot();
});
