import PDFDocument from 'pdfkit';
import {
  ReceiptConcept,
  ReceiptData,
  formatCop,
  formatDateTimeBogota,
} from './receipt-templates';

/**
 * Renderiza el comprobante de pago como un PDF (Buffer), reproduciendo en vectores el
 * diseño de la tarjeta amarilla de ECIExpress. Se usa `pdfkit` (JS puro, sin binarios
 * nativos ni navegador headless) para no cambiar la imagen de despliegue del servicio.
 */

const PAGE_W = 320;
const PAGE_H = 520;
const PAD = 28;

const COLORS = {
  yellow: '#FFC727',
  yellowDark: '#F5B800',
  text: '#2b2b2b',
  soft: '#8a8a8a',
  border: '#efefef',
  green: '#16a34a',
  greenBg: '#eafbf0',
  amountBg: '#fffdf5',
  white: '#ffffff',
};

export function renderReceiptPdf(data: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [PAGE_W, PAGE_H], margin: 0 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    drawReceipt(doc, data);

    doc.end();
  });
}

function drawReceipt(doc: PDFKit.PDFDocument, data: ReceiptData): void {
  const isTopup = data.concept === ReceiptConcept.WALLET_TOPUP;
  const statusTitle = isTopup ? '¡Recarga exitosa!' : '¡Pago exitoso!';
  const footerMsg = isTopup
    ? 'Tu saldo ya está disponible en tu billetera.'
    : 'Tu pedido quedó pagado y está en preparación.';

  // --- Cabecera amarilla ---
  const headerH = 116;
  const grad = doc.linearGradient(0, 0, 0, headerH);
  grad.stop(0, COLORS.yellow).stop(1, COLORS.yellowDark);
  doc.rect(0, 0, PAGE_W, headerH).fill(grad);

  // Logo: badge blanco con una bolsa de compras dibujada.
  drawLogo(doc, PAGE_W / 2 - 26, 18, 52);

  doc
    .fillColor(COLORS.white)
    .font('Helvetica-Bold')
    .fontSize(19)
    .text('ECIExpress', 0, 74, { width: PAGE_W, align: 'center' });
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor('#fffdf0')
    .text('COMPROBANTE DE PAGO', 0, 96, {
      width: PAGE_W,
      align: 'center',
      characterSpacing: 1.5,
    });

  // --- Estado ---
  const checkCx = PAGE_W / 2;
  const checkCy = headerH + 34;
  doc.circle(checkCx, checkCy, 20).fill(COLORS.greenBg);
  // Marca de verificación.
  doc
    .strokeColor(COLORS.green)
    .lineWidth(2.6)
    .lineCap('round')
    .lineJoin('round')
    .moveTo(checkCx - 8, checkCy)
    .lineTo(checkCx - 2, checkCy + 6)
    .lineTo(checkCx + 8, checkCy - 6)
    .stroke();

  doc
    .fillColor(COLORS.green)
    .font('Helvetica-Bold')
    .fontSize(13)
    .text(statusTitle, 0, checkCy + 26, { width: PAGE_W, align: 'center' });
  doc
    .fillColor(COLORS.soft)
    .font('Helvetica')
    .fontSize(9)
    .text('Tu transacción se procesó correctamente', 0, checkCy + 43, {
      width: PAGE_W,
      align: 'center',
    });

  // --- Monto ---
  const amountY = checkCy + 62;
  const amountH = 62;
  doc
    .roundedRect(PAD, amountY, PAGE_W - PAD * 2, amountH, 12)
    .fill(COLORS.amountBg);
  doc
    .fillColor(COLORS.soft)
    .font('Helvetica')
    .fontSize(8)
    .text('MONTO PAGADO', PAD, amountY + 12, {
      width: PAGE_W - PAD * 2,
      align: 'center',
      characterSpacing: 1,
    });
  doc
    .fillColor(COLORS.yellowDark)
    .font('Helvetica-Bold')
    .fontSize(26)
    .text(`${formatCop(data.amountCents)} COP`, PAD, amountY + 26, {
      width: PAGE_W - PAD * 2,
      align: 'center',
    });

  // --- Filas de detalle ---
  const rows: Array<[string, string]> = [
    ['Concepto', data.concept],
    ['Método de pago', data.paymentMethodLabel],
    ['Fecha y hora', formatDateTimeBogota(data.date)],
    ['Comprador', data.buyer],
    [data.referenceLabel, data.reference],
  ];

  let rowY = amountY + amountH + 18;
  const rowH = 25;
  const valueX = PAGE_W / 2 - 6;
  const valueW = PAGE_W - PAD - valueX;
  for (let i = 0; i < rows.length; i++) {
    const [label, value] = rows[i];
    doc
      .fillColor(COLORS.soft)
      .font('Helvetica')
      .fontSize(10)
      .text(label, PAD, rowY + 7, { lineBreak: false });
    // Auto-ajuste: reduce el tamaño del valor hasta que quepa en una sola línea
    // (emails/UUID largos), sin envolver ni pisar el separador.
    doc.fillColor(COLORS.text).font('Helvetica-Bold');
    let valueSize = 10;
    while (valueSize > 6.5 && doc.fontSize(valueSize).widthOfString(value) > valueW) {
      valueSize -= 0.5;
    }
    doc.fontSize(valueSize).text(value, valueX, rowY + 7 + (10 - valueSize) / 2, {
      width: valueW,
      align: 'right',
      lineBreak: false,
      ellipsis: true,
    });
    // Separador punteado (excepto tras la última fila).
    if (i < rows.length - 1) {
      doc
        .strokeColor(COLORS.border)
        .lineWidth(1)
        .dash(2, { space: 2 })
        .moveTo(PAD, rowY + rowH)
        .lineTo(PAGE_W - PAD, rowY + rowH)
        .stroke()
        .undash();
    }
    rowY += rowH;
  }

  // --- Pie ---
  const footY = rowY + 16;
  doc
    .strokeColor(COLORS.border)
    .lineWidth(1)
    .moveTo(PAD, footY)
    .lineTo(PAGE_W - PAD, footY)
    .stroke();
  doc
    .fillColor(COLORS.soft)
    .font('Helvetica')
    .fontSize(9)
    .text(`¡Gracias por usar ECIExpress!\n${footerMsg}`, PAD, footY + 12, {
      width: PAGE_W - PAD * 2,
      align: 'center',
    });
  doc
    .fillColor(COLORS.yellowDark)
    .font('Helvetica-Bold')
    .fontSize(8)
    .text('ECIExpress · Marketplace del campus', PAD, footY + 40, {
      width: PAGE_W - PAD * 2,
      align: 'center',
    });
}

/** Badge blanco redondeado con una bolsa de compras dibujada en vectores. */
function drawLogo(doc: PDFKit.PDFDocument, x: number, y: number, size: number): void {
  doc.roundedRect(x, y, size, size, 15).fill(COLORS.white);

  // Cuerpo de la bolsa.
  const cx = x + size / 2;
  const bagW = 22;
  const bagH = 18;
  const bagX = cx - bagW / 2;
  const bagY = y + size / 2 - 4;
  doc
    .roundedRect(bagX, bagY, bagW, bagH, 3)
    .fill(COLORS.yellowDark);
  // Asa de la bolsa.
  doc
    .strokeColor(COLORS.yellowDark)
    .lineWidth(2.2)
    .moveTo(bagX + 5, bagY)
    .bezierCurveTo(bagX + 5, bagY - 8, bagX + bagW - 5, bagY - 8, bagX + bagW - 5, bagY)
    .stroke();
}
