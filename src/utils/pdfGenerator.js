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
async function buildPDF(invoice) {
  const { businessName, businessPhone, number, storeName, storePhone, storeAddress, date, time, items, notes, sellerSignature, buyerSignature, paidAmount = 0 } = invoice;

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

  // ── Bill To (centered) ───────────────────────────────────────────────────
  const billY = metaY + 40;
  doc.setFontSize(10);
  doc.setTextColor(60, 60, 60);
  doc.setFont('helvetica', 'bold');
  doc.text(storeName, pageW / 2, billY, { align: 'center' });

  let billBottomY = billY;
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
  if (notes && notes.trim()) {
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
  const sigStartY = notesEndY + 28;
  const sigBoxW = (pageW - margin * 2 - 20) / 2;
  const sigBoxH = 60;

  // Seller
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(130, 130, 130);
  doc.text('Seller / Deliverer Signature', margin, sigStartY);
  if (sellerSignature) {
    // Unreadable signature data: fall through to the blank ruled line below
    // rather than aborting the whole PDF over a decorative image.
    try { doc.addImage(sellerSignature, 'PNG', margin, sigStartY + 4, sigBoxW, sigBoxH); } catch { /* leave the line blank */ }
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
  if (buyerSignature) {
    // Same as the seller box above: a bad image must not fail the PDF.
    try { doc.addImage(buyerSignature, 'PNG', buyerX, sigStartY + 4, sigBoxW, sigBoxH); } catch { /* leave the line blank */ }
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

  const filename = `Invoice_${number}_${storeName.replace(/\s+/g, '_')}.pdf`;
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
