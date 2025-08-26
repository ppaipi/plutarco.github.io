let products = [];
let cart = {};
let filteredProducts = [];
let currentSearch = '';

// --- Cargar productos ---
async function loadProducts() {
  // URL del Google Sheets publicado como CSV
  const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQYR7RFTwXoTMLKy7-jq3D0RUrNpqrMfFBmGh-UmSYhEnVnvxkcZKCB4VLeRg58jw/pub?output=csv";

  try {
    // Evita cacheo con ?cacheBust
    const response = await fetch(SHEET_URL + "&cacheBust=" + Date.now(), { cache: "no-store" });
    if (!response.ok) throw new Error("Error al cargar los productos");

    const csvText = await response.text();

    // Parsear CSV a objetos
    products = parseCSV(csvText);

    // Asegurar copia independiente
    filteredProducts = [...products];

    // Renderizar
    renderProducts(filteredProducts);

    // Subir al header
    const header = document.querySelector('header');
    if (header) {
      header.scrollIntoView({ behavior: 'smooth' });
    }
  } catch (error) {
    console.error("No se pudieron cargar los productos:", error);
    alert("Hubo un problema al cargar los productos. Intenta más tarde.");
  }
}



function cerrarModalDescripcion() {
  const modal = document.getElementById('modal-descripcion');
  if (!modal) return;
  const content = modal.querySelector('.modal-content');
  if (content) {
    content.classList.remove('modal-content-anim');
    content.classList.add('modal-content-anim-close');
    setTimeout(() => {
      modal.remove();
    }, 180);
  } else {
    modal.remove();
  }
}

function mostrarDescripcionProducto(prod) {
  crearModalDescripcion(prod);
}

// Todo el div del producto abre el modal
function createProductCard(prod) {
  const div = document.createElement('div');
  div.className = 'product';
  div.setAttribute('data-codigo', prod.Codigo);

  const cantidad = cart[prod.Codigo] || 0;
  let controles;

  if (cantidad > 0) {
    controles = document.createElement('div');
    controles.className = 'quantity-controls';

    const btnMenos = document.createElement('button');
    btnMenos.textContent = '-';
    btnMenos.onclick = (e) => {
      e.stopPropagation();
      updateQuantity(prod.Codigo, -1);
    };

    const spanCantidad = document.createElement('span');
    spanCantidad.textContent = cantidad;

    const btnMas = document.createElement('button');
    btnMas.textContent = '+';
    btnMas.onclick = (e) => {
      e.stopPropagation();
      updateQuantity(prod.Codigo, 1);
    };

    controles.appendChild(btnMenos);
    controles.appendChild(spanCantidad);
    controles.appendChild(btnMas);
  } else {
    controles = document.createElement('button');
    controles.textContent = 'Agregar';
    controles.onclick = (e) => {
      e.stopPropagation();
      addToCart(prod.Codigo);
    };
  }

  div.innerHTML = `
    <img 
      src="../media/PRODUCTOS/${prod.Codigo}.jpeg" 
      alt="${prod.Nombre}" 
      loading="lazy"
      style="object-fit: cover;"
      onerror="this.onerror=null; this.src=this.src.replace('.jpeg', '.jpg'); this.onerror=function(){ this.src='../media/PRODUCTOS/placeholder.jpeg'; }"
    >
    <h3>${prod.Nombre}</h3>
    <p>$${prod.Precio}</p>
  `;

  // Solo abre el modal si el click no es sobre un botón
  div.onclick = (e) => {
    if (
      e.target.tagName !== 'BUTTON' &&
      !(e.target.closest && e.target.closest('button'))
    ) {
      mostrarDescripcionProducto(prod);
    }
  };

  div.appendChild(controles);
  return div;
}

function parseCSV(csvText) {
  const lines = csvText.trim().split(/\r?\n/);

  // Usar coma como separador y respetar valores entre comillas
  const parseLine = (line) => {
    const regex = /(".*?"|[^",]+)(?=\s*,|\s*$)/g;
    const result = [];
    let match;
    while ((match = regex.exec(line)) !== null) {
      let val = match[1].trim();

      // Quitar comillas alrededor si existen
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      }

      // Reemplazar coma decimal por punto (para parseFloat)
      if (/^\d+,\d+$/.test(val)) {
        val = val.replace(',', '.');
      }

      result.push(val);
    }
    return result;
  };

  const headers = parseLine(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => {
      const key = h.trim();
      let val = values[i] || '';
      if (key === 'Codigo') val = String(val);
      else if (key === 'Precio' || key === 'Costo' || key === 'Stock') val = parseFloat(val) || 0;
      obj[key] = val;
    });
    return obj;
  });
}


// Renderiza todos los productos (sin categorías ni paginación)
function renderProducts(productos) {
  const container = document.getElementById('product-list');
  container.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'product-grid';

  productos.forEach(prod => grid.appendChild(createProductCard(prod)));

  container.appendChild(grid);
}

// Buscador simple
function searchProduct() {
  const term = document.getElementById('search-input').value.toLowerCase().trim();
  currentSearch = term;

  if (!term) {
    filteredProducts = [...products];
    renderProducts(filteredProducts);
    return;
  }

  filteredProducts = products.filter(p => p.Nombre.toLowerCase().includes(term));
  renderProducts(filteredProducts);
}

function addToCart(codigo) {
  cart[codigo] = (cart[codigo] || 0) + 1;
  updateProductCard(codigo);
  updateCart();
  animateCart();
}

function updateProductCard(codigo) {
  const card = document.querySelector(`[data-codigo="${codigo}"]`);
  if (!card) return;

  const cantidad = cart[codigo] || 0;

  if (cantidad === 0) {
    const controles = card.querySelector('.quantity-controls');
    if (controles) {
      const btnAgregar = document.createElement('button');
      btnAgregar.textContent = 'Agregar';
      btnAgregar.onclick = () => addToCart(codigo);
      controles.replaceWith(btnAgregar);
    }
  } else {
    const controles = card.querySelector('.quantity-controls');
    if (controles) {
      controles.querySelector('span').textContent = cantidad;
    } else {
      const oldButton = card.querySelector('button');
      const newControls = document.createElement('div');
      newControls.className = 'quantity-controls';

      const btnMenos = document.createElement('button');
      btnMenos.textContent = '-';
      btnMenos.onclick = () => updateQuantity(codigo, -1);

      const span = document.createElement('span');
      span.textContent = cantidad;

      const btnMas = document.createElement('button');
      btnMas.textContent = '+';
      btnMas.onclick = () => updateQuantity(codigo, 1);

      newControls.appendChild(btnMenos);
      newControls.appendChild(span);
      newControls.appendChild(btnMas);

      oldButton.replaceWith(newControls);
    }
  }
}

function updateQuantity(codigo, delta) {
  if (!cart[codigo]) return;

  cart[codigo] += delta;
  if (cart[codigo] <= 0) {
    delete cart[codigo];
  }

  updateProductCard(codigo);
  updateCart();
  animateCart();
}

function removeFromCart(codigo) {
  delete cart[codigo];
  renderProducts(filteredProducts);
  updateCart();
  animateCart();
}

function updateCart() {
  const ul = document.getElementById('cart-items');
  if (!ul) return;
  ul.innerHTML = '';
  let subtotal = 0;
  let count = 0;

  for (let codigo in cart) {
    const producto = products.find(p => p.Codigo === codigo);
    const cantidad = cart[codigo];
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="cart-item">
        <img 
          class="thumb"
          src="../media/PRODUCTOS/${producto.Codigo}.jpeg" 
          alt="${producto.Nombre}" 
          onerror="this.onerror=null; this.src=this.src.replace('.jpeg', '.jpg'); this.onerror=function(){ this.src='../media/PRODUCTOS/placeholder.jpeg'; }"
          loading="lazy"
          width="80" height="80"
          style="object-fit: cover;">
        <div>
          <strong>${producto.Nombre}</strong>
          <div class="quantity-controls">
            <button onclick="updateQuantity('${codigo}', -1)">-</button>
            <span>${cantidad}</span>
            <button onclick="updateQuantity('${codigo}', 1)">+</button>
            <button onclick="removeFromCart('${codigo}')" class="remove-btn">❌</button>
          </div>
          <p>$${producto.Precio * cantidad}</p>
        </div>
      </div>
    `;
    ul.appendChild(li);
    subtotal += producto.Precio * cantidad;
    count += cantidad;
  }

  const total = subtotal;

  const totalEl = document.getElementById('total');
  const countEl = document.getElementById('cart-count');
  if (totalEl) totalEl.textContent = total;
  if (countEl) countEl.textContent = count;
}

const cart2 = document.getElementById('cart');
const cartButtonWrapper = document.getElementById('cart-icon-fixed');
const openCartButton = document.getElementById('cart-icon');
const closeCartButton = document.querySelector('.close-cart');

openCartButton.addEventListener('click', () => {
  cart2.classList.add('visible');
  cartButtonWrapper.style.display = 'none';
});

closeCartButton.addEventListener('click', () => {
  cart2.classList.remove('visible');
  cartButtonWrapper.style.display = 'block';
});

function toggleCart() {
  const cartPanel = document.getElementById('cart');
  cartPanel.classList.toggle('visible');
}

function animateCart() {
  const icon = document.getElementById('cart-count');
  if (!icon) return;
  icon.style.transform = 'scale(1.3)';
  icon.style.transition = 'transform 0.2s';
  setTimeout(() => icon.style.transform = 'scale(1)', 200);
}

function bloquearBoton(btn) {
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Enviando...';
  }
}

function desbloquearBoton(btn) {
  if (btn) {
    btn.disabled = false;
    btn.textContent = 'Finalizar Pedido';
  }
}

function validarCampos(btn) {
  const nombre = document.getElementById('name')?.value.trim();
  const mail = document.getElementById('email')?.value.trim();
  // Elimina referencias a telefono y direccion si no existen en el HTML

  if (!nombre || !mail) {
    alert('Complete todos los campos.');
    desbloquearBoton(btn);
    return false;
  }

  if (Object.keys(cart).length === 0) {
    alert('Agregue productos al carrito.');
    desbloquearBoton(btn);
    return false;
  }

  return true;
}
function enviarPedido() {
  const btn = document.getElementById('submit-btn');
  if (!validarCampos(btn)) return;

  bloquearBoton(btn);

  const pedido = {
    nombre: document.getElementById('name')?.value.trim(),
    mail: document.getElementById('email')?.value.trim(),
    productos: [],
    total: 0
  };

  let totalProductos = 0;

  for (const codigo in cart) {
    const prod = products.find(p => p.Codigo === codigo);
    const cantidad = cart[codigo];
    if (prod && cantidad > 0) {
      const subtotal = prod.Precio * cantidad;
      pedido.productos.push({
        codigo: prod.Codigo,
        nombre: prod.Nombre,
        unidades: cantidad,
        total: subtotal
      });
      totalProductos += subtotal;
    }
  }

  pedido.total = totalProductos;

  const formBody = 'data=' + encodeURIComponent(JSON.stringify(pedido));

  fetch('https://script.google.com/macros/s/AKfycbyfsOxzheXTlGnYKwHgsUPF6toKd-fo4oeXQf8eGX4HtP6yRiPApwdTGUu5ewB1lTr0/exec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formBody
  }).then(response => {
    if (response.ok) {
      alert('Pedido enviado con éxito!');
      cart = {};
      renderProducts(filteredProducts);
      updateCart();
    } else {
      alert('Error al enviar pedido.');
    }
    desbloquearBoton(btn);
  }).catch(() => {
    alert('Error de red.');
    desbloquearBoton(btn);
  });
}





// --- Modal descripción producto ---
function crearModalDescripcion(prod) {
  const oldModal = document.getElementById('modal-descripcion');
  if (oldModal) oldModal.remove();

  const modalOverlay = document.createElement('div');
  modalOverlay.id = 'modal-descripcion';
  modalOverlay.className = 'modal-overlay';

  const modalContent = document.createElement('div');
  modalContent.className = 'modal-content modal-content-anim';

  // Imagen grande
  const img = document.createElement('img');
  img.className = 'modal-img';
  img.id = `modal-img-${prod.Codigo}`;
  img.src = `../media/PRODUCTOS/${prod.Codigo}.jpeg`;
  img.alt = prod.Nombre;
  img.onerror = function() {
    this.onerror = null;
    this.src = this.src.replace('.jpeg', '.jpg');
    this.onerror = function() { this.src = '../media/PRODUCTOS/placeholder.jpeg'; };
  };
  img.onclick = () => {
    toggleZoom(img.id);
  };
  

  // Info
  const infoDiv = document.createElement('div');
  infoDiv.className = 'modal-info';

  const title = document.createElement('h3');
  title.className = 'modal-title';
  title.textContent = prod.Nombre;

  // Descripción
  const desc = document.createElement('p');
  desc.className = 'modal-desc';
  desc.textContent = prod.Descripcion;

  // Precio
  const price = document.createElement('div');
  price.style.fontWeight = 'bold';
  price.style.fontSize = '1.2rem';
  price.style.marginBottom = '1.2rem';
  price.textContent = `$${prod.Precio}`;

  // Controles de carrito
  const controls = document.createElement('div');
  controls.className = 'modal-controls quantity-controls';

  function renderControls() {
    controls.innerHTML = '';
    const cantidad = cart[prod.Codigo] || 0;
    if (cantidad > 0) {
      const btnMenos = document.createElement('button');
      btnMenos.textContent = '-';
      btnMenos.onclick = (e) => {
        e.stopPropagation();
        updateQuantity(prod.Codigo, -1);
        renderControls();
      };

      const spanCantidad = document.createElement('span');
      spanCantidad.textContent = cantidad;

      const btnMas = document.createElement('button');
      btnMas.textContent = '+';
      btnMas.onclick = (e) => {
        e.stopPropagation();
        updateQuantity(prod.Codigo, 1);
        renderControls();
      };

      controls.appendChild(btnMenos);
      controls.appendChild(spanCantidad);
      controls.appendChild(btnMas);
    } else {
      const btnAgregar = document.createElement('button');
      btnAgregar.textContent = 'Agregar al carrito';
      btnAgregar.className = 'agregar-btn';
      btnAgregar.onclick = (e) => {
        e.stopPropagation();
        addToCart(prod.Codigo);
        renderControls();
      };
      controls.appendChild(btnAgregar);
    }
  }
  renderControls();

  infoDiv.appendChild(title);
  infoDiv.appendChild(desc);
  infoDiv.appendChild(price);
  infoDiv.appendChild(controls);

  // Botón cerrar
  const closeBtn = document.createElement('button');
  closeBtn.className = 'modal-close-btn';
  closeBtn.innerHTML = '✖';
  closeBtn.onclick = cerrarModalDescripcion;

  modalContent.appendChild(img);
  modalContent.appendChild(infoDiv);
  modalContent.appendChild(closeBtn);

  modalOverlay.appendChild(modalContent);

  modalOverlay.onclick = (e) => {
    if (e.target === modalOverlay) cerrarModalDescripcion();
  };

  document.body.appendChild(modalOverlay);

  // Cerrar modal con Escape
  function escListener(e) {
    if (e.key === 'Escape') {
      cerrarModalDescripcion();
      document.removeEventListener('keydown', escListener);
    }
  }
  document.addEventListener('keydown', escListener);
}

function toggleZoom(idImagen) {
  const original = document.getElementById(idImagen);
  if (!original) return console.error("Imagen no encontrada:", idImagen);

  const existingClone = document.querySelector('.zoom-clone');
  if (existingClone) {
    closeZoom(existingClone);
    return;
  }

  let overlay = document.querySelector('.zoom-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'zoom-overlay';
    document.body.appendChild(overlay);
  }
  overlay.classList.add('open');

  let closeBtn = document.querySelector('.zoom-close-btn');
  if (!closeBtn) {
    closeBtn = document.createElement('div');
    closeBtn.className = 'zoom-close-btn';
    closeBtn.textContent = '×';
    document.body.appendChild(closeBtn);
  }
  closeBtn.style.display = 'block';

  // Clonar imagen
  const clone = original.cloneNode(true);
  clone.classList.add('zoom-clone');
  document.body.appendChild(clone);

  // Obtener posición original (relativa a viewport)
  const rect = original.getBoundingClientRect();

  // Obtener scroll para posicionar absoluto
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

  // Poner clone en posición absoluta (relativa a documento)
  clone.style.position = 'absolute';
  clone.style.top = (rect.top + scrollTop) + 'px';
  clone.style.left = (rect.left + scrollLeft) + 'px';
  clone.style.width = rect.width + 'px';
  clone.style.height = rect.height + 'px';

  clone.getBoundingClientRect(); // Forzar reflow

  // Calcular tamaño final manteniendo proporción
  const aspectRatio = rect.width / rect.height;
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  const maxWidthPercent = vw <= 600 ? 0.9 : 0.75;
  const maxHeightPercent = vw <= 600 ? 0.9 : 0.75;

  let finalWidth = vw * maxWidthPercent;
  let finalHeight = finalWidth / aspectRatio;

  if (finalHeight > vh * maxHeightPercent) {
    finalHeight = vh * maxHeightPercent;
    finalWidth = finalHeight * aspectRatio;
  }

  // Posición final centrada con scroll
  const finalTop = scrollTop + (vh - finalHeight) / 2;
  const finalLeft = scrollLeft + (vw - finalWidth) / 2;

  // Animar clon a tamaño y posición final
  clone.style.top = finalTop + 'px';
  clone.style.left = finalLeft + 'px';
  clone.style.width = finalWidth + 'px';
  clone.style.height = finalHeight + 'px';

  

  // Función para cerrar zoom
  function closeZoom(cloneImg) {
    const rect = original.getBoundingClientRect();
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;

    cloneImg.style.top = (rect.top + scrollTop) + 'px';
    cloneImg.style.left = (rect.left + scrollLeft) + 'px';
    cloneImg.style.width = rect.width + 'px';
    cloneImg.style.height = rect.height + 'px';

    overlay.classList.remove('open');
    closeBtn.style.display = 'none';

    cloneImg.addEventListener('transitionend', () => cloneImg.remove(), { once: true });
  }
  function escListener(e) {
    if (e.key === 'Escape') {
      closeZoom(clone);
      document.removeEventListener('keydown', escListener);
    }
  }
  document.addEventListener('keydown', escListener);

  // Eventos para cerrar zoom
  overlay.onclick = (e) => { if (e.target === overlay) closeZoom(clone); };
  clone.onclick = () => closeZoom(clone);
  closeBtn.onclick = () => closeZoom(clone);
}


window.onload = () => {
  loadProducts();
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => searchProduct());
  }
};