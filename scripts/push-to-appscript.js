// =====================================
//  PUSH PRODUCTS TO GOOGLE APPS SCRIPT
// =====================================

const fs = require("fs");
const fetch = require("node-fetch");

// URL de tu Apps Script (inyectado por GitHub Actions)
const WEBAPP_URL = process.env.WEBAPP_URL;

if (!WEBAPP_URL) {
  console.error("ERROR: Falta el secreto WEBAPP_URL");
  process.exit(1);
}

console.log("Leyendo products.json / habilitados.json / ranking.csv...");

// -------------------------
// 1) Cargar archivos locales
// -------------------------

const products = JSON.parse(fs.readFileSync("products.json", "utf8"));

const habilitados = fs.existsSync("habilitados.json")
  ? JSON.parse(fs.readFileSync("habilitados.json", "utf8"))
  : [];

const rankingCSV = fs.existsSync("ranking.csv")
  ? fs.readFileSync("ranking.csv", "utf8")
  : "";


// -------------------------
// 2) Convertir ranking.csv a objeto { nombre → orden }
// -------------------------

let rankingMap = {};

if (rankingCSV.trim() !== "") {
  const lines = rankingCSV.split("\n").slice(1); // descarta encabezado Ranking;Producto
  lines.forEach((line) => {
    const [orden, nombre] = line.split(";");
    if (!orden || !nombre) return;
    rankingMap[nombre.trim()] = Number(orden);
  });
}


// -------------------------
// 3) Mezclar info en cada producto
// -------------------------

const finalProducts = products.map((p) => {
  const codigo = p.Codigo || "";
  const enabled = habilitados.includes(codigo);

  const order = rankingMap[p.Nombre] || 999999;

  return {
    ...p,
    ImagenURL: `media/PRODUCTOS/${codigo}.jpg`,
    Habilitado: enabled,
    Orden: order,
  };
});


// -------------------------
// 4) Enviar todo al Apps Script
// -------------------------

console.log("Enviando productos a Apps Script...");

fetch(WEBAPP_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ products: finalProducts }),
})
  .then(res => res.text())
  .then(text => {
    console.log("Respuesta del servidor:");
    console.log(text);
  })
  .catch((err) => {
    console.error("ERROR al enviar:", err);
    process.exit(1);
  });
