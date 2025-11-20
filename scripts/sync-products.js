// =======================
//  SYNC PRODUCTOS
// =======================

const { google } = require("googleapis");
const fs = require("fs");

// ----- AUTENTICACIÓN -----
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GCP_SA_KEY),
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

const sheets = google.sheets({ version: "v4", auth });

// ----- CONFIGURACIÓN -----
const SPREADSHEET_ID = process.env.SHEET_ID;
const PRODUCT_RANGE = "Hoja1!A1:Z20000"; // lee 20.000 filas

console.log("Leyendo hoja de cálculo…");

// ---------------------------
// HELPERS
// ---------------------------

// limpia HTML accidental (<b>, <i>, tags invisibles)
function clean(value) {
  if (!value) return "";
  return String(value).replace(/<[^>]*>/g, "").trim();
}

// parsea precio europeo: 3.200,50
function parsePrecio(valor) {
  if (!valor) return 0;
  const s = clean(valor).replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

(async () => {
  try {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: PRODUCT_RANGE,
    });

    const rows = res.data.values;
    if (!rows || rows.length === 0) {
      console.error("No existe data en la hoja");
      fs.writeFileSync("products.json", "[]");
      return;
    }

    const header = rows.shift().map(h => clean(h)); // limpiar headers
    const json = rows.map((row) => {
      const data = {};
      header.forEach((h, i) => {
        data[h] = clean(row[i]);  // limpiar HTML en cada celda
      });

      // --- Mapeo robusto ---
      const codigo =
        data["CODIGO BARRA"]?.trim() ||
        data["ID"]?.trim() ||
        "";

      if (!codigo) return null; // ignorar filas vacías

      const nombre =
        data["DESCRIPCION LARGA"] ||
        data["DESCRIPCION"] ||
        "";

      return {
        Codigo: codigo,
        Nombre: nombre,
        Descripcion: data["DESCRIPCION ADICIONAL"] || "",
        Categoria: data["RUBRO"] || "",
        SubCategoria: data["SUBRUBRO"] || "",
        Precio: parsePrecio(data["PRECIO VENTA C/IVA"]),
        Proveedor: data["PROVEEDOR"] || "",
        ImagenURL: `/media/PRODUCTOS/${codigo}.jpg`,
        Habilitado: false,
        Orden: 999999
      };
    }).filter(x => x !== null);

    // GUARDAR ARCHIVOS ========================

    fs.writeFileSync("products.json", JSON.stringify(json, null, 2));
    console.log("products.json actualizado! Productos:", json.length);

    // habilitados.json SI YA EXISTE, NO SE SOBRESCRIBE
    if (!fs.existsSync("media/Habilitados.json")) {
      fs.writeFileSync("media/Habilitados.json", "[]");
    }

    // ranking.csv SI YA EXISTE, NO SE SOBRESCRIBE
    if (!fs.existsSync("media/Ranking.csv")) {
      fs.writeFileSync("media/Ranking.csv", "Ranking;Producto\n");
    }

    console.log("Listo!");

  } catch (err) {
    console.error("ERROR:", err);
    process.exit(1);
  }
})();
