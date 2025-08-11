function doPost(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    const data = {};
    for (let key in e.parameter) {
      if (key === 'productos') {
        try {
          data.productos = JSON.parse(e.parameter.productos);
        } catch {
          data.productos = [];
        }
      } else {
        data[key] = e.parameter[key];
      }
    }

    const hoja = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    const encabezados = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];

    // Mapeo de código de producto => encabezado de columna
    const productoToHeader = {
      PLUT0014: 'Prepizza Integral',
      PLUT0007: 'Pan integral con semillas',
      PLUT9999: 'Pan integral SIN SAL',
      PLUT0009: 'Pan de Centeno (SOLO LOS LUNES)',
      PLUT0008: 'Pan de oliva y sal marina',
      PLUT0005: 'Granola x Kg',
      PLUT0002: 'Chapati',
      PLUT0004: 'Galletón frutos secos',
      PLUT0052: 'Galletón de membrillo',
      PLUT0051: 'Galletón chips de chocolate',
      PLUT0013: 'Pepas de membrillo orgánico (200g aprox.)',
      PLUT0050: 'Pepas chips de chocolate semiamargo (200g aprox)',
      PLUT0010: 'Pan de Sarraceno',
      PLUT998: '1/2 Pan de Sarraceno',
      PLUT999: 'Pan Vollkorn ',
      PLUT0006: 'Pan de Arroz Yamaní',
      PLUT0015: 'Prepizza de arroz yamaní',
      PLUT0001: 'Budín vegano',
      PLUT0016: 'Torta Galesa vegana',
      PLUT0003: 'Cortezas x Kg',
      PLUT0020: 'Cortezas x 500g',
      PLUT0021: 'Cortezas x 250g',
      PLUT0017: 'Cortezas x 100g',
      PLUT0053: 'Cortezas de Eneldo y Cebolla x 100g',
      PLUT0030: 'Pan dulce Grande (950g aprox.)',
      PLUT0031: 'Pan dulce pequeño (350g aprox.)'
    };

    const productosMap = {};
    for (const item of data.productos) {
      // Esperamos: "Budín vegano x2u ($13000)"
      const match = item.match(/^(.+?)\s+x(\d+)u/i);
      if (match) {
        const nombreProducto = match[1].trim();
        const cantidad = parseInt(match[2].trim());
        productosMap[nombreProducto] = cantidad;
      }
    }

    const fila = [];

    for (let i = 0; i < encabezados.length; i++) {
      const header = encabezados[i];

      switch (header.trim()) {
        case 'Marca temporal':
          fila.push(new Date());
          break;
        case 'Dirección de correo electrónico':
          fila.push(data.mail || '');
          break;
        case 'Nombre del Local':
          fila.push(data.nombre || '');
          break;
        default:
          fila.push(productosMap[header.trim()] || '');
      }
    }

    hoja.appendRow(fila);

    // --- EMAIL ---
const subject = 'Pedido Recibido! Plutarco Almacen 🌵';
const body = `
<div style="max-width: 600px; margin: 20px auto; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; background: #ffffff; padding: 25px; border-radius: 16px; box-shadow: 0 4px 15px rgba(0,0,0,0.08);">

  <h2 style="text-align:center; color: #222; margin-bottom: 20px;">🛍️ Detalles del Pedido | Plutarco Almacen 🥖</h2>

  <div style="background: #f7f9fc; padding: 15px 20px; border-radius: 10px; margin-bottom: 20px; border: 1px solid #e3e6eb;">
    <p style="margin: 8px 0;"><strong>Nombre:</strong> ${data.nombre}</p>
    <p style="margin: 8px 0;"><strong>Email:</strong> ${data.mail}</p>
  </div>

  <h3 style="margin-top: 0; color: #444; border-bottom: 2px solid #e3e6eb; padding-bottom: 8px;">🧾 Productos:</h3>
  <ul style="padding-left: 20px; margin-top: 10px; margin-bottom: 20px;">
    ${data.productos ? data.productos.map(p => `<li style="margin-bottom: 6px;">${p}</li>`).join('') : ''}
  </ul>

  <div style="margin-top: 20px; padding: 15px; background: #f7f9fc; border-radius: 10px; border: 1px solid #e3e6eb;">
    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
      <span style="color: #555;">Total:</span>
      <span style="font-size: 20px; font-weight: bold; color: #000;">$${data.total}</span>
    </div>
  </div>


  <div style="margin-top: 30px; background: #e2e3e5; padding: 14px; border-left: 5px solid #6c757d; border-radius: 8px;">
    <p>⚠️ En caso de no contar con stock de algún producto, se te descontará del total pedido.</p>
  </div>

</div>
`;


    MailApp.sendEmail({
      to: data.mail,
      subject,
      htmlBody: body
    });

    output.setContent(JSON.stringify({ status: 'ok' }));
    return output;

  } catch (err) {
    output.setContent(JSON.stringify({ status: 'error', message: err.message }));
    return output;
  }
}
