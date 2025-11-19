// =========================
// CONFIGURACIÓN FIREBASE
// =========================
const firebaseConfig = {
  apiKey: "AIzaSyCGuA_RkvEUptmUHO4YOAzr9qRKtK1cNDQ",
  authDomain: "plutarcodelivery-cf6cb.firebaseapp.com",
  projectId: "plutarcodelivery-cf6cb",
  storageBucket: "plutarcodelivery-cf6cb.firebasestorage.app",
  messagingSenderId: "714627263776",
  appId: "1:714627263776:web:3ee0e4fc657a6c12e37b45",
  measurementId: "G-99MNS9JHQN"
};

firebase.initializeApp(firebaseConfig);
const storage = firebase.storage();


// =========================
// GOOGLE SHEETS API
// =========================
const API_URL = "https://script.google.com/macros/s/AKfycbweNzPe4gwxiH9tP4LyObsYbOlOqshemkYlDcpw9-IT6u17lXgfceElMcOIKQDNbhXE/exec"; // <-- PONELA ACA


// =========================
// VARIABLES
// =========================
let productos = [];


// =========================
// IMPORTAR EXCEL
// =========================
document.getElementById("excel-input").addEventListener("change", handleExcel);

function handleExcel(event) {
  let file = event.target.files[0];

  let reader = new FileReader();
  reader.onload = function(e) {
    let data = new Uint8Array(e.target.result);
    let workbook = XLSX.read(data, {type: 'array'});

    let sheet = workbook.Sheets[workbook.SheetNames[0]];
    productos = XLSX.utils.sheet_to_json(sheet);

    renderProductos();
  };
  reader.readAsArrayBuffer(file);
}


// =========================
// MOSTRAR PRODUCTOS
// =========================
function renderProductos() {
  const cont = document.getElementById("product-list");
  cont.innerHTML = "";

  productos.forEach((p, index) => {

    let div = document.createElement("div");
    div.className = "product-item";

    div.innerHTML = `
      <img src="${p.ImagenURL || ''}" id="img-${index}">

      <input type="text" value="${p.Nombre}" onchange="updateField(${index}, 'Nombre', this.value)">
      <input type="number" value="${p.Precio}" onchange="updateField(${index}, 'Precio', this.value)">
      
      <input type="text" value="${p.Categoría}" onchange="updateField(${index}, 'Categoría', this.value)">
      
      <button onclick="uploadImage(${index})">Subir foto</button>
    `;

    cont.appendChild(div);
  });
}

function updateField(index, field, value) {
  productos[index][field] = value;
}


// =========================
// SUBIR IMAGEN A FIREBASE
// =========================
function uploadImage(index) {
  let input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";

  input.onchange = e => {
    let file = e.target.files[0];
    let ref = storage.ref().child("productos/" + Date.now() + "_" + file.name);

    ref.put(file).then(() => {
      ref.getDownloadURL().then(url => {
        productos[index].ImagenURL = url;
        document.getElementById("img-" + index).src = url;
      });
    });
  };

  input.click();
}


// =========================
// GUARDAR EN GOOGLE SHEETS
// =========================
document.getElementById("save-btn").onclick = saveToSheets;

function saveToSheets() {
  fetch(API_URL + "?save=1", {
    method: "POST",
    body: JSON.stringify(productos)
  })
  .then(r => r.text())
  .then(res => {
    alert("Productos guardados correctamente");
  });
}
