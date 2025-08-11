function doPost(e) {
  const output = ContentService.createTextOutput();
  output.setMimeType(ContentService.MimeType.JSON);

  try {
    const data = JSON.parse(e.postData.contents);

    const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    sheet.appendRow([
      new Date(),
      data.nombre || '',
      data.mail || '',
      data.telefono || '',
      data.direccion || '',
      data.comentario || '',
      data.productos ? data.productos.join(', ') : '',
      data.subtotal || 0,
      data.envio || 0,
      data.total || 0,
      data.retiro || '',
      "FALSE"
    ]);

    const subject = 'Pedido Recibido! Plutarco Almacen 🌵';
    const body = `
<div style="max-width: 600px; margin: 20px auto; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; background: #ffffff; padding: 25px; border-radius: 16px; box-shadow: 0 4px 15px rgba(0,0,0,0.08);">

  <h2 style="text-align:center; color: #222; margin-bottom: 20px;">🛍️ Detalles del Pedido | Plutarco Almacen 🥖</h2>

  <div style="background: #f7f9fc; padding: 15px 20px; border-radius: 10px; margin-bottom: 20px; border: 1px solid #e3e6eb;">
    <p style="margin: 8px 0;"><strong>Nombre:</strong> ${data.nombre}</p>
    <p style="margin: 8px 0;"><strong>Email:</strong> ${data.mail}</p>
    <p style="margin: 8px 0;"><strong>Teléfono:</strong> ${data.telefono}</p>
    <p style="margin: 8px 0;"><strong>Dirección:</strong> ${data.direccion}</p>
    <p style="margin: 8px 0;"><strong>Día de entrega:</strong> ${data.retiro}</p>
    ${data.comentario ? `<p style="margin: 8px 0;"><strong>Comentario:</strong> ${data.comentario}</p>` : ''}
  </div>

  <h3 style="margin-top: 0; color: #444; border-bottom: 2px solid #e3e6eb; padding-bottom: 8px;">🧾 Productos:</h3>
  <ul style="padding-left: 20px; margin-top: 10px; margin-bottom: 20px;">
    ${data.productos.map(p => `<li style="margin-bottom: 6px;">${p}</li>`).join('')}
  </ul>

<div style="margin-top: 20px; padding: 15px; background: #f7f9fc; border-radius: 10px; border: 1px solid #e3e6eb;">
  <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
    <span style="color: #555;">Subtotal:</span>
    <span style="font-weight: 500;">$${data.subtotal || 0}</span>
  </div>
  <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
    <span style="color: #555;">Envío:</span>
    <span style="font-weight: 500;">$${data.envio || 0}</span>
  </div>
  <div style="display: flex; justify-content: space-between; border-top: 2px solid #e3e6eb; padding-top: 10px; margin-top: 10px;">
    <span style="font-weight: bold; color: #222;">Total:</span>
    <span style="font-size: 20px; font-weight: bold; color: #000;">$${data.total}</span>
  </div>
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

    MailApp.sendEmail({
      to: data.mail,
      subject,
      htmlBody: body
    });

    MailApp.sendEmail({
      to: "plutarcoalmacen@gmail.com",
      subject: '📥 LLEGO UN PEDIDO',
      htmlBody: body
    });

    output.setContent(JSON.stringify({ status: 'ok' }));
    return output;
  } catch (err) {
    output.setContent(JSON.stringify({ status: 'error', message: err.message }));
    return output;
  }
}
