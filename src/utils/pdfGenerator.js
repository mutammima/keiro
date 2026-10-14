// jsPDF + jspdf-autotable are heavy (~250 kB) and only needed when a PDF is
// actually generated, so they're dynamically imported inside buildPDF below.
// Rollup splits them into a lazy chunk, keeping them off the startup bundle.

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
import { Capacitor } from '@capacitor/core';
import { STORAGE_KEYS } from './constants';
import { notifySyncError } from './syncNotify';
import { recolorSignature, PRINT_INK } from './signatureImage';
import { isEasyMode } from './easyMode';
// ── Easy Mode template (docs/specs/2026-10-14-easy-mode-design.md §2) ───────
// Anything the driver left empty prints as a labeled ruled line to fill in by
// pen; anything filled prints as text. Only used when invoice.layout is
// 'template' (the default while Easy Mode is on).

/** "Label: value", or "Label: ______" ruled to the field's right edge. */
function templateField(doc, label, value, x, y, right) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text(label, x, y);
  const valueX = x + doc.getTextWidth(label) + 6;
  if (value && String(value).trim()) {
    doc.setFont('helvetica', 'normal');
    doc.text(String(value).trim(), valueX, y);
  } else {
    doc.setDrawColor(150, 150, 150);
    doc.setLineWidth(0.6);
    doc.line(valueX, y + 2, right, y + 2);
  }
}

/** The template's Bill To rows. Returns the y of the last row. */
function drawTemplateBillTo(doc, { storeName, customerName, storePhone, storeAddress }, y, margin, pageW) {
  const right = pageW - margin;
  const mid = margin + (pageW - margin * 2) / 2;
  templateField(doc, 'Store:', storeName, margin, y, right);
  templateField(doc, 'Contact:', customerName, margin, y + 22, mid - 10);
  templateField(doc, 'Phone:', storePhone, mid + 10, y + 22, right);
  templateField(doc, 'Address:', storeAddress, margin, y + 44, right);
  return y + 44;
}

/** "Paid by: ☐ Cash ☐ Card ☐ Check   Amount: ____", then Notes. Returns the y below. */
function drawTemplatePaidByAndNotes(doc, notes, y, margin, pageW) {
  const right = pageW - margin;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text('Paid by:', margin, y);
  doc.setDrawColor(120, 120, 120);
  doc.setLineWidth(0.6);
  doc.setFont('helvetica', 'normal');
  let x = margin + doc.getTextWidth('Paid by:') + 12;
  for (const method of ['Cash', 'Card', 'Check']) {
    doc.rect(x, y - 8, 9, 9);
    doc.text(method, x + 14, y);
    x += 14 + doc.getTextWidth(method) + 18;
  }
  templateField(doc, 'Amount:', '', x + 8, y, right);

  const notesY = y + 26;
  if (!(notes && notes.trim())) {
    templateField(doc, 'Notes:', '', margin, notesY, right);
    return notesY;
  }
  // Typed notes print as text, wrapped to the page width.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.text('Notes:', margin, notesY);
  const notesX = margin + doc.getTextWidth('Notes:') + 6;
  doc.setFont('helvetica', 'normal');
  const lines = doc.splitTextToSize(notes.trim(), right - notesX);
  doc.text(lines, notesX, notesY);
  return notesY + (lines.length - 1) * 13;
}

async function buildPDF(invoice) {
  const { businessName, businessPhone, number, storeName, customerName, storePhone, storeAddress, date, time, items, notes, sellerSignature, buyerSignature, paidAmount = 0, layout } = invoice;
  // Easy Mode prints the fill-in template unless the caller chose a layout.
  const template = (layout ?? (isEasyMode() ? 'template' : 'standard')) === 'template';

  // Lazy-load the PDF engine only at generation time (keeps it off startup).
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 56;

  // ── Thin top border line ─────────────────────────────────────────────────
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.75);
  doc.line(margin, 36, pageW - margin, 36);

  // ── Logo or Business Name ────────────────────────────────────────────────
  let headerBottomY = 82;
  const logob64 = (() => { try { return localStorage.getItem(STORAGE_KEYS.LOGO_B64); } catch { return null; } })();

  if (logob64) {
    // Draw logo centered; max 160×48 pts
    const logoW = 160, logoH = 48;
    const logoX = (pageW - logoW) / 2;
    try {
      const fmt = logob64.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(logob64, fmt, logoX, 42, logoW, logoH);
    } catch {
      // Corrupt/unsupported logo data: skip the image but keep the reserved
      // header height below, so the rest of the invoice still lays out correctly.
    }
    headerBottomY = 42 + logoH + 8;
    // Business phone under logo
    if (businessPhone) {
      doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(100, 100, 100);
      doc.text(businessPhone, pageW / 2, headerBottomY + 10, { align: 'center' });
      headerBottomY += 18;
    }
  } else {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(30, 30, 30);
    const bizName = (businessName || 'My Business').toUpperCase();
    doc.text(bizName, pageW / 2, 72, { align: 'center', charSpace: 3 });

    if (businessPhone) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(businessPhone, pageW / 2, 86, { align: 'center' });
      headerBottomY = 94;
    }
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

  // ── Bill To ──────────────────────────────────────────────────────────────
  const billY = metaY + 40;
  let billBottomY = billY;
  if (template) {
    billBottomY = drawTemplateBillTo(doc, { storeName, customerName, storePhone, storeAddress }, billY, margin, pageW);
  } else {
    // Centered store block (normal invoices always have a store name).
    doc.setFontSize(10);
    doc.setTextColor(60, 60, 60);
    doc.setFont('helvetica', 'bold');
    doc.text(storeName, pageW / 2, billY, { align: 'center' });

    if (storePhone) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.text(storePhone, pageW / 2, billY + 14, { align: 'center' });
      billBottomY = billY + 14;
    }
    if (storeAddress) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      const addrY = billBottomY + 14;
      doc.text(storeAddress, pageW / 2, addrY, { align: 'center' });
      billBottomY = addrY;
    }
  }

  // ── Divider ──────────────────────────────────────────────────────────────
  const dividerY = billBottomY + 14;
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

  let finalY = doc.lastAutoTable.finalY + 16;
  // The template's totals, Paid-by, Notes and signature lines take ~210pt
  // below the table. On a long delivery, start them on a fresh page instead
  // of printing past the footer.
  if (template) {
    const noteLines = notes && notes.trim() ? doc.splitTextToSize(notes.trim(), pageW - margin * 2 - 48).length : 1;
    const tailHeight = 212 + (noteLines - 1) * 13;
    if (finalY + tailHeight > pageH - 60) {
      doc.addPage();
      finalY = margin;
    }
  }
  const labelX = pageW - margin - 110;
  const valueX = pageW - margin;
  const rowH = 18;

  doc.setDrawColor(210, 210, 210);
  doc.setLineWidth(0.4);
  doc.line(labelX - 10, finalY - 4, valueX, finalY - 4);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(80, 80, 80);

  const paid = Math.max(0, Number(paidAmount) || 0);
  const due = Math.max(0, subtotal - paid);

  doc.text('Subtotal', labelX, finalY + rowH);
  doc.text(`$${subtotal.toFixed(2)}`, valueX, finalY + rowH, { align: 'right' });

  doc.text('Payments', labelX, finalY + rowH * 2);
  doc.text(`-$${paid.toFixed(2)}`, valueX, finalY + rowH * 2, { align: 'right' });

  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.4);
  doc.line(labelX - 10, finalY + rowH * 2 + 8, valueX, finalY + rowH * 2 + 8);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text('Due (USD):', labelX, finalY + rowH * 3 + 6);
  doc.text(`$${due.toFixed(2)}`, valueX, finalY + rowH * 3 + 6, { align: 'right' });

  // ── Notes ─────────────────────────────────────────────────────────────────
  let notesEndY = finalY + rowH * 3 + 6;
  if (template) {
    notesEndY = drawTemplatePaidByAndNotes(doc, notes, notesEndY + 26, margin, pageW);
  } else if (notes && notes.trim()) {
    const notesStartY = notesEndY + 22;
    doc.setDrawColor(220, 220, 220);
    doc.setLineWidth(0.4);
    doc.line(margin, notesStartY - 8, pageW - margin, notesStartY - 8);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text('Notes:', margin, notesStartY);
    doc.setFont('helvetica', 'normal');
    const noteLines = doc.splitTextToSize(notes.trim(), pageW - margin * 2 - 48);
    doc.text(noteLines, margin + 48, notesStartY);
    notesEndY = notesStartY + noteLines.length * 13;
  }

  // ── Signatures ────────────────────────────────────────────────────────────
  // Signatures may be drawn in white (dark-mode ink): print them dark.
  const sellerInk = sellerSignature ? await recolorSignature(sellerSignature, PRINT_INK) : null;
  const buyerInk  = buyerSignature  ? await recolorSignature(buyerSignature,  PRINT_INK) : null;
  const sigStartY = notesEndY + 28;
  const sigBoxW = (pageW - margin * 2 - 20) / 2;
  const sigBoxH = 60;

  // Seller
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(130, 130, 130);
  doc.text('Seller / Deliverer Signature', margin, sigStartY);
  if (sellerInk) {
    // Unreadable signature data: fall through to the blank ruled line below
    // rather than aborting the whole PDF over a decorative image.
    try { doc.addImage(sellerInk, 'PNG', margin, sigStartY + 4, sigBoxW, sigBoxH); } catch { /* leave the line blank */ }
  }
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.5);
  doc.line(margin, sigStartY + sigBoxH + 8, margin + sigBoxW, sigStartY + sigBoxH + 8);

  // Buyer
  const buyerX = margin + sigBoxW + 20;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(130, 130, 130);
  doc.text('Buyer / Recipient Signature', buyerX, sigStartY);
  if (buyerInk) {
    // Same as the seller box above: a bad image must not fail the PDF.
    try { doc.addImage(buyerInk, 'PNG', buyerX, sigStartY + 4, sigBoxW, sigBoxH); } catch { /* leave the line blank */ }
  }
  doc.line(buyerX, sigStartY + sigBoxH + 8, buyerX + sigBoxW, sigStartY + sigBoxH + 8);

  // ── Footer ────────────────────────────────────────────────────────────────
  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.5);
  doc.line(margin, pageH - 52, pageW - margin, pageH - 52);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(130, 130, 130);
  doc.text('Thank you for your business.', pageW / 2, pageH - 36, { align: 'center' });
  doc.text(businessName || '', pageW / 2, pageH - 22, { align: 'center' });

  const filename = storeName && storeName.trim()
    ? `Invoice_${number}_${storeName.trim().replace(/\s+/g, '_')}.pdf`
    : `Invoice_${number}.pdf`;
  const blob = doc.output('blob');
  return { blob, filename, doc };  // doc exposed so callers can use doc.output('bloburl')
}

/**
 * Generates the PDF and returns { blob, filename }.
 */
export async function generatePDFBlob(invoice) {
  return buildPDF(invoice);
}

/**
 * Generates the PDF and triggers native share sheet (or download fallback).
 * NOTE: callers must open a blank tab BEFORE calling this function
 * (to satisfy browser popup-blocker requirements), then pass it as `targetTab`.
 * If targetTab is null/undefined the PDF will still open but may be blocked.
 */
export async function generateAndSharePDF(invoice, targetTab) {
  const built = await buildPDF(invoice);
  await sharePDFBlob(built, `Invoice #${invoice.number}`, targetTab);
}

/**
 * Hands a generated PDF blob to the user however is appropriate for the
 * current platform. A `blob:` URL can't be opened by iOS LaunchServices
 * inside the native (Capacitor) wrapper — window.open()/location.href to one
 * silently fails there — so that path is native-only:
 *   1. Native (Capacitor): write the PDF to the cache dir via @capacitor/
 *      filesystem, then hand its file:// URI to @capacitor/share, which opens
 *      the native share sheet (Save to Files, AirDrop, Mail, Messages, print).
 *      Unlike web, there's no separate "download" concept on iOS — both the
 *      Download and Share buttons converge on this sheet, matching platform
 *      convention.
 *   2. Web, Files-capable Web Share API (mobile Safari/Chrome): native share
 *      sheet via navigator.share.
 *   3. Web fallback (desktop / no Web Share): open the blob in a new tab (or
 *      the pre-opened `targetTab`, to survive popup blockers) — unchanged
 *      existing behavior.
 * @param {{blob: Blob, filename: string, doc: object}} built - buildPDF() result
 * @param {string} title - share-sheet title, e.g. "Invoice #1042"
 * @param {Window} [targetTab] - a tab pre-opened synchronously in the click handler
 */
export async function sharePDFBlob({ blob, filename, doc }, title, targetTab) {
  if (Capacitor.isNativePlatform()) {
    if (targetTab) targetTab.close(); // was opened for the web path; unused natively
    try {
      const { Filesystem, Directory } = await import('@capacitor/filesystem');
      const { Share } = await import('@capacitor/share');
      const base64 = await blobToBase64(blob);
      const { uri } = await Filesystem.writeFile({ path: filename, data: base64, directory: Directory.Cache });
      await Share.share({ title, url: uri });
    } catch (e) {
      // AbortError-equivalent: the user closing the native share sheet also
      // rejects on iOS — that's not a failure, don't surface it as one.
      if (e?.message && /cancel/i.test(e.message)) return;
      console.error('Native PDF share failed', e);
      notifySyncError("Couldn't open the share sheet for this PDF. Try again.");
    }
    return;
  }

  if (navigator.share && navigator.canShare) {
    const file = new File([blob], filename, { type: 'application/pdf' });
    if (navigator.canShare({ files: [file] })) {
      if (targetTab) targetTab.close(); // close the pre-opened tab if sharing natively
      await navigator.share({ files: [file], title });
      return;
    }
  }

  const blobUrl = doc.output('bloburl');
  if (targetTab) {
    targetTab.location.href = blobUrl;
  } else {
    window.open(blobUrl, '_blank');
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] || ''); // strip the data: prefix
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
