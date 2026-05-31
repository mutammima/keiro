import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Generates a clean, professional invoice PDF and triggers native share sheet (or download fallback).
 *
 * @param {Object} invoice
 * @param {string} invoice.businessName
 * @param {string} invoice.businessPhone
 * @param {number} invoice.number
 * @param {string} invoice.storeName
 * @param {string} invoice.storePhone
 * @param {string} invoice.date
 * @param {string} invoice.time
 * @param {Array}  invoice.items  – [{ name, qty, price }]
 */
export async function generateAndSharePDF(invoice) {
  const { businessName, businessPhone, number, storeName, storePhone, date, time, items } = invoice;

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 56;

  // ── Thin top border line ─────────────────────────────────────────────────
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.75);
  doc.line(margin, 36, pageW - margin, 36);

  // ── Business Name (centered, bold, large, letter-spaced) ─────────────────
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(30, 30, 30);
  const bizName = (businessName || 'My Business').toUpperCase();
  doc.text(bizName, pageW / 2, 72, { align: 'center', charSpace: 3 });

  // ── Business Phone ────────────────────────────────────────────────────────
  let headerBottomY = 82;
  if (businessPhone) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(businessPhone, pageW / 2, 86, { align: 'center' });
    headerBottomY = 94;
  }

  // ── Thin rule under business name ────────────────────────────────────────
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.5);
  doc.line(margin, headerBottomY, pageW - margin, headerBottomY);

  // ── Invoice meta (centered) ───────────────────────────────────────────────
  const metaY = headerBottomY + 18;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);
  doc.text(`Invoice No. ${number}`, pageW / 2, metaY, { align: 'center' });
  const dateTimeStr = time ? `Issue Date:  ${date}  ·  ${time}` : `Issue Date:  ${date}`;
  doc.text(dateTimeStr, pageW / 2, metaY + 14, { align: 'center' });

  // ── Bill To (centered) ───────────────────────────────────────────────────
  const billY = metaY + 40;
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'bold');
  doc.text(storeName, pageW / 2, billY, { align: 'center' });

  if (storePhone) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 100, 100);
    doc.text(storePhone, pageW / 2, billY + 14, { align: 'center' });
  }

  // ── Divider ──────────────────────────────────────────────────────────────
  const dividerY = storePhone ? billY + 28 : billY + 16;
  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.5);
  doc.line(margin, dividerY, pageW - margin, dividerY);

  // ── Items Table ───────────────────────────────────────────────────────────
  const tableRows = items.map((item) => [
    item.name,
    Number(item.qty).toFixed(2),
    `$${Number(item.price).toFixed(2)}`,
    `$${(Number(item.qty) * Number(item.price)).toFixed(2)}`,
  ]);

  autoTable(doc, {
    startY: dividerY + 8,
    margin: { left: margin, right: margin },
    head: [['Description', 'Qty', 'Unit Price', 'Line Total']],
    body: tableRows,
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: [100, 100, 100],
      fontStyle: 'normal',
      fontSize: 9.5,
      lineWidth: { bottom: 0.5 },
      lineColor: [200, 200, 200],
      cellPadding: { top: 6, bottom: 8, left: 0, right: 0 },
    },
    bodyStyles: {
      fontSize: 10,
      textColor: [40, 40, 40],
      lineWidth: { bottom: 0.3 },
      lineColor: [230, 230, 230],
      cellPadding: { top: 8, bottom: 8, left: 0, right: 0 },
      fillColor: [255, 255, 255],
    },
    alternateRowStyles: { fillColor: [255, 255, 255] },
    columnStyles: {
      0: { cellWidth: 'auto', halign: 'left' },
      1: { cellWidth: 55, halign: 'right' },
      2: { cellWidth: 70, halign: 'right' },
      3: { cellWidth: 70, halign: 'right' },
    },
    theme: 'plain',
  });

  // ── Totals block ──────────────────────────────────────────────────────────
  const subtotal = items.reduce(
    (sum, item) => sum + Number(item.qty) * Number(item.price),
    0
  );

  const finalY = doc.lastAutoTable.finalY + 16;
  const labelX = pageW - margin - 110;
  const valueX = pageW - margin;
  const rowH = 18;

  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.4);
  doc.line(labelX - 10, finalY - 4, valueX, finalY - 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);

  doc.text('Subtotal', labelX, finalY + rowH);
  doc.text(`$${subtotal.toFixed(2)}`, valueX, finalY + rowH, { align: 'right' });

  doc.text('Payments', labelX, finalY + rowH * 2);
  doc.text('$0.00', valueX, finalY + rowH * 2, { align: 'right' });

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.4);
  doc.line(labelX - 10, finalY + rowH * 2 + 8, valueX, finalY + rowH * 2 + 8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text('Due (USD):', labelX, finalY + rowH * 3 + 6);
  doc.text(`$${subtotal.toFixed(2)}`, valueX, finalY + rowH * 3 + 6, { align: 'right' });

  // ── Footer ────────────────────────────────────────────────────────────────
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.5);
  doc.line(margin, pageH - 52, pageW - margin, pageH - 52);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(130, 130, 130);
  doc.text('Thank you for your business.', pageW / 2, pageH - 36, { align: 'center' });
  doc.text(businessName || '', pageW / 2, pageH - 22, { align: 'center' });

  // ── Share / Download ──────────────────────────────────────────────────────
  const filename = `Invoice_${number}_${storeName.replace(/\s+/g, '_')}.pdf`;
  const blob = doc.output('blob');

  if (navigator.share && navigator.canShare) {
    const file = new File([blob], filename, { type: 'application/pdf' });
    if (navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: `Invoice #${number}` });
      return;
    }
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
