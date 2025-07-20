// script.js completo con botón "Ver más" que filtra por categoría, y muestra todos los productos de esa categoría

let products = [];
let allProducts = [];
let enabledCodes = [];
let cart = {};
let filteredProducts = [];
let currentFilter = 'Todas';
let currentSearch = '';
let costoEnvioActual = 0;
const LOCAL_ADDRESS = "Ibera 3852, Coghlan, CABA, Argentina";

async function loadProducts() {
  const resAll = await fetch('Productos.csv?cacheBust=' + Date.now());
  const csvText = await resAll.text();
  allProducts = parseCSV(csvText);

  const resCodes = await fetch('Habilitados.json?cacheBust=' + Date.now());
  enabledCodes = await resCodes.json();
  products = allProducts.filter(p => enabledCodes.includes(p.Codigo));
  filteredProducts = [...products];
  renderCategoryMenu();
  renderProductsByCategory(filteredProducts);
}

function parseCSV(csvText) {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(';');
  return lines.slice(1).map(line => {
    const values = line.split(';');
    const obj = {};
    headers.forEach((h, i) => {
      const key = h.trim();
      let val = values[i] ? values[i].trim() : '';
      if (key === 'Codigo') val = String(val); // 👈 esto fuerza a string
      else if (key === 'Precio' || key === 'Costo' || key === 'Stock') val = parseFloat(val) || 0;
      obj[key] = val;
    });
    return obj;
  });
}
function cargarDiasEntrega() {
  const select = document.getElementById("pickup-day");
  if (!select) return;

  const diasValidos = [2, 5]; // 2: Martes, 5: Viernes
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

  // Agrega nuevas opciones dejando la primera
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
    currentFilter = 'Todas';
    filteredProducts = [...products];
    renderCategoryMenu();
    renderProductsByCategory(filteredProducts);
  };
  container.appendChild(todasBtn);

  let categorias = [...new Set(products.map(p => p.Categoria))];

  categorias = categorias.filter(cat => cat !== 'Panaderia y Comidas') // quitarla para moverla al frente
    .sort((a, b) => a.localeCompare(b, 'es')); // orden alfabético

  if (products.some(p => p.Categoria === 'Panaderia y Comidas')) {
    categorias.unshift('Panaderia y Comidas'); // agregarla primera si existe
  }

  categorias.forEach(cat => {
    const btn = document.createElement('button');
    btn.textContent = cat;
    btn.onclick = () => filterCategory(cat);
    container.appendChild(btn);
  });
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
    };
    container.appendChild(backBtn);
  }

  let categorias = [...new Set(productos.map(p => p.Categoria))];

  // Mover "Panaderia y comidas" al inicio
  categorias = categorias.filter(c => c !== 'Panaderia y Comidas').sort((a, b) => a.localeCompare(b, 'es'));
  if (productos.some(p => p.Categoria === 'Panaderia y Comidas')) {
    categorias.unshift('Panaderia y Comidas');
  }

  categorias.forEach(cat => {
    const div = document.createElement('div');
    div.className = 'category-section';

    const h2 = document.createElement('h2');
    h2.className = 'category-title';
    h2.innerHTML = `<a href="#" onclick="filterCategory('${cat}'); return false;">${cat}</a>`;
    div.appendChild(h2);

    const grid = document.createElement('div');
    grid.className = 'product-grid';

    const productosCat = productos.filter(p => p.Categoria === cat);
    const mostrar = currentFilter === cat ? productosCat : productosCat.slice(0, 5);
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
    btnMenos.onclick = () => updateQuantity(prod.Codigo, -1);

    const spanCantidad = document.createElement('span');
    spanCantidad.textContent = cantidad;

    const btnMas = document.createElement('button');
    btnMas.textContent = '+';
    btnMas.onclick = () => updateQuantity(prod.Codigo, 1);

    controles.appendChild(btnMenos);
    controles.appendChild(spanCantidad);
    controles.appendChild(btnMas);
  } else {
    controles = document.createElement('button');
    controles.textContent = 'Agregar';
    controles.onclick = () => addToCart(prod.Codigo);
  }

  div.innerHTML = `
    <img 
    src="media/PRODUCTOS/${prod.Codigo}.jpeg" 
    alt="${prod.Nombre}" 
    onerror="this.onerror=null; this.src=this.src.replace('.jpeg', '.jpg'); this.onerror=function(){ this.src='media/PRODUCTOS/placeholder.jpeg'; }"
    loading="lazy"
    style="object-fit: cover;">
    <h3>${prod.Nombre}</h3>
    <p>$${prod.Precio}</p>
  `;
  div.appendChild(controles);
  return div;
}

function createVerMasCard(categoria) {
  const div = document.createElement('div');
  div.className = 'product ver-mas-card';
  div.style.cursor = 'pointer';

  div.onclick = () => {
    filterCategory(categoria);
  };

  const icon = document.createElement('div');
  icon.className = 'ver-mas-icon';
  icon.textContent = '➕';

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
  window.scrollTo({
    top: 0,
    left: 0,
    behavior: 'smooth'
  });
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

  // Si cantidad es 0, reemplazamos controles por botón "Agregar"
  if (cantidad === 0) {
    const controles = card.querySelector('.quantity-controls');
    if (controles) {
      const btnAgregar = document.createElement('button');
      btnAgregar.textContent = 'Agregar';
      btnAgregar.onclick = () => addToCart(codigo);
      controles.replaceWith(btnAgregar);
    }
  } else {
    // Ya hay controles, solo actualizamos número
    const controles = card.querySelector('.quantity-controls');
    if (controles) {
      controles.querySelector('span').textContent = cantidad;
    } else {
      // Si antes había botón, lo reemplazamos por controles
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
  
    updateProductCard(codigo);  // 👈 nueva función para actualizar SOLO ese producto
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

// Mostrar carrito y ocultar botón
openCartButton.addEventListener('click', () => {
  cart2.classList.add('visible');
  cartButtonWrapper.style.display = 'none';
});

// Ocultar carrito y volver a mostrar botón
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

  // Verificar campos vacíos
  if (!dia || dia === "Seleccionar una fecha" || !nombre || !mail || !telefono || !direccion) {
    alert('Completá todos los campos correctamente.');
    desbloquearBoton(btn);
    return false;
  }

  // Validar formato de email (mail@algo.algo)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(mail)) {
    alert('Ingresá un email válido en el formato mail@algo.algo.');
    desbloquearBoton(btn);
    return false;
  }

  // Validar teléfono: al menos 8 caracteres numéricos
  const numerosTelefono = telefono.replace(/\D/g, ''); // quitar espacios y símbolos
  if (numerosTelefono.length < 8) {
    alert('El teléfono debe tener al menos 8 números.');
    desbloquearBoton(btn);
    return false;
  }

  // Validar nombre: al menos 2 palabras
  if (nombre.split(/\s+/).length < 2) {
    alert('Ingresá tu nombre completo (al menos 2 palabras).');
    desbloquearBoton(btn);
    return false;
  }

  // Validar carrito no vacío
  if (Object.keys(cart).length === 0) {
    alert('Agregá al menos un producto al carrito.');
    desbloquearBoton(btn);
    return false;
  }

  // Validar costo de envío
  if (costoEnvioActual === 0) {
    alert('La dirección está fuera del área de reparto.');
    desbloquearBoton(btn);
    return false;
  }

  return true;
}


function construirPedido() {
  const dia = document.getElementById('pickup-day').value;
  const nombre = document.getElementById('name').value.trim();
  const mail = document.getElementById('email').value.trim();
  const telefono = document.getElementById('phone').value.trim();
  const direccion = document.getElementById('address').value.trim();
  const comentario = document.getElementById('comment').value.trim();

  const productos = Object.entries(cart).map(([codigo, cantidad]) => {
    const p = products.find(p => p.Codigo === codigo);
    return `${p['Nombre']} x${cantidad} ($${p.Precio * cantidad})`;
  });

  const subtotal = productos.reduce((sum, p) => {
    const match = p.match(/\$(\d+)/);
    return sum + (match ? parseInt(match[1]) : 0);
  }, 0);

  const envio = costoEnvioActual;
  const total = subtotal + envio;

  return {
    nombre,
    mail,
    telefono,
    direccion,
    comentario,
    productos,
    subtotal,
    envio,
    total,
    retiro: dia
  };
}

async function enviarPedido(pedido) {
  await fetch('https://script.google.com/macros/s/AKfycbwTkHayu52ejbje8V8PthTKNH21PSU116fryMuf5nmc0CHPSpz2J0DFVfS3Ilp-fhQn/exec', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pedido),
    mode: 'no-cors'
  });
}

function limpiarFormulario() {
  cart = {};
  costoEnvioActual = 0;
  updateCart();

  const campos = ['pickup-day', 'name', 'email', 'phone', 'address', 'comment'];
  campos.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });

  const envioMsg = document.getElementById('envio-msg');
  if (envioMsg) envioMsg.textContent = '';
}


async function finalizeOrder() {
  const btn = document.getElementById('submit-btn');
  bloquearBoton(btn);

  if (!validarCampos(btn)){
    desbloquearBoton(btn);
    return;
  } 

  const pedido = construirPedido();
  if (!pedido) {
    desbloquearBoton(btn);
    return;
  }

  try {
    await enviarPedido(pedido);
    alert('¡Pedido enviado! Recibiras un mail con las intrucciones de pago.');
    limpiarFormulario();
    renderProductsByCategory(filteredProducts);
  } catch (e) {
    alert('Error al enviar el pedido');
    console.error(e);
  } finally {
    desbloquearBoton(btn);
  }
}


loadProducts();
cargarDiasEntrega();
