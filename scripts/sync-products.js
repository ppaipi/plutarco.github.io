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

// PARSEADOR DE PRECIOS
function parsePrecio(valor) {
  if (!valor) return 0;
  return Number(String(valor).replace(".", "").replace(",", "."));
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
      return;
    }

    const header = rows.shift();
    const json = rows.map((row) => {
      const data = {};
      header.forEach((h, i) => {
        data[h] = row[i];
      });

      return {
        Codigo: (data["CODIGO BARRA"] || "").toString().trim(),
        Nombre: data["DESCRIPCION LARGA"] || "",
        Descripcion: data["DESCRIPCION ADICIONAL"] || "",
        Categoria: data["RUBRO"] || "",
        SubCategoria: data["SUBRUBRO"] || "",
        Precio: parsePrecio(data["PRECIO VENTA C/IVA"]),
        Proveedor: data["PROVEEDOR"] || "",
      };
    });

    // GUARDAR ARCHIVOS ========================

    fs.writeFileSync("products.json", JSON.stringify(json, null, 2));
    console.log("products.json actualizado!");

    // habilitados.json SI YA EXISTE, NO SE SOBRESCRIBE
    if (!fs.existsSync("habilitados.json")) {
      fs.writeFileSync("habilitados.json", "[]");
    }

    // ranking.csv SI YA EXISTE, NO SE SOBRESCRIBE
    if (!fs.existsSync("ranking.csv")) {
      fs.writeFileSync("ranking.csv", "Ranking;Producto\n");
    }

    console.log("Listo!");

  } catch (err) {
    console.error("ERROR:", err);
    process.exit(1);
  }
})();
