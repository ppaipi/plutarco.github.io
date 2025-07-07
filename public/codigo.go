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
		data.retiro || ''
	  ]);
  
	  const subject = 'Pedido Recibido! Plutarco Almacen 🌵';
	  const body = `
		<h2>🛍️ Detalles del pedido</h2>
		<p><strong>Nombre:</strong> ${data.nombre}</p>
		<p><strong>Email:</strong> ${data.mail}</p>
		<p><strong>Teléfono:</strong> ${data.telefono}</p>
		<p><strong>Dirección:</strong> ${data.direccion}</p>
		<p><strong>Día de Entrega:</strong> ${data.retiro}</p>
		${data.comentario ? `<p><strong>Comentario:</strong> ${data.comentario}</p>` : ''}
		<h3>🧾 Productos:</h3>
		<ul>${data.productos.map(p => `<li>${p}</li>`).join('')}</ul>
		<p><strong>Subtotal:</strong> $${data.subtotal || 0}</p>
		<p><strong>Envío:</strong> $${data.envio || 0}</p>
		<p><strong>Total:</strong> <span style="font-size:18px;">$${data.total}</span></p>
  
		<h4> Por favor, transferir ${data.total} al alias: plutarco.almacen </h4>
		<p> Cuenta a nombre de Dario Chapur, una vez abonado el pedido se confirmara. </p>
		<p> Una vez Abonado enviar comprobante de pago por este mail </p>
	  `;
  
	  MailApp.sendEmail({
		to: data.mail,
		subject,
		htmlBody: body
	  });
  
	  MailApp.sendEmail({
		to: "felipechapur@gmail.com",
		subject: '📥 Copia - ' + subject,
		htmlBody: body
	  });
  
	  output.setContent(JSON.stringify({ status: 'ok' }));
	  return output;
	} catch (err) {
	  output.setContent(JSON.stringify({ status: 'error', message: err.message }));
	  return output;
	}
  }
  