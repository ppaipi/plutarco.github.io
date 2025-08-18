let products = [];
let allProducts = [];
let enabledCodes = [];
let cart = {};
let filteredProducts = [];
let currentFilter = 'Todas';
let currentSearch = '';
let costoEnvioActual = 0;
let indiceCategoria = '';
let descripcionesPorCodigo = {};
const LOCAL_ADDRESS = 'Ibera 3852, Coghlan, CABA, Argentina.';


async function loadProducts() {
  try {
    const res = await fetch('articulos.xlsx?cacheBust=' + Date.now());
    const data = await res.arrayBuffer();

    // Leer el Excel
    const workbook = XLSX.read(data, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    // Convertir la hoja a JSON
    const jsonData = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    // Mapear a tu formato
    allProducts = jsonData.map(row => ({
      Codigo: (row["CODIGO BARRA"] || "").toString().trim(),
      Nombre: row["DESCRIPCION LARGA"] || "",
      Descripcion: row["DESCRIPCION ADICIONAL"] || "",
      Categoria: row["RUBRO"] || "",
      Precio: parsePrecio(row["PRECIO VENTA C/IVA"]),
      Proveedor: row["PROVEEDOR"] || "",
    }));

    // Filtrar solo habilitados
    const resCodes = await fetch('Habilitados.json?cacheBust=' + Date.now());
    enabledCodes = await resCodes.json();
    products = allProducts.filter(p => enabledCodes.includes(p.Codigo));
    filteredProducts = [...products];

    // Render
    renderCategoryMenu();
    renderProductsByCategory(filteredProducts);

    const header = document.querySelector('header');
    if (header) {
      header.scrollIntoView({ behavior: 'smooth' });
    }

  } catch (err) {
    console.error("Error cargando productos:", err);
  }
}
function parsePrecio(str) {
  if (!str) return 0;
  // Quitar puntos de miles y reemplazar coma decimal por punto
  const limpio = str.replace(/\./g, '').replace(',', '.');
  return parseFloat(limpio) || 0;
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
    }, 180); // igual al tiempo de la animación de cierre en CSS
  } else {
    modal.remove();
  }
}


// MODIFICAR: todo el div del producto abre el modal
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
      src="media/PRODUCTOS/${prod.Codigo}.jpeg" 
      alt="${prod.Nombre}" 
      loading="lazy"
      style="object-fit: cover;"
      onerror="this.onerror=null; this.src=this.src.replace('.jpeg', '.jpg'); this.onerror=function(){ this.src='media/PRODUCTOS/placeholder.jpeg'; }"
    >
    <h3>${prod.Nombre}</h3>
    <p>$${prod.Precio}</p>
  `;

  // SOLO abre el modal si el click no es sobre un botón
  div.onclick = (e) => {
    if (
      e.target.tagName !== 'BUTTON' &&
      !(e.target.closest && e.target.closest('button'))
    ) {
      crearModalDescripcion(prod);
    }
  };

  div.appendChild(controles);
  return div;
}



function cargarDiasEntrega() {
  const select = document.getElementById("pickup-day");
  if (!select) return;

  const diasValidos = [3]; // 2: Martes, 5: Viernes
  const opciones = [];

  let hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  while (opciones.length < 2) {
    hoy.setDate(hoy.getDate() + 1);
    const diaSemana = hoy.getDay();
    if (diasValidos.includes(diaSemana)) {
      const fechaISO = hoy.toISOString().split("T")[0]; // YYYY-MM-DD

      const diaNombre = hoy.toLocaleDateString('es-AR', { weekday: 'long' });
      const diaCapitalizado = diaNombre.charAt(0).toUpperCase() + diaNombre.slice(1);

      const dia = hoy.getDate();
      const mes = hoy.getMonth() + 1;
      const texto = `${diaCapitalizado} ${dia}/${mes}`;

      opciones.push({ value: fechaISO, texto });
    }
  }

  select.innerHTML = '<option value="" disabled selected>Seleccionar una fecha</option>';
  opciones.forEach(opt => {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.texto;
    select.appendChild(option);
  });
}

function renderCategoryMenu() {
  const container = document.getElementById('category-buttons');
  if (!container) return;
  container.innerHTML = '';

  const todasBtn = document.createElement('button');
  todasBtn.textContent = 'Todas';
  todasBtn.onclick = () => {
    indiceCategoria = '';
    currentFilter = 'Todas';
    filteredProducts = [...products];
    renderCategoryMenu();
    renderProductsByCategory(filteredProducts);
  };
  container.appendChild(todasBtn);

  let categorias = [...new Set(products.map(p => p.Categoria))];

  categorias = categorias.filter(cat => cat !== 'Panaderia Artesanal')
    .sort((a, b) => a.localeCompare(b, 'es'));

  if (products.some(p => p.Categoria === 'Panaderia Artesanal')) {
    categorias.unshift('Panaderia Artesanal');
  }

  categorias.forEach(cat => {
    const btn = document.createElement('button');
    btn.textContent = cat;
    btn.onclick = () => {
      indiceCategoria = '';
      filterCategory(cat);
    }
    container.appendChild(btn);
  });
}

function scrollToElementoVerMas(clase, intentos = 10) {
  const el = document.querySelector(`.category-title.${clase}`);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth' });
    if (intentos > 0) {
      setTimeout(() => {
        requestAnimationFrame(() => scrollToElementoVerMas(clase, intentos - 1));
      }, 50);
    }
  }
}

function renderProductsByCategory(productos) {
  const container = document.getElementById('product-list');
  container.innerHTML = '';

  if (currentFilter !== 'Todas') {
    const backBtn = document.createElement('button');
    backBtn.textContent = '⬅ Volver al inicio';
    backBtn.className = 'volver-btn';
    backBtn.onclick = () => {
      currentFilter = 'Todas';
      filteredProducts = [...products];
      renderCategoryMenu();
      renderProductsByCategory(filteredProducts);
      if (indiceCategoria) {
        scrollToElementoVerMas(indiceCategoria);
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    };
    container.appendChild(backBtn);
  }

  let categorias = [...new Set(productos.map(p => p.Categoria))];
  categorias = categorias.filter(c => c !== 'Panaderia Artesanal').sort((a, b) => a.localeCompare(b, 'es'));
  if (productos.some(p => p.Categoria === 'Panaderia Artesanal')) {
    categorias.unshift('Panaderia Artesanal');
  }

  categorias.forEach(cat => {
    const div = document.createElement('div');
    div.className = 'category-section';

    const h2 = document.createElement('h2');
    h2.className = `category-title ${cat.replace(/\s+/g, '-')}`;
    h2.innerHTML = `<a href="#" onclick="filterCategory('${cat}'); return false;">${cat}</a>`;
    h2.onclick = () => {
      indiceCategoria = cat.replace(/\s+/g, '-');
    }
    div.appendChild(h2);

    const grid = document.createElement('div');
    grid.className = 'product-grid';

const productosCat = productos
  .filter(p => p.Categoria === cat)
  .sort((a, b) => a.Nombre.localeCompare(b.Nombre, 'es'));    const mostrar = currentFilter === cat ? productosCat : productosCat.slice(0, 5);
    mostrar.forEach(prod => grid.appendChild(createProductCard(prod)));

    if (productosCat.length > 5 && currentFilter === 'Todas') {
      const verMasBtn = createVerMasCard(cat);
      grid.appendChild(verMasBtn);
    }
    for (let i = productosCat.length; i < 5; i++) {
      const vacio = document.createElement("div");
      vacio.className = "product espacio-vacio";
      grid.appendChild(vacio);
    }

    div.appendChild(grid);
    container.appendChild(div);
  });
}

function createVerMasCard(categoria) {
  const div = document.createElement('div');
  const catClass = categoria.replace(/\s+/g, '-');
  div.className = `product ver-mas-card ${catClass}`;
  div.style.cursor = 'pointer';

  div.onclick = () => {
    indiceCategoria = catClass;
    filterCategory(categoria);
  };

  const icon = document.createElement('div');
  icon.className = 'ver-mas-icon';
  icon.innerHTML = `
    <svg xmlns="http://www.w3.org/2000/svg" class="boton-ver-mas" viewBox="0 0 24 24" >
      <rect x="10.75" y="4" width="2.5" height="16" rx="1.2"/>
      <rect x="4" y="10.75" width="16" height="2.5" rx="1.2"/>
    </svg>
  `;

  const texto = document.createElement('div');
  texto.className = 'ver-mas-text';
  texto.textContent = 'Ver más';

  div.appendChild(icon);
  div.appendChild(texto);
  return div;
}

function filterCategory(cat) {
  currentFilter = cat;
  currentSearch = '';
  filteredProducts = (cat === 'Todas') ? [...products] : products.filter(p => p.Categoria === cat);
  renderCategoryMenu();
  renderProductsByCategory(filteredProducts);

  const volverbtn = document.getElementsByClassName('volver-btn')[0];
  if (volverbtn) {
    setTimeout(() => {
      volverbtn.scrollIntoView({ behavior: 'smooth' });
    }, 100);    
  }
}

function searchProduct() {
  const term = document.getElementById('search-input').value.toLowerCase().trim();
  currentSearch = term;

  if (!term) {
    filterCategory(currentFilter);
    return;
  }

  filteredProducts = products.filter(p => p.Nombre.toLowerCase().includes(term));
  renderProductsByCategory(filteredProducts);
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
  renderProductsByCategory(filteredProducts);
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
          src="media/PRODUCTOS/${producto.Codigo}.jpeg" 
          alt="${producto.Nombre}" 
          onerror="this.onerror=null; this.src=this.src.replace('.jpeg', '.jpg'); this.onerror=function(){ this.src='media/PRODUCTOS/placeholder.jpeg'; }"
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

  const envio = costoEnvioActual;
  const total = subtotal + envio;

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

function validarDia(event) {
  const input = event.target;
  const date = new Date(input.value);
  const day = date.getDay();
  input.setCustomValidity([3, 6].includes(day) ? '' : 'Solo se permite miércoles o sábados');
}

function initAutocomplete() {
  const input = document.getElementById('address');
  const autocomplete = new google.maps.places.Autocomplete(input);
  autocomplete.setFields(['formatted_address']);

  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace();
    if (!place.formatted_address) {
      mostrarMensajeEnvio('Dirección inválida.', 'red');
      costoEnvioActual = 0;
      updateCart();
      return;
    }

    const destino = place.formatted_address;

    const service = new google.maps.DistanceMatrixService();
    service.getDistanceMatrix({
      origins: [LOCAL_ADDRESS],
      destinations: [destino],
      travelMode: 'DRIVING'
    }, (response, status) => {
      if (status !== 'OK') {
        mostrarMensajeEnvio('Error al calcular distancia.', 'red');
        costoEnvioActual = 0;
        updateCart();
        return;
      }

      const element = response.rows[0].elements[0];
      if (element.status !== 'OK') {
        mostrarMensajeEnvio('No se puede entregar a esa dirección.', 'red');
        costoEnvioActual = 0;
        updateCart();
        return;
      }

      const km = element.distance.value / 1000;
      let costo = 0;
      let msg = '';
      let color = 'green';

      if (km <= 1) costo = 2000;
      else if (km <= 2) costo = 2500;
      else if (km <= 3) costo = 3000;
      else if (km <= 4) costo = 3500;
      else if (km <= 5) costo = 4500;
      else if (km <= 6) costo = 5000;
      else if (km <= 7) costo = 6000;
      else {
        msg = '🛑 Fuera del rango de entrega';
        color = 'red';
        costo = 0;
      }

      costoEnvioActual = costo;
      mostrarMensajeEnvio(msg || `🚚 Costo Envío: $${costo}`, color);
      updateCart();
    });
  });
}

function mostrarMensajeEnvio(texto, color) {
  const envioMsg = document.getElementById('envio-msg');
  if (envioMsg) {
    envioMsg.textContent = texto;
    envioMsg.style.color = color;
  }
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
  const dia = document.getElementById('pickup-day').value;
  const nombre = document.getElementById('name').value.trim();
  const mail = document.getElementById('email').value.trim();
  const telefono = document.getElementById('phone').value.trim();
  const direccion = document.getElementById('address').value.trim();

  if (!dia || !nombre || !mail || !telefono || !direccion) {
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

  let totalProductos = 0;
  const productos = [];

  // Calcular productos y subtotal
  for (const codigo in cart) {
    const prod = products.find(p => p.Codigo === codigo);
    const cantidad = cart[codigo];
    totalProductos += prod.Precio * cantidad;
    productos.push({
      nombre: prod.Nombre,
      codigo: prod.Codigo,
      unidades: cantidad,
      total: prod.Precio * cantidad
    });
  }
  

  const pedido = {
    nombre: document.getElementById('name').value.trim(),
    mail: document.getElementById('email').value.trim(),
    telefono: document.getElementById('phone').value.trim(),
    direccion: document.getElementById('address').value.trim(),
    retiro: document.getElementById('pickup-day').value,
    comentario: "", // opcional
    productos: productos,
    subtotal: totalProductos,
    envio: costoEnvioActual,
    total: totalProductos + costoEnvioActual
  }; 

  // Form-data para evitar CORS
  const formData = new URLSearchParams();
  formData.append('data', JSON.stringify(pedido));

  fetch('https://script.google.com/macros/s/AKfycbzXPqRns7UKWq_vr1ZpA98Dpj7DlLg7XvHiPcWu1usYqaFDY6iMgHgMPdnH_Jk04Qf_/exec', {
    method: 'POST',
    body: formData
  })
  .finally(() => {
    alert('Pedido enviado con éxito!');

    // --- VACIAR TODO EL CARRITO ---
    cart = {};                      // borra los productos seleccionados
    filteredProducts = [...allProducts]; // resetear listado de productos
    renderProductsByCategory(filteredProducts);
    updateCart();

    // Limpiar campos del formulario
    document.getElementById('name').value = '';
    document.getElementById('email').value = '';
    document.getElementById('phone').value = '';
    document.getElementById('address').value = '';
    document.getElementById('pickup-day').value = '';

    desbloquearBoton(btn);
  });
}







// --- Funcionalidad modal descripción producto ---
function crearModalDescripcion(prod) {
  const oldModal = document.getElementById('modal-descripcion');
  if (oldModal) oldModal.remove();

  const modalOverlay = document.createElement('div');
  modalOverlay.id = 'modal-descripcion';
  modalOverlay.className = 'modal-overlay';

  const modalContent = document.createElement('div');
  modalContent.className = 'modal-content modal-content-anim'; // <-- animación

  // Imagen grande
  const img = document.createElement('img');
  img.className = 'modal-img';
  img.id = `modal-img-${prod.Codigo}`;
  img.src = `media/PRODUCTOS/${prod.Codigo}.jpeg`;
  img.alt = prod.Nombre;
  img.onerror = function() {
    this.onerror = null;
    this.src = this.src.replace('.jpeg', '.jpg');
    this.onerror = function() { this.src = 'media/PRODUCTOS/placeholder.jpeg'; };
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
  desc.innerHTML = (prod.Descripcion || 'Sin descripción disponible.').replace(/\n/g, '<br>');

  // Precio
  const price = document.createElement('div');
  price.style.fontWeight = 'bold';
  price.style.fontSize = '1.2rem';
  price.style.marginBottom = '1.2rem';
  price.textContent = `$${prod.Precio}`;
  desc.className = 'modal-price';


  // Controles de carrito
  const controls = document.createElement('div');
  controls.className = 'modal-controls quantity-controls'; // Aplica ambas clases

  function renderControls() {
    controls.innerHTML = '';
    const cantidad = cart[prod.Codigo] || 0;
    if (cantidad > 0) {
      const btnMenos = document.createElement('button');
      btnMenos.textContent = '-';
      btnMenos.className = '';
      btnMenos.onclick = (e) => {
        e.stopPropagation();
        updateQuantity(prod.Codigo, -1);
        renderControls();
      };

      const spanCantidad = document.createElement('span');
      spanCantidad.textContent = cantidad;

      const btnMas = document.createElement('button');
      btnMas.textContent = '+';
      btnMas.className = '';
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
  cargarDiasEntrega();
  initAutocomplete();

  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', () => searchProduct());
  }
};
