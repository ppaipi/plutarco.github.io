/* admin.js - Panel admin */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCGuA_RkvEUptmUHO4YOAzr9qRKtK1cNDQ",
  authDomain: "plutarcodelivery-cf6cb.firebaseapp.com",
  projectId: "plutarcodelivery-cf6cb",
  storageBucket: "plutarcodelivery-cf6cb.firebasestorage.app",
  messagingSenderId: "714627263776",
  appId: "1:714627263776:web:3ee0e4fc657a6c12e37b45"
};

const APPS_SCRIPT_URL = "https://script.google.com/macros/library/d/10I9imZNxxOSJMmDmL5yfE02q5Xq0t9mmNNxitCMqTg02u7p1GQHt_GJk/2"; // <- reemplazá

// Init firebase (compat)
firebase.initializeApp(FIREBASE_CONFIG);
const storage = firebase.storage();

let allProducts = []; // array de objetos
let currentPage = 1;
let pageSize = 50;

// Helpers
function parsePrecio(v){
  if(v == null) return 0;
  // remover no-digitos, coma decimal
  return Number(String(v).replace(/[^\d\.\,]/g,'').replace(',','.')) || 0;
}

// --- File import (XLSX) ---
document.getElementById('excel-input').addEventListener('change', e => {
  const f = e.target.files[0];
  if(!f) return;
  const reader = new FileReader();
  reader.onload = evt => {
    const data = new Uint8Array(evt.target.result);
    const wb = XLSX.read(data, {type:'array'});
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json(sheet, {defval: ''});
    // map to structure
    allProducts = json.map(row => ({
      Codigo: (row["CODIGO BARRA"] || "").toString().trim(),
      Nombre: row["DESCRIPCION LARGA"] || (row["DESCRIPCION"]||""),
      Descripcion: row["DESCRIPCION ADICIONAL"] || "",
      Categoria: row["RUBRO"] || "",
      SubCategoria: row["SUBRUBRO"] || "",
      Precio: parsePrecio(row["PRECIO VENTA C/IVA"]),
      Proveedor: row["PROVEEDOR"] || "",
      Habilitado: false,
      Orden: 999999,
      ImagenURL: `/media/PRODUCTOS/${(row["CODIGO BARRA"]||"").toString().trim()}.jpg`
    }));
    // try to merge habilitados/ranking if you already loaded them (we'll provide buttons for that later)
    currentPage = 1;
    renderPage();
  };
  reader.readAsArrayBuffer(f);
});

// ---- sample import button (para pruebas) ----
document.getElementById('btn-import-sample').addEventListener('click', ()=> {
  // carga demo: usa primeros 50 si hay muchos
  if(allProducts.length === 0){
    alert('Primero cargá el Excel');
    return;
  }
  renderPage();
});

// --- Search / page size ---
document.getElementById('search').addEventListener('input', ()=> { currentPage = 1; renderPage(); });
document.getElementById('page-size').addEventListener('change', (e)=>{ pageSize = Number(e.target.value); currentPage = 1; renderPage(); });

// --- renderPage: filtra y paginación ---
function renderPage(){
  const q = document.getElementById('search').value.trim().toLowerCase();
  let filtered = allProducts.filter(p => {
    if(!q) return true;
    return (p.Codigo||'').toLowerCase().includes(q) ||
      (p.Nombre||'').toLowerCase().includes(q) ||
      (p.Proveedor||'').toLowerCase().includes(q);
  });

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if(currentPage > pages) currentPage = pages;
  const start = (currentPage-1)*pageSize;
  const pageItems = filtered.slice(start, start+pageSize);

  const cont = document.getElementById('results');
  cont.innerHTML = '';
  const tpl = document.getElementById('row-tpl');

  pageItems.forEach((p, idx) => {
    const node = tpl.content.cloneNode(true);
    const row = node.querySelector('.product-row');
    row.querySelector('img.thumb').src = p.ImagenURL || '/media/no-image.png';
    row.querySelector('.codigo').textContent = p.Codigo || '(sin código)';
    row.querySelector('.nombre').textContent = p.Nombre || '';
    row.querySelector('.proveedor').textContent = p.Proveedor || '';
    row.querySelector('.precio').textContent = p.Precio ? `$ ${p.Precio}` : '';
    const habil = row.querySelector('.habilitado');
    habil.checked = !!p.Habilitado;
    habil.addEventListener('change', (e)=> { p.Habilitado = e.target.checked; });

    const ordenInput = row.querySelector('.orden');
    ordenInput.value = p.Orden === 999999 ? '' : p.Orden;
    ordenInput.addEventListener('change', (e)=> { p.Orden = Number(e.target.value) || 999999; });

    // subir foto
    row.querySelector('.btn-photo').addEventListener('click', ()=> {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = (ev) => {
        const file = ev.target.files[0];
        if(!file) return;
        // name product by Codigo.jpg to keep compatibility
        const name = (p.Codigo || 'no-code') + (file.name.includes('.') ? '' : '.jpg');
        const ref = storage.ref().child(`productos/${name}`);
        const upTask = ref.put(file);
        upTask.then(snapshot => snapshot.ref.getDownloadURL()).then(url => {
          p.ImagenURL = url;
          row.querySelector('img.thumb').src = url;
          alert('Imagen subida y asociada al producto');
        }).catch(err => { console.error(err); alert('Error al subir imagen: '+err.message); });
      };
      input.click();
    });

    cont.appendChild(node);
  });

  // pager
  const pager = document.getElementById('pager');
  pager.innerHTML = `Página ${currentPage} / ${pages} — ${total} resultados`;
  // simple prev/next
  const prev = document.createElement('button'); prev.textContent = '◀ Prev'; prev.disabled = currentPage===1;
  prev.onclick = ()=>{ currentPage--; renderPage(); };
  const next = document.createElement('button'); next.textContent = 'Next ▶'; next.disabled = currentPage===pages;
  next.onclick = ()=>{ currentPage++; renderPage(); };
  pager.appendChild(prev);
  pager.appendChild(next);
}

// --- Save: enviar al Apps Script ---
document.getElementById('btn-save').addEventListener('click', async ()=> {
  if(!APPS_SCRIPT_URL || APPS_SCRIPT_URL.includes('TU_URL')) { alert('Poné la URL del Apps Script en admin.js'); return; }

  // sort por orden (poner 999999 al final)
  // mandar max 5000 filas OK (sheet lo aguanta)
  const payload = { products: allProducts };
  try {
    const res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    alert('Guardado en Sheets: ' + JSON.stringify(data));
  } catch (err) {
    alert('Error guardando: '+err.message);
    console.error(err);
  }
});

// --- Download habilitados.json: lee desde Sheets via apps script GET (extra)
document.getElementById('btn-download-hab').addEventListener('click', async ()=> {
  if(!APPS_SCRIPT_URL) return alert('Configurá APPS_SCRIPT_URL');
  // we assume AppScript exposes a way to get Habilitados sheet via doGet?action=getHabilitados (not yet implemented)
  // fallback: download Products and build habilitados locally
  const r = await fetch(APPS_SCRIPT_URL + '?action=getProducts');
  const products = await r.json();
  const hab = products.filter(p => (p.Habilitado === 'TRUE' || p.Habilitado === true || p.Habilitado === 'true')).map(p => p.Codigo);
  const blob = new Blob([JSON.stringify(hab, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'habilitados.json'; a.click();
});

// Optional: For triggering GitHub Action via its API (requires PAT) - NOT included by default
document.getElementById('btn-trigger-sync').addEventListener('click', ()=> {
  alert('Para forzar sync desde el admin al workflow, usaré una llamada a la API de GitHub con un token (no incluido por defecto). Podemos integrarlo si querés.');
});
