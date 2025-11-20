// =======================
//  SYNC PRODUCTOS COMPLETO
// =======================

const { google } = require("googleapis");
const fs = require("fs");
const path = require("path");
const csv = require("csv-parser");

// ----- AUTENTICACIÓN -----
const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GCP_SA_KEY),
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

const sheets = google.sheets({ version: "v4", auth });

// ----- CONFIGURACIÓN -----
const SPREADSHEET_ID = process.env.SHEET_ID;
const PRODUCT_RANGE = "Hoja1!A1:Z20000";

console.log("Leyendo Google Sheets…");

// ---------------------------
// HELPERS
// ---------------------------

function clean(value) {
  if (!value) return "";
  return String(value).replace(/<[^>]*>/g, "").trim();
}

function parsePrecio(valor) {
  if (!valor) return 0;
  const s = clean(valor).replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

function loadHabilitados() {
  const p = "media/Habilitados.json";
  if (!fs.existsSync(p)) return [];
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function loadRanking() {
  return new Promise((resolve) => {
    const file = "media/Ranking.csv";
    if (!fs.existsSync(file)) return resolve({});

    const rankingMap = {};
    fs.createReadStream(file)
      .pipe(csv({ separator: ";" }))
      .on("data", (row) => {
        const r = Number(row["Ranking"]);
        const nombre = row["Producto"];
        if (r && nombre) rankingMap[nombre.trim()] = r;
      })
      .on("end", () => resolve(rankingMap));
  });
}

// ==========================
//     PROCESO PRINCIPAL
// ==========================
(async () => {
  try {
    const habilitados = loadHabilitados();
    console.log("Habilitados:", habilitados.length);

    const rankingByName = await loadRanking();
    console.log("Ranking cargado:", Object.keys(rankingByName).length);

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

    const header = rows.shift().map(h => clean(h));

    const json = rows.map(row => {
      const data = {};
      header.forEach((h, i) => data[h] = clean(row[i]));

      const codigo =
        data["CODIGO BARRA"]?.trim() ||
        data["ID"]?.trim() ||
        "";

      if (!codigo) return null;

      const nombre =
        data["DESCRIPCION LARGA"] ||
        data["DESCRIPCION"] ||
        "";

      const isHabilitado = habilitados.includes(codigo);

      const ranking =
        rankingByName[nombre.trim()] ??
        999999;

      return {
        Codigo: codigo,
        Nombre: nombre,
        Descripcion: data["DESCRIPCION ADICIONAL"] || "",
        Categoria: data["RUBRO"] || "",
        SubCategoria: data["SUBRUBRO"] || "",
        Precio: parsePrecio(data["PRECIO VENTA C/IVA"]),
        Proveedor: data["PROVEEDOR"] || "",
        ImagenURL: `/media/PRODUCTOS/${codigo}.jpg`,
        Habilitado: isHabilitado,
        Ranking: ranking,
        Orden: ranking // mismo valor
      };
    }).filter(Boolean);

    json.sort((a, b) => a.Ranking - b.Ranking);

    fs.writeFileSync("products.json", JSON.stringify(json, null, 2));
    console.log("products.json generado con", json.length, "productos");

  } catch (err) {
    console.error("ERROR:", err);
    process.exit(1);
  }
})();
