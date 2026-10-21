/**
 * ReadOnlySignature — a saved signature, shown the way it will print, under the caption its signing pad has.
 *
 * Signing on the phone is Pro, but a free driver keeps the signatures already on
 * an invoice (docs/specs/2026-10-16-pricing-design.md §4), shown read-only. The
 * image is stored as it was drawn, and SignaturePad draws in the theme's ink:
 * white in dark mode, Keiro's default. White strokes on this white box would be
 * invisible. The PDF recolours a signature to PRINT_INK before it goes on its
 * white page (pdfGenerator.js), so this does too: what the driver sees is what
 * prints. Until the recolour is ready, or if the image can't be drawn
 * (recolorSignature then hands its input back), the stored image shows as it is.
 */
import { useState, useEffect } from 'react';
import { recolorSignature, PRINT_INK } from '../../utils/signatureImage';

export default function ReadOnlySignature({ src, alt, caption, C }) {
  // The recolour, kept with the image it was made from, so a different signature
  // never shows the previous one's result.
  const [inked, setInked] = useState({ src: null, ink: null });

  useEffect(() => {
    let cancelled = false;
    recolorSignature(src, PRINT_INK).then((ink) => {
      if (!cancelled) setInked({ src, ink });
    });
    return () => { cancelled = true; };
  }, [src]);

  return (
    <figure style={s.figure}>
      {/* The same words and look as the signing pad's label, so Free and Pro read alike. */}
      <figcaption style={{ ...s.caption, color: C.textMuted }}>{caption}</figcaption>
      <img src={inked.src === src ? inked.ink : src} alt={alt} style={s.img} />
    </figure>
  );
}

const s = {
  figure: { margin: 0 },
  caption: { display: 'block', marginBottom: 6, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' },
  img: { width: '100%', maxHeight: 140, objectFit: 'contain', background: '#fff', borderRadius: 10 },
};
