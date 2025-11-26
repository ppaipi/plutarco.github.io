let products = [];
let allProducts = [];
let enabledCodes = [];
let rankingMap = {};
let cart = {};
let filteredProducts = [];
let currentFilter = 'Todas';
let currentSearch = '';
let costoEnvioActual = 0;
let indiceCategoria = '';
let descripcionesPorCodigo = {};
let pedidoMinimo = false
let cantidadMinima = 20000
let autocomplete; 
const LOCAL_ADDRESS = 'Ibera 3852, Coghlan, CABA, Argentina.';
const ordenCategorias = [
  "Panificados Integrales",
  "Organicos",
  "Refrigerados",
  "Congelados",
  "Infusiones",
  "Productos Sueltos",
  "Cereales y Legumbres",
  "Aceites y Conservas",
  "Snack",
  "Mieles y Dulces",
  "Bebidas",
  "Sales y Condimentos"
];
const ordenSubCategorias = ["Oliva", "Girasol", "Conservas", "Yerba Mate", "Yuyos", "Cafe", "Veganos", "Lacteos", "Sales", "Condimentos"];

let direccionValidaGoogle = false; // Variable global para saber si la dirección es válida de Google

async function loadProducts() {
  try {
    const res = await fetch('../media/articulos.xlsx?cacheBust=' + Date.now());
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
      SubCategoria: row["SUBRUBRO"] || "",
      Precio: parsePrecio(row["PRECIO VENTA C/IVA"]),
      Proveedor: row["PROVEEDOR"] || "",
    }));

    // Filtrar solo habilitados
    const resCodes = await fetch('../media/Habilitados.json?cacheBust=' + Date.now());
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

async function loadRanking() {
  const res = await fetch('../media/Ranking.csv?cacheBust=' + Date.now());
  const csvText = await res.text();
  const rows = csvText.trim().split('\n').slice(1); // saco encabezado

  rows.forEach(row => {
    const cols = row.split(';'); // <-- separador correcto
    if (cols.length < 2) return;

    const rank = parseInt(cols[0]?.trim(), 10); // columna 1 = Ranking
    const producto = cols[1]?.trim();           // columna 2 = Producto

    if (producto && !isNaN(rank)) {
      rankingMap[producto] = rank;
    }
  });
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
    src="media/PRODUCTOS/${prod.Codigo}.jpg" 
    alt="${prod.Nombre}" 
    loading="lazy"
    style="object-fit: cover;"
    onerror="this.onerror=null; this.src='media/PRODUCTOS/placeholder.jpg';"
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

  select.innerHTML = ""; // limpiar opciones previas

  const diasValidos = [ 4]; // Lunes (1), Jueves (4)
  const horasCorte = { 
    1: 14, // Lunes → límite 13hs
    4: 14  // Jueves → límite 14hs
  };

  const opciones = [];
  let fechaIterada = new Date(); // empieza desde hoy
  const ahora = new Date();

  while (opciones.length < 2) {
    fechaIterada.setDate(fechaIterada.getDate() + 1);
    const diaSemana = fechaIterada.getDay();

    if (diasValidos.includes(diaSemana)) {
      const fechaISO = fechaIterada.toISOString().split("T")[0];
      const diaNombre = fechaIterada.toLocaleDateString("es-AR", { weekday: "long" });
      const diaCapitalizado = diaNombre.charAt(0).toUpperCase() + diaNombre.slice(1);

      const dia = fechaIterada.getDate();
      const mes = fechaIterada.getMonth() + 1;

      const horaEntrega = horasCorte[diaSemana];
      const texto = `${diaCapitalizado} ${dia}/${mes} ${horaEntrega+1}hs aprox`;

      // ✅ Validar hora límite SOLO si la fecha iterada es el mismo día que hoy
      let incluir = true;
      if (fechaISO === ahora.toISOString().split("T")[0]) {
        if (ahora.getHours() >= horasCorte[diaSemana]) {
          incluir = false; // ya pasó la hora de corte
        }
      }

      if (incluir) {
        opciones.push({ value: fechaISO, texto });
      }
    }
  }

  // Renderizar opciones
  select.innerHTML = '<option value="" disabled selected>Seleccionar una fecha</option>';
  opciones.forEach(opt => {
    const option = document.createElement("option");
    option.value = opt.value;
    option.textContent = opt.texto;
    select.appendChild(option);
  });
}

// Detectar si es pantalla táctil
const isTouchDevice = () => {
  return (('ontouchstart' in window) || (navigator.maxTouchPoints > 0));
};

document.addEventListener("DOMContentLoaded", () => {
  const dropdownBtn = document.querySelector(".dropdown-btn");
  const dropdownContent = document.querySelector(".dropdown-content");
  const arrow = document.querySelector(".dropdown-btn .arrow");

  if (isTouchDevice()) {
    // 👉 En móviles: abrir/cerrar con click
    dropdownBtn.addEventListener("click", (e) => {
      e.preventDefault();
      dropdownContent.classList.toggle("show");
      arrow.classList.toggle("rotate");
    });

    // 👉 Cerrar al hacer click fuera
    document.addEventListener("click", (e) => {
      if (!dropdownBtn.contains(e.target) && !dropdownContent.contains(e.target)) {
        dropdownContent.classList.remove("show");
        arrow.classList.remove("rotate");
      }
    });
  }
  // 👉 En desktop no hacemos nada: se controla con :hover en CSS
});


function renderCategoryMenu() {
  const container = document.getElementById('dropdown-categories');
  if (!container) return;
  container.innerHTML = '';

  const todasBtn = document.createElement('button');
  todasBtn.textContent = 'Todas';
  todasBtn.classList.add('cat-btn');
  todasBtn.id = 'cat-btn-Todas';
  todasBtn.onclick = () => {
    indiceCategoria = '';
    currentFilter = 'Todas';
    filteredProducts = [...products];
    renderProductsByCategory(filteredProducts);
  };
  container.appendChild(todasBtn);
  highlightSelected("Todas");

  let categorias = [...new Set(products.map(p => p.Categoria))];

  // Reordenar según el array
  categorias.sort((a, b) => {
    const indexA = ordenCategorias.indexOf(a);
    const indexB = ordenCategorias.indexOf(b);

    const posA = indexA !== -1 ? indexA : Infinity;
    const posB = indexB !== -1 ? indexB : Infinity;

    if (posA !== posB) return posA - posB;
    return a.localeCompare(b, 'es'); // alfabético si no están en el array
  });

  categorias.forEach(cat => {
    const catFiltered = cat.replace(/\s+/g, '-');
    const btn = document.createElement('button');
    btn.textContent = cat;
    btn.classList.add(`cat-btn`);
    btn.id = `cat-btn-${catFiltered}`;
    btn.onclick = () => {
      indiceCategoria = '';
      filterCategory(cat);
    };
    container.appendChild(btn);
  });
}


function highlightSelected(selectedBtn) {
  document.querySelectorAll('.cat-btn').forEach(btn => {
    btn.classList.remove('active-cat');
  });
  let activeBtn = document.getElementById(`cat-btn-${selectedBtn}`);
  activeBtn.classList.add('active-cat');
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
    const catFiltered = currentFilter.replace(/\s+/g, '-');
    highlightSelected(catFiltered);
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


  categorias.sort((a, b) => {
    const indexA = ordenCategorias.indexOf(a);
    const indexB = ordenCategorias.indexOf(b);

    const posA = indexA !== -1 ? indexA : Infinity;
    const posB = indexB !== -1 ? indexB : Infinity;

    if (posA !== posB) return posA - posB;
    return a.localeCompare(b, 'es');
  });

  categorias.forEach(cat => {
    const div = document.createElement('div');
    div.className = 'category-section';

    const h2 = document.createElement('h2');
    h2.className = `category-title ${cat.replace(/\s+/g, '-')}`;
    h2.innerHTML = `<a href="#" onclick="filterCategory('${cat}'); return false;">${cat}</a>`;

    if (cat === "Panificados Integrales") {
      const subTitle = document.createElement('span');
      subTitle.className = 'category-subtitle';
      subTitle.textContent = "Toda nuestra panaderia está elaborada con harinas integrales organicas, sin aditivos, conservantes, ni harinas blancas.";
      h2.appendChild(subTitle);
    }
    if (cat === "Productos Sueltos") {
      const subTitle = document.createElement('span');
      subTitle.className = 'category-subtitle';
      subTitle.textContent = "Todos nuestros productos vienen fraccionados en porciones. Si necesitas más, solo agregue mas unidades.";
      h2.appendChild(subTitle);
    }

    div.appendChild(h2);

    const productosCat = productos
      .filter(p => p.Categoria === cat)
      .sort(sortByRanking);

    if (currentFilter === cat) {

      let subcategorias = [...new Set(productosCat.map(p => p.SubCategoria || ''))];

      subcategorias.sort((a, b) => {
        const indexA = ordenSubCategorias.indexOf(a);
        const indexB = ordenSubCategorias.indexOf(b);

        const posA = indexA !== -1 ? indexA : Infinity;
        const posB = indexB !== -1 ? indexB : Infinity;

        if (posA !== posB) return posA - posB;
        return a.localeCompare(b, 'es');
      });

      subcategorias.forEach(sub => {
        const subDiv = document.createElement('div');
        subDiv.className = 'subcategory-section';

        const h3 = document.createElement('h3');
        h3.className = `subcategory-title ${sub.replace(/\s+/g, '-')}`;
        h3.textContent = sub;
        subDiv.appendChild(h3);

        const grid = document.createElement('div');
        grid.className = 'product-grid';

        const productosSub = productosCat.filter(p => (p.SubCategoria || '') === sub);
        productosSub.forEach(prod => grid.appendChild(createProductCard(prod)));

        const resto = productosSub.length % 5;
        if (resto !== 0) {
          for (let i = resto; i < 5; i++) {
            const vacio = document.createElement("div");
            vacio.className = "product espacio-vacio";
            grid.appendChild(vacio);
          }
        }
        subDiv.appendChild(grid);
        div.appendChild(subDiv);
      });

    } else {
      highlightSelected("Todas");
      const grid = document.createElement('div');
      grid.className = 'product-grid';

      const mostrar = productosCat.slice(0, 5);
      mostrar.forEach(prod => grid.appendChild(createProductCard(prod)));

      if (productosCat.length > 5) {
        const verMasBtn = createVerMasCard(cat);
        grid.appendChild(verMasBtn);
      }

      for (let i = mostrar.length; i < 5; i++) {
        const vacio = document.createElement("div");
        vacio.className = "product espacio-vacio";
        grid.appendChild(vacio);
      }

      div.appendChild(grid);
    }

    container.appendChild(div);
  });
}


function sortByRanking(a, b) {
  const rankA = rankingMap[a.Codigo] ?? Infinity; 
  const rankB = rankingMap[b.Codigo] ?? Infinity;

  if (rankA !== rankB) return rankA - rankB;  
  return a.Nombre.localeCompare(b.Nombre, 'es'); // Mantén esto si necesitas mantener orden alfabético
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
  const addressInput = document.getElementById('address');
  if (addressInput && addressInput.value.trim() && addressInput.value.trim().toUpperCase() !== 'A ACORDAR') {
    actualizarEnvio();
  } else {
    updateCart();
  }
  animateCart();
  // Oculta el mensaje de error del carrito si hay productos
  actualizarErrorCarrito();
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
  const addressInput = document.getElementById('address');
  if (addressInput && addressInput.value.trim() && addressInput.value.trim().toUpperCase() !== 'A ACORDAR') {
    actualizarEnvio();
  } else {
    updateCart();
  }
  animateCart();
  // Oculta el mensaje de error del carrito si hay productos
  actualizarErrorCarrito();
}

function removeFromCart(codigo) {
  delete cart[codigo];
  renderProductsByCategory(filteredProducts);
  const addressInput = document.getElementById('address');
  if (addressInput && addressInput.value.trim() && addressInput.value.trim().toUpperCase() !== 'A ACORDAR') {
    actualizarEnvio();
  } else {
    updateCart();
  }
  animateCart();
  // Oculta el mensaje de error del carrito si hay productos
  actualizarErrorCarrito();
}

// Nueva función para actualizar el mensaje de error del carrito
function actualizarErrorCarrito() {
  let carritoErrorDiv = document.getElementById('carrito-error');
  if (carritoErrorDiv) {
    if (Object.keys(cart).length > 0) {
      carritoErrorDiv.textContent = '';
      carritoErrorDiv.style.display = 'none';
      validacionCampos['carrito'] = true;
    }
    // Si el usuario ya intentó enviar y el carrito está vacío, el mensaje se mostrará en validarCamposEnTiempoReal
  }
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
          src="media/PRODUCTOS/${prod.Codigo}.jpg" 
          alt="${producto.Nombre}" 
          onerror="this.onerror=null; this.src='media/PRODUCTOS/placeholder.jpg';"
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

  // actualizar flag de pedido mínimo
  pedidoMinimo = subtotal >= cantidadMinima;

  // El costo de envío se calcula en actualizarEnvio, aquí solo se muestra
  const envio = costoEnvioActual;
  const total = subtotal + envio;

  const totalEl = document.getElementById('total');
  const countEl = document.getElementById('cart-count');
  if (totalEl) totalEl.textContent = total;
  if (countEl) countEl.textContent = count;

  // opcional: mostrar resumen
  const resumen = document.getElementById('cart-summary');
  if (resumen) {
    resumen.innerHTML = `
      <p>Subtotal: $${subtotal}</p>
      <p>Envío: $${envio}</p>
      <p><strong>Total: $${total}</strong></p>
    `;
  }
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


let timeoutEnvio; // para evitar llamadas repetidas
let ultimaDireccionConsultada = "";
let ultimoResultadoEnvio = null;

function initAutocomplete() {
  const input = document.getElementById('address');
  const bounds = new google.maps.LatLngBounds(
    { lat: -34.705, lng: -58.531 },
    { lat: -34.515, lng: -58.335 }
  );

  autocomplete = new google.maps.places.Autocomplete(input, {
    fields: ['formatted_address', 'geometry'],
    componentRestrictions: { country: "ar" }
  });

  autocomplete.setBounds(bounds);
  autocomplete.setOptions({ strictBounds: false }); 

  // Cuando el usuario elige una dirección de la lista
  autocomplete.addListener('place_changed', () => {
    const place = autocomplete.getPlace && autocomplete.getPlace();
    if (place && place.formatted_address && place.geometry) {
      direccionValidaGoogle = true;
      camposTocados['address'] = true;
      validarDireccionSolo();

      // Espera 2 segundos antes de llamar a la API (evita múltiples llamadas)
      clearTimeout(timeoutEnvio);
      timeoutEnvio = setTimeout(() => {
        const destino = place.formatted_address.trim();
        actualizarEnvioConCache(destino);
      }, 2000);

      updateCart();
    } else {
      direccionValidaGoogle = false;
    }
  });
}

function actualizarEnvioConCache(destino) {
  // Si el destino es el mismo que el último calculado y tenemos caché, reutilizamos el resultado
  if (destino === ultimaDireccionConsultada && ultimoResultadoEnvio) {
    const { costo, msg, color } = ultimoResultadoEnvio;
    costoEnvioActual = costo;
    mostrarMensajeEnvio(msg, color);
    updateCart();
    return;
  }

  // Calcular subtotal igual que en actualizarEnvio()
  let subtotal = 0;
  for (let codigo in cart) {
    const producto = products.find(p => p.Codigo === codigo);
    const cantidad = cart[codigo];
    subtotal += producto.Precio * cantidad;
  }

  // Llamar a la API solo si no está en caché
  calcularCostoEnvio(destino, subtotal, function(costo, mensaje, color) {
    // Guardar en caché
    ultimaDireccionConsultada = destino;
    ultimoResultadoEnvio = { costo, msg: mensaje, color };

    // Mostrar resultado
    costoEnvioActual = costo;
    mostrarMensajeEnvio(mensaje, color);
    updateCart();
  });
}

function calcularCostoEnvio(destino, subtotal, callback) {
  if (!destino || destino.trim().toUpperCase() === 'A ACORDAR') {
    callback(0, 'Dirección A ACORDAR. El costo de envío se definirá al confirmar el pedido.', 'orange');
    return;
  }

  const service = new google.maps.DistanceMatrixService();

  service.getDistanceMatrix({
    origins: [LOCAL_ADDRESS],
    destinations: [destino],
    travelMode: 'DRIVING'
  }, (response, status) => {
    if (status !== 'OK' || !response.rows?.[0]?.elements?.[0]) {
      callback(0, 'Error al calcular distancia.', 'red');
      return;
    }

    const element = response.rows[0].elements[0];
    if (element.status !== 'OK') {
      callback(0, 'No se puede entregar a esa dirección.', 'red');
      return;
    }

    const km = element.distance.value / 1000;
    const kmRedondeado = Math.ceil(km * 10) / 10;

    let costo = 0;
    let msg = '';
    let color = 'green';
    let costo_oferta = 0;

    // Rangos de costo
    if (km <= 1) costo_oferta = 1000;
    else if (km <= 2) costo_oferta = 1500;
    else if (km <= 3) costo = 1500;
    else if (km <= 4) costo = 2000;
    else if (km <= 5) costo = 2500;
    else if (km <= 6) costo = 3500;
    else if (km <= 7) costo = 4500;
    else if (km <= 8) costo = 5500;
    else if (km <= 9) costo = 6500;
    else if (km <= 10) costo = 7000;
    else {
      msg = `🛑 Fuera del rango de entrega (distancia ${kmRedondeado} km) <a href="https://wa.me/5491150168920?text=Hola! Vengo de la página web" target="_blank">Escribinos y acordamos un precio!</a>`;
      color = 'red';
      costo = 0;
    }

    if ((subtotal >= cantidadMinima) || (costo == 0)) {
      callback(0, msg || `🚚 ENVÍO GRATIS <del>$${costo + costo_oferta}</del> ➜ SIN COSTO`, color);
    } else {
      callback(costo, msg || `🚚 Costo envío: $${costo} (envío gratis compras superiores a $${cantidadMinima})`, color);
    }
  });
}


function actualizarEnvio() {
  const input = document.getElementById('address');
  const destino = (autocomplete && autocomplete.getPlace() && autocomplete.getPlace().formatted_address) ? autocomplete.getPlace().formatted_address : input.value;
  let subtotal = 0;
  for (let codigo in cart) {
    const producto = products.find(p => p.Codigo === codigo);
    const cantidad = cart[codigo];
    subtotal += producto.Precio * cantidad;
  }
  calcularCostoEnvio(destino, subtotal, function(costo, mensaje, color) {
    costoEnvioActual = costo;
    mostrarMensajeEnvio(mensaje, color);
    updateCart();
  });
}


function mostrarMensajeEnvio(texto, color) {
  const envioMsg = document.getElementById('envio-msg');
  if (envioMsg) {
    envioMsg.innerHTML = texto;
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

// Variables globales para el estado de validación de cada campo
const validacionCampos = {
  'pickup-day': false,
  'name': false,
  'email': false,
  'phone': false,
  'address': false,
  'comment': false,
  'carrito': false
};

// Nuevo: trackea si el usuario ya tocó el campo
const camposTocados = {
  'pickup-day': false,
  'name': false,
  'email': false,
  'phone': false,
  'address': false,
  'comment': false
};

// Nuevo: para saber si el usuario intentó enviar el formulario
let intentoEnviar = false;

// Validación en tiempo real: mensajes debajo de cada campo y borde rojo si hay error
function validarCamposEnTiempoReal() {
  const campos = [
    { id: 'pickup-day', nombre: 'Día de retiro', validar: v => !!v, mensaje: 'Seleccione un día de retiro.' },
    { id: 'name', nombre: 'Nombre', validar: v => !!v && v.indexOf(' ') !== -1, mensaje: 'Ingrese su nombre completo.' },
    { id: 'email', nombre: 'Email', validar: v => !!v && v.indexOf('@') !== -1 && v.indexOf('.') !== -1, mensaje: 'Ingrese un mail válido.' },
    { id: 'phone', nombre: 'Teléfono', validar: v => !!v && v.length >= 8, mensaje: 'Ingrese un teléfono válido.' },
    { id: 'comment', nombre: 'Comentario', validar: v => !!v, mensaje: 'Ingrese un comentario.' }
  ];

  let hayError = false;

  campos.forEach(campo => {
    const el = document.getElementById(campo.id);
    if (!el) return;
    let valor = el.value.trim();
    let errorMsg = '';

    // Mostrar error si el usuario ya tocó el campo (blur/change) o intentó enviar, y el campo NO es válido
    let mostrarError = (camposTocados[campo.id] || intentoEnviar) && !campo.validar(valor);
    let esValido = campo.validar(valor);

    el.classList.remove('input-error', 'input-success');
    if (!esValido) {
      if (mostrarError) {
        errorMsg = campo.mensaje;
        hayError = true;
        el.classList.add('input-error');
        validacionCampos[campo.id] = false;
      } else {
        validacionCampos[campo.id] = false;
      }
    } else {
      el.classList.add('input-success');
      validacionCampos[campo.id] = true;
    }

    // --- CAMBIO SOLO PARA pickup-day ---
    if (campo.id === 'pickup-day') {
      // Buscar el div.inputs más cercano al select (si existe)
      let parentInputs = el.closest('.inputs');
      // Si no hay, crear uno alrededor del select
      if (!parentInputs) {
        // Si el select no está dentro de un div.inputs, lo envolvemos
        let wrapper = document.createElement('div');
        wrapper.className = 'inputs';
        el.parentNode.insertBefore(wrapper, el);
        wrapper.appendChild(el);
        parentInputs = wrapper;
      }
      let errorDiv = parentInputs.querySelector('.campo-error');
      if (!errorDiv) {
        errorDiv = document.createElement('div');
        errorDiv.className = 'campo-error';
        parentInputs.appendChild(errorDiv);
      }
      errorDiv.textContent = mostrarError ? errorMsg : '';
      errorDiv.style.display = mostrarError ? 'block' : 'none';
      return; // No seguir con el resto para pickup-day
    }
    // --- FIN CAMBIO pickup-day ---

    // Mensaje debajo del campo, dentro del div.inputs
    let parentInputs = el.closest('.inputs') || el.parentNode;
    let errorDiv = parentInputs.querySelector('.campo-error');
    if (!errorDiv) {
      errorDiv = document.createElement('div');
      errorDiv.className = 'campo-error';
      parentInputs.appendChild(errorDiv);
    }
    errorDiv.textContent = mostrarError ? errorMsg : '';
    errorDiv.style.display = mostrarError ? 'block' : 'none';
  });

  // Validar dirección solo si ya se tocó (blur/change) o intentó enviar
  validarDireccionSolo();

  // Validar carrito solo si el usuario intentó enviar
  let carritoErrorDiv = document.getElementById('carrito-error');
  if (!carritoErrorDiv) {
    carritoErrorDiv = document.createElement('div');
    carritoErrorDiv.id = 'carrito-error';
    carritoErrorDiv.style.color = 'red';
    carritoErrorDiv.style.margin = '4px 0 0 0';
    const form = document.getElementById('pedido-form') || document.getElementById('cart');
    form.appendChild(carritoErrorDiv);
  }
  // Mostrar mensaje solo si el usuario intentó enviar y el carrito está vacío
  if (intentoEnviar && Object.keys(cart).length === 0) {
    carritoErrorDiv.textContent = 'Agregue productos al carrito.';
    hayError = true;
    validacionCampos['carrito'] = false;
    carritoErrorDiv.style.display = 'block';
  } else {
    carritoErrorDiv.textContent = '';
    validacionCampos['carrito'] = Object.keys(cart).length > 0;
    carritoErrorDiv.style.display = 'none';
  }

  // Habilitar/deshabilitar el botón de envío
  const btn = document.getElementById('submit-btn');
  if (btn) btn.disabled = hayError;

  return !hayError;
}

// ...existing code...

// Asignar eventos a los campos para validar en tiempo real
document.addEventListener('DOMContentLoaded', () => {
  const campos = [
    'pickup-day', 'name', 'email', 'phone', 'address', 'comment'
  ];
  campos.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      if (id === 'address') {
        // Solo marcar como tocado y validar al perder foco o cambiar
        el.addEventListener('blur', function() {
          camposTocados['address'] = true;
          validarDireccionSolo();
        });
        el.addEventListener('change', function() {
          camposTocados['address'] = true;
          validarDireccionSolo();
        });
        el.addEventListener('input', function() {
          validarDireccionSolo();
        });
      } else {
        el.addEventListener('blur', function() {
          camposTocados[id] = true;
          validarCamposEnTiempoReal();
        });
        el.addEventListener('change', function() {
          camposTocados[id] = true;
          validarCamposEnTiempoReal();
        });
        el.addEventListener('input', function() {
          validarCamposEnTiempoReal();
        });
      }
    }
  });
  // No validar automáticamente al cargar
});

// Validar dirección solo cuando corresponde
function validarDireccionSolo() {
  const el = document.getElementById('address');
  if (!el) return;
  let valor = el.value.trim();
  let errorMsg = '';
  // Permitir "A ACORDAR"
  if (valor.toUpperCase() === 'A ACORDAR') {
    direccionValidaGoogle = true;
  }
  // Mostrar error si el usuario ya tocó el campo (blur/change) o intentó enviar, y el campo NO es válido
  let mostrarError = (camposTocados['address'] || intentoEnviar) && !direccionValidaGoogle;
  el.classList.remove('input-error', 'input-success');
  if (!direccionValidaGoogle) {
    if (mostrarError) {
      errorMsg = 'Seleccione una dirección válida.';
      el.classList.add('input-error');
      validacionCampos['address'] = false;
    } else {
      validacionCampos['address'] = false;
    }
  } else {
    el.classList.add('input-success');
    validacionCampos['address'] = true;
  }
  // Mensaje debajo del campo, dentro del div.inputs
  let parentInputs = el.closest('.inputs') || el.parentNode;
  let errorDiv = parentInputs.querySelector('.campo-error');
  if (!errorDiv) {
    errorDiv = document.createElement('div');
    errorDiv.className = 'campo-error';
    parentInputs.appendChild(errorDiv);
  }
  errorDiv.textContent = mostrarError ? errorMsg : '';
  errorDiv.style.display = mostrarError ? 'block' : 'none';

  // Habilitar/deshabilitar el botón de envío
  const btn = document.getElementById('submit-btn');
  if (btn) btn.disabled = !todosCamposValidados();
}

function todosCamposValidados() {
  return Object.values(validacionCampos).every(v => v === true);
}

function enviarPedido() {
  intentoEnviar = true;
  validarCamposEnTiempoReal();
  if (!todosCamposValidados()) return;

  const btn = document.getElementById('submit-btn');
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

  // Usar dirección validada por Google si existe
  let direccion = document.getElementById('address').value.trim();
  if (autocomplete && autocomplete.getPlace && autocomplete.getPlace() && autocomplete.getPlace().formatted_address) {
    direccion = autocomplete.getPlace().formatted_address;
  }

  const pedido = {
    nombre: document.getElementById('name').value.trim(),
    mail: document.getElementById('email').value.trim(),
    telefono: document.getElementById('phone').value.trim(),
    direccion: direccion,
    retiro: document.getElementById('pickup-day').value,
    comentario: document.getElementById('comment').value.trim(),
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
    alert('Pedido enviado con éxito! Recibirá al mail instrucciones de pago.');
    // --- VACIAR TODO EL CARRITO ---
    cart = {};                      // borra los productos seleccionados
    filteredProducts = [...products]; // resetear listado de productos
    renderProductsByCategory(filteredProducts);
    mostrarMensajeEnvio('', 'black');
    costoEnvioActual = 0;
    updateCart();

    // Limpiar campos del formulario
    document.getElementById('name').value = '';
    document.getElementById('email').value = '';
    document.getElementById('phone').value = '';
    document.getElementById('address').value = '';
    document.getElementById('pickup-day').value = '';
    document.getElementById('comment').value = '';

    desbloquearBoton(btn);
    intentoEnviar = false; // reset para el próximo pedido
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
  img.src = `media/PRODUCTOS/${prod.Codigo}.jpg`;
  img.alt = prod.Nombre;
  img.onerror = function() {
    this.onerror = null;
    this.src = 'media/PRODUCTOS/placeholder.jpg';
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

  // Crear overlay si no existe
  let overlay = document.querySelector('.zoom-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'zoom-overlay';
    document.body.appendChild(overlay);
  }
  overlay.classList.add('open');

  // Crear botón cerrar si no existe
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

  // Posición inicial: justo sobre la imagen original
  const rect = original.getBoundingClientRect();
  clone.style.transition = 'none';
  clone.style.position = 'fixed';
  clone.style.top = rect.top + 'px';
  clone.style.left = rect.left + 'px';
  clone.style.width = rect.width + 'px';
  clone.style.height = rect.height + 'px';
  clone.style.margin = 0;

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

  // Posición final centrada en viewport
  const finalTop = (vh - finalHeight) / 2;
  const finalLeft = (vw - finalWidth) / 2;

  // Animar clon a tamaño y posición final
  setTimeout(() => {
    clone.style.transition = 'top 0.3s ease, left 0.3s ease, width 0.3s ease, height 0.3s ease, border-radius 0.3s ease';
    
    const finalTop = (window.innerHeight - finalHeight) / 2;
    const finalLeft = (window.innerWidth - finalWidth) / 2;
    clone.style.top = finalTop + 'px';
    clone.style.left = finalLeft + 'px';
    clone.style.width = finalWidth + 'px';
    clone.style.height = finalHeight + 'px';
  }, 20);

  // Función para cerrar zoom
  function closeZoom(cloneImg) {
    cloneImg.style.top = rect.top + 'px';
    cloneImg.style.left = rect.left + 'px';
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
  const clickHeader = document.getElementById('click_header');
  const botonContacto = document.getElementById("btn-contacto-tienda");
  if (searchInput) {
    searchInput.addEventListener('input', () => searchProduct());
  }
  if (clickHeader) {
    clickHeader.onclick = () => {
      indiceCategoria = '';
      currentFilter = 'Todas';
      filteredProducts = [...products];
      renderProductsByCategory(filteredProducts);
    };
  }
  if (botonContacto) {
    botonContacto.classList.toggle("oculto");
  }

}
