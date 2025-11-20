// scripts/sync-products.js
const fs = require('fs');
const { google } = require('googleapis');

async function main() {
  const sheetId = process.env.SHEET_ID;
  const credentials = JSON.parse(process.env.GCP_SA_KEY);

  const auth = new google.auth.JWT(
    credentials.client_email,
    null,
    credentials.private_key,
    ['https://www.googleapis.com/auth/spreadsheets.readonly']
  );

  const sheets = google.sheets({ version: 'v4', auth });

  // LEER HOJA1 COMPLETA
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: 'Hoja1!A1:Z20000'
  });

  const rows = res.data.values;
  if (!rows || rows.length === 0) {
    console.log("⚠ No hay datos en Sheets");
    fs.writeFileSync('products.json', '[]');
    return;
  }

  const headers = rows[0];
  const data = rows.slice(1);

  const index = (name) => headers.indexOf(name);

  const list = data.map(r => ({
    Codigo: r[index("CODIGO BARRA")] || "",
    Nombre: r[index("DESCRIPCION LARGA")] || "",
    Descripcion: r[index("DESCRIPCION ADICIONAL")] || "",
    Categoria: r[index("RUBRO")] || "",
    SubCategoria: r[index("SUBRUBRO")] || "",
    Precio: parseFloat((r[index("PRECIO VENTA C/IVA")] || "0").replace(",", ".")) || 0,
    Proveedor: r[index("PROVEEDOR")] || "",
    Habilitado: true,
    Orden: 999999,
    ImagenURL: `/media/PRODUCTOS/${(r[index("CODIGO BARRA")] || "").trim()}.jpg`
  }));

  fs.writeFileSync('products.json', JSON.stringify(list, null, 2));
  console.log("✔ products.json actualizado correctamente");
}

main().catch(e => console.error(e));
