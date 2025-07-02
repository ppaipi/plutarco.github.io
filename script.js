let products = [];
let cart = {};
let filteredProducts = [];
let currentFilter = 'Todas';
let currentSearch = '';
let costoEnvioActual = 0;
const LOCAL_ADDRESS = CONFIG.LOCAL_ADDRESS; // Cambiar por tu dirección real

async function loadProducts() {
  const res = await fetch('productos.json');
  products = await res.json();
  filteredProducts = [...products];
  renderProducts(filteredProducts);
}

function renderProducts(productos) {
  const container = document.getElementById('product-list');
  container.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = 'product-grid';

  productos.forEach(prod => {
    const div = document.createElement('div');
    div.className = 'product';

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
      <img src="PRODUCTOS/${prod.Codigo}.jpeg" alt="${prod['Nombre']}" onerror="this.onerror=null;this.src='PRODUCTOS/placeholder.jpeg';">
      <h3>${prod['Nombre']}</h3>
      <p>$${prod.Precio}</p>
    `;
    div.appendChild(controles);
    grid.appendChild(div);
  });

  container.appendChild(grid);
}

function addToCart(codigo) {
  cart[codigo] = (cart[codigo] || 0) + 1;
  renderProducts(filteredProducts);
  updateCart();
  animateCart();
}

function updateQuantity(codigo, delta) {
  if (!cart[codigo]) return;
  cart[codigo] += delta;
  if (cart[codigo] <= 0) delete cart[codigo];
  renderProducts(filteredProducts);
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
        <img src="PRODUCTOS/${producto.Codigo}.jpeg" class="thumb" onerror="this.onerror=null;this.src='PRODUCTOS/placeholder.jpeg';">
        <div>
          <strong>${producto['Nombre']}</strong>
          <div class="quantity-controls">
            <button onclick="updateQuantity('${codigo}', -1)">-</button>
            <span>${cantidad}</span>
            <button onclick="updateQuantity('${codigo}', 1)">+</button>
            <button onclick="removeFromCart('${codigo}')" class="remove-btn">🗑️</button>
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

  const subtotalEl = document.getElementById('subtotal');
  const envioEl = document.getElementById('envio');
  const totalEl = document.getElementById('total');
  const countEl = document.getElementById('cart-count');

  if (subtotalEl) subtotalEl.textContent = subtotal;
  if (envioEl) envioEl.textContent = envio;
  if (totalEl) totalEl.textContent = total;
  if (countEl) countEl.textContent = count;
}

function toggleCart() {
  const cartPanel = document.getElementById('cart');
  cartPanel.classList.toggle('visible');
}

function filterCategory(cat) {
  currentFilter = cat;
  currentSearch = '';
  filteredProducts = (cat === 'Todas') ? [...products] : products.filter(p => p.Categoria === cat);
  renderProducts(filteredProducts);
}

function searchProduct() {
  const term = document.getElementById('search-input').value.toLowerCase().trim();
  currentSearch = term;
  if (!term) {
    filterCategory(currentFilter);
    return;
  }
  filteredProducts = products.filter(p => p['Nombre'].toLowerCase().includes(term));
  renderProducts(filteredProducts);
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
      else if (km <= 4) costo = 4000;
      else if (km <= 5) costo = 4500;
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

async function finalizeOrder() {
  const btn = document.getElementById('submit-btn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Enviando...';
  }
  const dia = document.getElementById('pickup-day').value;
  const nombre = document.getElementById('name').value.trim();
  const mail = document.getElementById('email').value.trim();
  const telefono = document.getElementById('phone').value.trim();
  const direccion = document.getElementById('address').value.trim();
  const comentario = document.getElementById('comment').value.trim();

  if (!dia || !nombre || !mail || !telefono || !direccion || Object.keys(cart).length === 0) {
    alert('Completá todos los campos y asegurate de tener productos en el carrito.');
    return;
  }

  if (costoEnvioActual === 0) {
    alert('La dirección está fuera del área de reparto.');
    return;
  }

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
  
  const pedido = {
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
  

  try {
    await fetch('https://script.google.com/macros/s/AKfycbzffgdmmKb5hYfyDxew1tzVb_DA7eQkW5c6pH6XO9nBklvnKNUb2jMulmF2Uj437XWV/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pedido),
      mode: 'no-cors'
    });

    alert('¡Pedido enviado!');
    cart = {};
    costoEnvioActual = 0;
    updateCart();

    ['pickup-day', 'name', 'email', 'phone', 'address', 'comment'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });

    const envioMsg = document.getElementById('envio-msg');
    if (envioMsg) envioMsg.textContent = '';

    renderProducts(filteredProducts);
  } catch (e) {
    alert('Error al enviar el pedido');
    console.error(e);
  }
  finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = 'Enviar Pedido';
    }
  }  
}

loadProducts();
