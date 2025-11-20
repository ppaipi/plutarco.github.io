// panel_admin.js - mezcla products.json + app_products, guarda a Apps Script y sube imágenes a Firebase Storage

/* ========== CONFIG: ajusta si necesario ========== */
const LOCAL_PRODUCTS_FALLBACK = "/mnt/data/panel.html"; // fallback local path (el entorno puede transformarlo)
const DEFAULT_PRODUCTS_URL = "/products.json"; // cambia si tu URL es distinta
const DEFAULT_APPSCRIPT_URL = document.getElementById('url-appscript')?.value || ""; // se lee del input

// Firebase v8 config (usa la tuya)
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCGuA_RkvEUptmUHO4YOAzr9qRKtK1cNDQ",
  authDomain: "plutarcodelivery-cf6cb.firebaseapp.com",
  projectId: "plutarcodelivery-cf6cb",
  storageBucket: "plutarcodelivery-cf6cb.appspot.com",
  messagingSenderId: "714627263776",
  appId: "1:714627263776:web:3ee0e4fc657a6c12e37b45"
};

if (!window.firebase || !firebase.initializeApp) {
  console.error("Firebase SDK v8 missing. Include firebase-app.js & firebase-storage.js");
}
try { firebase.initializeApp(FIREBASE_CONFIG); } catch(e){ console.warn("Firebase init:", e && e.message); }
const storage = firebase.storage();

/* ========== Estado ========== */
let productsMaster = []; // desde products.json
let cfgProducts = []; // desde app_products (sheet)
let merged = []; // merge de ambos
let APPS_SCRIPT_URL = DEFAULT_APPSCRIPT_URL;

/* ========== Utils ========== */
const $ = s => document.querySelector(s);
const showToast = (m, t='info') => { console.log('[toast]',m); /* podes mejorar visual */ };
function toBool(v){ if(v===true||v==='true'||v===1||v==='1')return true; if(typeof v==='string'){const s=v.trim().toLowerCase(); return ['true','t','si','sí','yes','1'].includes(s);} return false; }
function parsePrecio(v){ if(!v) return 0; return Number(String(v).replace(/[^\d\.\,]/g,'').replace(',','.'))||0; }

/* ========== Fetchers ========== */
async function fetchProductsJSON(url){
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if(!res.ok) throw new Error('products.json HTTP ' + res.status);
    const j = await res.json();
    // algunos repos devuelven { products: [...] } o el array directamente
    return Array.isArray(j) ? j : (j.products || []);
  } catch (err) {
    console.warn('fetchProductsJSON error', err.message);
    // intentar fallback local
    try {
      const res2 = await fetch(LOCAL_PRODUCTS_FALLBACK, { cache: 'no-store' });
      if(res2.ok){ const t = await res2.text(); try{ return JSON.parse(t); }catch(e){} }
    } catch(e){}
    throw err;
  }
}

async function fetchAppProducts(url){
  try {
    const r = await fetch(url, { cache: 'no-store' });
    if(!r.ok) throw new Error('apps script GET ' + r.status);
    const j = await r.json();
    if(j.status === 'ok' && Array.isArray(j.products)) return j.products;
    // si el endpoint devuelve el objeto con products: [...]
    if(Array.isArray(j)) return j;
    return [];
  } catch (err){
    console.warn('fetchAppProducts error', err.message);
    // devolver vacío pero no romper
    return [];
  }
}

/* ========== Merge lógica ========== */
function normalizeServerProduct(p){
  return {
    Codigo: String(p.Codigo || p.ID || p['CODIGO BARRA'] || '').trim(),
    Nombre: p.Nombre || p['DESCRIPCION LARGA'] || p['DESCRIPCION'] || '',
    Descripcion: p.Descripcion || p['DESCRIPCION ADICIONAL'] || '',
    Categoria: p.Categoria || p['RUBRO'] || '',
    SubCategoria: p.SubCategoria || p['SUBRUBRO'] || '',
    Precio: Number(p.Precio || p['PRECIO VENTA C/IVA'] || 0) || 0,
    Proveedor: p.Proveedor || '',
    ImagenURL: p.ImagenURL || `/media/PRODUCTOS/${String(p.Codigo||p.ID||'').trim()}.jpg`,
    Habilitado: toBool(p.Habilitado),
    Orden: Number(p.Orden || 999999) || 999999,
    Ranking: Number(p.Ranking || 999999) || 999999
  };
}

function mergeProducts(){
  // map cfgProducts por codigo para rapidez
  const map = {};
  cfgProducts.forEach(c => {
    if(!c || !c.Codigo) return;
    map[String(c.Codigo).trim()] = c;
  });

  merged = productsMaster.map(pm => {
    const code = String(pm.Codigo || pm.ID || pm['CODIGO BARRA'] || '').trim();
    const base = normalizeServerProduct(pm);
    const cfg = map[code] || {};
    return {
      ...base,
      Habilitado: (typeof cfg.Habilitado !== 'undefined') ? toBool(cfg.Habilitado) : base.Habilitado,
      Orden: Number(cfg.Orden || cfg.Ranking || base.Orden) || base.Orden,
      Ranking: Number(cfg.Ranking || base.Ranking) || base.Ranking,
      ImagenURL: (cfg.ImagenURL && String(cfg.ImagenURL).startsWith('http')) ? cfg.ImagenURL : base.ImagenURL
    };
  });
}

/* ========== Render ========== */
function renderList() {
  const q = ($('#search')?.value || '').trim().toLowerCase();
  const onlyEnabled = $('#only-enabled')?.checked;
  const sortBy = $('#sort-by')?.value || 'orden';
  let arr = merged.slice();

  if (q) arr = arr.filter(p => (String(p.Codigo)+p.Nombre+(p.Proveedor||'')).toLowerCase().includes(q));
  if (onlyEnabled) arr = arr.filter(p => p.Habilitado);

  if (sortBy === 'orden') arr.sort((a,b) => (Number(a.Orden||999999) - Number(b.Orden||999999)));
  if (sortBy === 'nombre') arr.sort((a,b) => String(a.Nombre||'').localeCompare(String(b.Nombre||'')));
  if (sortBy === 'precio') arr.sort((a,b) => Number(a.Precio||0) - Number(b.Precio||0));

  const cont = $('#results'); cont.innerHTML = '';
  arr.forEach(p => {
    const el = document.createElement('div'); el.className='card';
    el.innerHTML = `
      <img class="thumb" src="${p.ImagenURL||'/media/no-image.png'}" onerror="this.src='/media/no-image.png'"/>
      <div class="meta"><div class="name">${p.Nombre||''}</div><div class="code">${p.Codigo} • ${p.Categoria||''}</div></div>
      <div class="controls-row">
        <label><input type="checkbox" class="toggle-hab" ${p.Habilitado ? 'checked' : ''}/> Habilitado</label>
        <div><label>Orden</label><input type="number" class="input-orden" value="${p.Orden===999999?'':p.Orden}" style="width:90px"/></div>
        <div><label>Ranking</label><input type="number" class="input-ranking" value="${p.Ranking===999999?'':p.Ranking}" style="width:90px"/></div>
        <div><button class="btn-photo">Subir foto</button></div>
      </div>
    `;
    // handlers
    const cb = el.querySelector('.toggle-hab');
    const inpOrden = el.querySelector('.input-orden');
    const inpRanking = el.querySelector('.input-ranking');
    const btnPhoto = el.querySelector('.btn-photo');
    cb.addEventListener('change', () => { p.Habilitado = !!cb.checked; markDirty(); renderStats(); });
    inpOrden.addEventListener('change', () => { p.Orden = Number(inpOrden.value) || 999999; markDirty(); });
    inpRanking.addEventListener('change', () => { p.Ranking = Number(inpRanking.value) || 999999; p.Orden = p.Ranking; markDirty(); });
    btnPhoto.addEventListener('click', () => handleUpload(p, el.querySelector('img.thumb')));

    cont.appendChild(el);
  });

  renderStats();
}

function renderStats(){
  const total = merged.length;
  const hab = merged.filter(x=>x.Habilitado).length;
  $('#stats').textContent = `${hab} habilitados / ${total} productos`;
}

/* ========== Upload imagen ========== */
async function handleUpload(product, imgEl){
  // crea input file invisible
  const input = document.createElement('input'); input.type='file'; input.accept='image/*';
  input.onchange = async (ev) => {
    const file = ev.target.files[0]; if(!file) return;
    const ext = (file.name.split('.').pop()||'jpg').toLowerCase();
    const name = `${String(product.Codigo||'no-code')}.${ext}`;
    const path = `productos/${name}`;
    try {
      showToast('Subiendo imagen...', 'info');
      const ref = storage.ref().child(path);
      const snap = await ref.put(file);
      const url = await snap.ref.getDownloadURL();
      product.ImagenURL = url;
      imgEl.src = url;
      markDirty();
      showToast('Imagen subida', 'success');
    } catch (err) {
      console.error('upload error', err);
      alert('Error subiendo imagen: ' + (err.message||err));
    }
  };
  document.body.appendChild(input);
  input.click();
  input.remove();
}

/* ========== Guardar a Apps Script (doPost) ========== */
let saving = false;
async function saveToAppsScript(){
  if(saving) return;
  const btn = $('#btn-save'); if(btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
  saving = true;
  try {
    // enviar solo la porción de cfg (Codigo, Habilitado, Orden, Ranking, ImagenURL, Nombre, Proveedor, Precio)
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

    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });
    if(!res.ok) throw new Error('POST HTTP ' + res.status);
    const json = await res.json().catch(()=>({}));
    if(json.status === 'saved' || json.status === 'ok') {
      showToast('Guardado OK', 'success');
    } else {
      showToast('Guardado ok (revisar respuesta)', 'info');
      console.log('save response', json);
    }
  } catch (err) {
    console.error('save error', err);
    alert('Error guardando: ' + (err.message||err));
  } finally {
    saving = false;
    if(btn){ btn.disabled = false; btn.textContent = 'Guardar cambios'; }
  }
}

/* ========== Boot / UI wiring ========== */
function markDirty(){ const b = $('#btn-save'); if(b) b.style.boxShadow = '0 0 0 4px rgba(13,110,253,0.12)'; }

async function loadAll(){
  try {
    const urlP = ($('#url-products')?.value || DEFAULT_PRODUCTS_URL).trim();
    APPS_SCRIPT_URL = ($('#url-appscript')?.value || APPS_SCRIPT_URL).trim() || APPS_SCRIPT_URL;

    showToast('Cargando products.json...', 'info');
    productsMaster = await fetchProductsJSON(urlP);
    showToast('Cargando app_products desde Apps Script...', 'info');
    cfgProducts = await fetchAppProducts(APPS_SCRIPT_URL);

    // normalize and merge
    productsMaster = productsMaster.map(normalizeServerProduct);
    cfgProducts = cfgProducts.map(p => ({ ...p })); // ya vienen en formato de tu sheet
    mergeProducts();
    renderList();
  } catch (err){
    alert('Error cargando datos: ' + (err.message||err));
    console.error(err);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  $('#btn-load').addEventListener('click', loadAll);
  $('#btn-save').addEventListener('click', saveToAppsScript);
  $('#search').addEventListener('input', () => renderList());
  $('#only-enabled').addEventListener('change', () => renderList());
  $('#sort-by').addEventListener('change', () => renderList());
  $('#btn-load').click();
});
