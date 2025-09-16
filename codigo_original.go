function doPost(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    // 🔹 Leer JSON enviado desde form-data
    const data = JSON.parse(e.parameter.data);

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();

    // 🔹 Convertir productos a string para la planilla
    const productosStr = Array.isArray(data.productos)
      ? data.productos.map(p => `${p.nombre} x${p.unidades} ($${p.total})`).join(', ')
      : '';

    // 🔹 Guardar fila en la planilla
    sheet.appendRow([
      new Date(),
      data.nombre || '',
      data.mail || '',
      data.telefono || '',
      data.direccion || '',
      data.comentario || '',
      productosStr,
      data.subtotal || 0,
      data.envio || 0,
      data.total || 0,
      data.retiro || '',
      "FALSE"
    ]);

    // 🔹 Crear HTML de productos para el mail
    const productosHTML = Array.isArray(data.productos)
      ? `<ul style="padding-left: 20px; margin-top: 10px; margin-bottom: 20px;">
          ${data.productos.map(p => `<li style="margin-bottom:6px;">${p.nombre} x${p.unidades} ($${p.total})</li>`).join('')}
        </ul>`
      : '';

    // 🔹 Generar mail
    const subject = 'Pedido Recibido! Plutarco Almacen 🌵';
    const body = `
<div style="max-width: 600px; margin: 20px auto; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; background: #ffffff; padding: 25px; border-radius: 16px; box-shadow: 0 4px 15px rgba(0,0,0,0.08);">

  <h2 style="text-align:center; color: #222; margin-bottom: 20px;">🛍️ Detalles del Pedido | Plutarco Almacen 🥖</h2>

  <div style="background: #f7f9fc; padding: 15px 20px; border-radius: 10px; margin-bottom: 20px; border: 1px solid #e3e6eb;">
    <p><strong>Nombre:</strong> ${data.nombre}</p>
    <p><strong>Email:</strong> ${data.mail}</p>
    <p><strong>Teléfono:</strong> ${data.telefono}</p>
    <p><strong>Dirección:</strong> ${data.direccion}</p>
    <p><strong>Día de entrega:</strong> ${data.retiro}</p>
    ${data.comentario ? `<p><strong>Comentario:</strong> ${data.comentario}</p>` : ''}
  </div>


  <h3 style="margin-top: 0; color: #444; border-bottom: 2px solid #e3e6eb; padding-bottom: 8px;">🧾 Productos:</h3>
  ${productosHTML}


    <div style="margin-top: 20px;">
    <table style="width:100%; border-collapse: collapse; font-size: 15px;">
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">Subtotal:</td>
        <td style="padding: 8px; text-align:right; border-bottom: 1px solid #ddd;"><strong>$${data.subtotal}</strong></td>
      </tr>
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #ddd;">Envío:</td>
        <td style="padding: 8px; text-align:right; border-bottom: 1px solid #ddd;"><strong>$${data.envio}</strong></td>
      </tr>
      <tr>
        <td style="padding: 10px; font-size: 1.1em; font-weight: bold;">TOTAL:</td>
        <td style="padding: 10px; text-align:right; font-size: 1.1em; font-weight: bold; color: #1e88e5;">$${data.total}</td>
      </tr>
    </table>
  </div>
      <div style="background: #fff3cd; padding: 16px; border-left: 5px solid #ffcc00; margin-top: 30px; border-radius: 8px;">
        <h4 style="margin-top: 0;">💸 Información para el pago</h4>
        <p>Por favor, transferí <strong>$${data.total}</strong> al alias <strong>plutarco.almacen</strong>.</p>
        <p>Cuenta a nombre de <strong>Dario Chapur</strong>.</p>
        <p>Una vez realizado el pago, te pedimos que envíes el comprobante a este mismo correo electrónico.</p>
        <p>Confirmaremos tu pedido una vez recibido el comprobante.</p>
      </div>

      <div style="margin-top: 30px; background: #e2e3e5; padding: 14px; border-left: 5px solid #6c757d; border-radius: 8px;">
        <p>⚠️ En caso de no contar con stock de algún producto, se te notificará y se realizará la devolución del monto correspondiente.</p>
      </div>

    </div>
`;

    // 🔹 Enviar mails
    MailApp.sendEmail({ to: data.mail, subject, htmlBody: body }); // mail personal
    MailApp.sendEmail({ to: "plutarcoalmacen@gmail.com", subject: '📥 LLEGO UN PEDIDO', htmlBody: body }); // mail interno

    // 🔹 Respuesta OK
    output.setContent(JSON.stringify({ status: 'ok' }));
    return output;

  } catch (err) {
    output.setContent(JSON.stringify({ status: 'error', message: err.message }));
    return output;
  }
}
