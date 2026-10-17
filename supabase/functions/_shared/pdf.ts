// Générateur PDF minimal, sans dépendance : une edge function est coupée après 2 s de CPU, on évite donc
// toute bibliothèque lourde. Polices standard (Helvetica, jamais intégrées), texte en WinAnsi (cp1252),
// rectangles pour les barres, image JPEG optionnelle (logo). Un document = quelques ko.

const PAGE_W = 595.28; // A4 en points
const PAGE_H = 841.89;
const MARGIN = 50;
const TOP = PAGE_H - 60; // la bande d'en-tête occupe le haut de la première page
const BOTTOM = 60;

export type Rgb = [number, number, number];

// ---------------------------------------------------------------------------------------------------
// Texte : Unicode -> cp1252 (WinAnsi), largeurs Helvetica (AFM)
// ---------------------------------------------------------------------------------------------------

const CP1252: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87, 0x02c6: 0x88,
  0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91, 0x2019: 0x92, 0x201c: 0x93,
  0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98, 0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b,
  0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

// Espaces insécables et fines (usage français avant « : » ou « ? ») : rendues comme une espace.
const SPACE_LIKE = new Set([0xa0, 0x2002, 0x2003, 0x2007, 0x2009, 0x202f]);

/** Remplace les caractères de contrôle (0x00-0x1F, 0x7F) par une espace. */
export function stripControl(text: string): string {
  let out = "";
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    out += cp < 0x20 || cp === 0x7f ? " " : ch;
  }
  return out;
}

/** Texte -> chaîne « binaire » (un caractère = un octet cp1252). Caractères inconnus -> « ? ». */
export function toWinAnsi(text: string): string {
  let out = "";
  for (const ch of stripControl(text)) {
    const cp = ch.codePointAt(0)!;
    if (SPACE_LIKE.has(cp)) out += " ";
    else if (cp < 0x80 || (cp >= 0xa0 && cp <= 0xff)) out += String.fromCharCode(cp);
    else if (CP1252[cp] !== undefined) out += String.fromCharCode(CP1252[cp]);
    else out += "?";
  }
  return out;
}

// Largeurs Helvetica pour les codes 32..126 (millièmes d'em).
const W = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556,
  278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667,
  611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833,
  556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

function charWidth(code: number): number {
  if (code >= 32 && code <= 126) return W[code - 32];
  // Lettres accentuées (À-ÿ) : largeur de la lettre de base, approchée par une valeur moyenne de majuscule/minuscule.
  if (code >= 0xc0 && code <= 0xdf) return 700;
  if (code >= 0xe0 && code <= 0xff) return 540;
  return 556;
}

/** Largeur en points d'une chaîne cp1252 (le gras est environ 6 % plus large). */
export function textWidth(winAnsi: string, size: number, bold = false): number {
  let w = 0;
  for (let i = 0; i < winAnsi.length; i++) w += charWidth(winAnsi.charCodeAt(i));
  return (w * size * (bold ? 1.06 : 1)) / 1000;
}

function escapePdf(winAnsi: string): string {
  return winAnsi.replace(/[\\()]/g, (c) => "\\" + c).replace(/[\u0080-ÿ]/g, (c) => "\\" + c.charCodeAt(0).toString(8).padStart(3, "0"));
}

/** Coupe en lignes qui tiennent dans `maxWidth` ; un mot trop long est coupé au caractère. */
export function wrapText(text: string, size: number, maxWidth: number, bold = false): string[] {
  const lines: string[] = [];
  for (const para of toWinAnsi(text).split(/\n/)) {
    let line = "";
    for (const word of para.split(" ").filter((w) => w !== "")) {
      let w = word;
      while (textWidth(w, size, bold) > maxWidth) {
        // mot plus large que la ligne : on le tronque au caractère près
        let cut = w.length - 1;
        while (cut > 1 && textWidth(w.slice(0, cut), size, bold) > maxWidth) cut--;
        if (line) { lines.push(line); line = ""; }
        lines.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      const candidate = line ? `${line} ${w}` : w;
      if (line && textWidth(candidate, size, bold) > maxWidth) { lines.push(line); line = w; } else line = candidate;
    }
    lines.push(line);
  }
  return lines;
}

/** Tronque avec « … » (cp1252 0x85) pour tenir dans une cellule. */
export function fitText(winAnsi: string, size: number, maxWidth: number, bold = false): string {
  if (textWidth(winAnsi, size, bold) <= maxWidth) return winAnsi;
  let s = winAnsi;
  while (s.length > 1 && textWidth(s + "\u0085", size, bold) > maxWidth) s = s.slice(0, -1);
  return s + "\u0085";
}

// ---------------------------------------------------------------------------------------------------
// JPEG (logo) : on ne décode pas l'image, on l'embarque telle quelle (DCTDecode)
// ---------------------------------------------------------------------------------------------------

export interface Jpeg { bytes: Uint8Array; width: number; height: number; components: 1 | 3 }

export const MAX_LOGO_BYTES = 300 * 1024;

/** Valide un JPEG (baseline ou progressif, 8 bits, gris ou RVB) ; renvoie null sinon (CMYK refusé). */
export function parseJpeg(bytes: Uint8Array): Jpeg | null {
  if (bytes.length < 4 || bytes.length > MAX_LOGO_BYTES || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  let i = 2;
  while (i + 4 <= bytes.length) {
    if (bytes[i] !== 0xff) return null;
    const marker = bytes[i + 1];
    if (marker === 0xff) { i++; continue; }
    if (marker === 0xd9 || marker === 0xda) return null; // fin d'image ou début des données sans en-tête SOF
    const len = (bytes[i + 2] << 8) | bytes[i + 3];
    if (len < 2 || i + 2 + len > bytes.length) return null;
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (![0xc0, 0xc1, 0xc2].includes(marker) || len < 8) return null; // codages arithmétiques/sans perte non pris en charge
      const precision = bytes[i + 4];
      const height = (bytes[i + 5] << 8) | bytes[i + 6];
      const width = (bytes[i + 7] << 8) | bytes[i + 8];
      const components = bytes[i + 9];
      if (precision !== 8 || width < 1 || height < 1 || width > 4000 || height > 4000) return null;
      if (components !== 1 && components !== 3) return null;
      return { bytes, width, height, components };
    }
    i += 2 + len;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------------
// Document
// ---------------------------------------------------------------------------------------------------

export interface PdfOptions {
  title: string;
  footer: string; // texte de pied de page (marque)
  accent: Rgb;
  brandName: string; // affiché dans la bande d'en-tête (première page)
  brandSubtitle?: string;
  logo?: Jpeg | null;
  pageLabel: (n: number, total: number) => string;
}

interface Page { ops: string[] }

const rgb = (c: Rgb) => c.map((v) => (v / 255).toFixed(3)).join(" ");
const num = (n: number) => (Math.round(n * 100) / 100).toString();

export class PdfBuilder {
  private pages: Page[] = [{ ops: [] }];
  private y = TOP;
  constructor(private readonly o: PdfOptions) {
    this.drawHeader();
  }

  private get page() { return this.pages[this.pages.length - 1]; }

  private newPage() {
    this.pages.push({ ops: [] });
    this.y = PAGE_H - MARGIN;
  }

  private ensure(h: number) {
    if (this.y - h < BOTTOM) this.newPage();
  }

  private text(x: number, y: number, winAnsi: string, size: number, opts: { bold?: boolean; color?: Rgb } = {}) {
    this.page.ops.push(
      `BT /${opts.bold ? "F2" : "F1"} ${size} Tf ${rgb(opts.color ?? [30, 30, 30])} rg ${num(x)} ${num(y)} Td (${escapePdf(winAnsi)}) Tj ET`,
    );
  }

  private rect(x: number, y: number, w: number, h: number, color: Rgb) {
    this.page.ops.push(`${rgb(color)} rg ${num(x)} ${num(y)} ${num(w)} ${num(h)} re f`);
  }

  private drawHeader() {
    const bandH = 46;
    this.rect(0, PAGE_H - bandH, PAGE_W, bandH, this.o.accent);
    let x = MARGIN;
    if (this.o.logo) {
      const lh = 30;
      const lw = Math.min(120, (this.o.logo.width / this.o.logo.height) * lh);
      const h = (this.o.logo.height / this.o.logo.width) * lw;
      const drawH = Math.min(lh, h);
      this.rect(x - 4, PAGE_H - bandH + 5, lw + 8, bandH - 10, [255, 255, 255]); // fond blanc : logos transparents lisibles
      this.page.ops.push(`q ${num(lw)} 0 0 ${num(drawH)} ${num(x)} ${num(PAGE_H - bandH + (bandH - drawH) / 2)} cm /Im1 Do Q`);
      x += lw + 14;
    }
    this.text(x, PAGE_H - 29, fitText(toWinAnsi(this.o.brandName), 15, PAGE_W - x - MARGIN, true), 15, { bold: true, color: [255, 255, 255] });
    if (this.o.brandSubtitle) this.text(x, PAGE_H - 41, toWinAnsi(this.o.brandSubtitle), 8, { color: [255, 255, 255] });
  }

  spacer(h = 10) { this.y -= h; return this; }

  title(text: string) {
    const lines = wrapText(text, 20, PAGE_W - 2 * MARGIN, true);
    this.ensure(lines.length * 26 + 6);
    for (const l of lines) { this.y -= 24; this.text(MARGIN, this.y, l, 20, { bold: true, color: [20, 20, 20] }); }
    this.y -= 6;
    return this;
  }

  heading(text: string) {
    this.ensure(44);
    this.y -= 26;
    this.text(MARGIN, this.y, fitText(toWinAnsi(text), 13, PAGE_W - 2 * MARGIN, true), 13, { bold: true, color: this.o.accent });
    this.rect(MARGIN, this.y - 5, PAGE_W - 2 * MARGIN, 0.8, [210, 210, 210]);
    this.y -= 10;
    return this;
  }

  paragraph(text: string, opts: { size?: number; color?: Rgb; bold?: boolean } = {}) {
    const size = opts.size ?? 10;
    for (const line of wrapText(text, size, PAGE_W - 2 * MARGIN, opts.bold)) {
      this.ensure(size + 4);
      this.y -= size + 3;
      this.text(MARGIN, this.y, line, size, { color: opts.color ?? [50, 50, 50], bold: opts.bold });
    }
    this.y -= 3;
    return this;
  }

  bullet(text: string) {
    const lines = wrapText(text, 10, PAGE_W - 2 * MARGIN - 14);
    lines.forEach((line, i) => {
      this.ensure(14);
      this.y -= 13;
      if (i === 0) this.text(MARGIN + 2, this.y, "\u0095", 10, { color: this.o.accent });
      this.text(MARGIN + 14, this.y, line, 10, { color: [50, 50, 50] });
    });
    this.y -= 2;
    return this;
  }

  /** Paires libellé / valeur sur deux colonnes. */
  keyValues(rows: [string, string][]) {
    const labelW = 170;
    for (const [k, v] of rows) {
      const lines = wrapText(v, 10, PAGE_W - 2 * MARGIN - labelW);
      this.ensure(lines.length * 13 + 4);
      this.y -= 13;
      this.text(MARGIN, this.y, fitText(toWinAnsi(k), 10, labelW - 8, true), 10, { bold: true, color: [90, 90, 90] });
      lines.forEach((l, i) => {
        if (i > 0) { this.ensure(13); this.y -= 13; }
        this.text(MARGIN + labelW, this.y, l, 10);
      });
    }
    this.y -= 4;
    return this;
  }

  /** Tableau : `widths` en fractions de la largeur utile (somme = 1). Les cellules trop longues sont tronquées. */
  table(headers: string[], rows: string[][], widths: number[], align: ("l" | "r")[] = []) {
    const full = PAGE_W - 2 * MARGIN;
    const xs: number[] = [];
    let acc = MARGIN;
    for (const w of widths) { xs.push(acc); acc += w * full; }
    const cell = (col: number, y: number, raw: string, bold: boolean, color: Rgb) => {
      const maxW = widths[col] * full - 8;
      const s = fitText(toWinAnsi(raw), 9, maxW, bold);
      const x = align[col] === "r" ? xs[col] + widths[col] * full - 4 - textWidth(s, 9, bold) : xs[col] + 4;
      this.text(x, y, s, 9, { bold, color });
    };
    const drawHead = () => {
      this.ensure(40);
      this.y -= 16;
      this.rect(MARGIN, this.y - 4, full, 16, [240, 240, 240]);
      headers.forEach((h, c) => cell(c, this.y, h, true, [60, 60, 60]));
      this.y -= 2;
    };
    drawHead();
    rows.forEach((r, ri) => {
      if (this.y - 16 < BOTTOM) { this.newPage(); drawHead(); }
      this.y -= 15;
      if (ri % 2 === 1) this.rect(MARGIN, this.y - 4, full, 15, [250, 250, 250]);
      r.forEach((v, c) => cell(c, this.y, v, false, [40, 40, 40]));
    });
    this.y -= 6;
    return this;
  }

  /** Barres horizontales (valeurs positives ; `max` par défaut = plus grande valeur). */
  bars(items: { label: string; value: number }[], format: (v: number) => string, max?: number) {
    const top = max ?? Math.max(...items.map((i) => i.value), 1e-9);
    const labelW = 150, valueW = 52;
    const barMax = PAGE_W - 2 * MARGIN - labelW - valueW;
    for (const it of items) {
      this.ensure(18);
      this.y -= 15;
      this.text(MARGIN, this.y, fitText(toWinAnsi(it.label), 9, labelW - 8), 9);
      const w = Math.max(1, Math.min(1, it.value / top) * barMax);
      this.rect(MARGIN + labelW, this.y - 2, barMax, 9, [236, 236, 236]);
      this.rect(MARGIN + labelW, this.y - 2, w, 9, this.o.accent);
      this.text(MARGIN + labelW + barMax + 6, this.y, toWinAnsi(format(it.value)), 9, { bold: true });
    }
    this.y -= 6;
    return this;
  }

  build(): Uint8Array {
    const total = this.pages.length;
    // Pied de page : marque à gauche, numéro à droite, sur chaque page.
    this.pages.forEach((p, i) => {
      p.ops.push(`${rgb([200, 200, 200])} rg ${num(MARGIN)} 46 ${num(PAGE_W - 2 * MARGIN)} 0.6 re f`);
      const left = fitText(toWinAnsi(this.o.footer), 8, PAGE_W - 2 * MARGIN - 110);
      p.ops.push(`BT /F1 8 Tf ${rgb([120, 120, 120])} rg ${num(MARGIN)} 34 Td (${escapePdf(left)}) Tj ET`);
      const right = toWinAnsi(this.o.pageLabel(i + 1, total));
      p.ops.push(`BT /F1 8 Tf ${rgb([120, 120, 120])} rg ${num(PAGE_W - MARGIN - textWidth(right, 8))} 34 Td (${escapePdf(right)}) Tj ET`);
    });

    // Numérotation des objets : 1 catalogue, 2 pages, 3 F1, 4 F2, 5 image (si logo), puis (page, contenu) par page.
    const logo = this.o.logo ?? null;
    const first = logo ? 6 : 5;
    type Obj = string | { head: string; data: Uint8Array };
    const objs: Obj[] = [];
    const kids = this.pages.map((_, i) => `${first + i * 2} 0 R`).join(" ");
    objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
    objs[2] = `<< /Type /Pages /Kids [${kids}] /Count ${total} >>`;
    objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
    objs[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
    if (logo) objs[5] = { head: `<< /Type /XObject /Subtype /Image /Width ${logo.width} /Height ${logo.height} /ColorSpace /${logo.components === 1 ? "DeviceGray" : "DeviceRGB"} /BitsPerComponent 8 /Filter /DCTDecode /Length ${logo.bytes.length} >>`, data: logo.bytes };
    const xobj = logo ? " /XObject << /Im1 5 0 R >>" : "";
    this.pages.forEach((p, i) => {
      const content = p.ops.join("\n");
      objs[first + i * 2] =
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(PAGE_W)} ${num(PAGE_H)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${xobj} >> /Contents ${first + i * 2 + 1} 0 R >>`;
      objs[first + i * 2 + 1] = `<< /Length ${content.length} >>\nstream\n${content}\nendstream`;
    });
    // Le dictionnaire Info utilise PDFDocEncoding : identique à Latin-1 sauf 0x80-0x9F (tirets, guillemets typographiques).
    const infoId = objs.length;
    objs[infoId] = `<< /Title (${escapePdf(toWinAnsi(this.o.title).replace(/[\u0080-\u009f]/g, "-"))}) >>`;

    const chunks: Uint8Array[] = [];
    const offsets: number[] = [];
    let pos = 0;
    const push = (b: Uint8Array | string) => {
      const u = typeof b === "string" ? latin1(b) : b;
      chunks.push(u);
      pos += u.length;
    };
    push("%PDF-1.4\n%âãÏÓ\n");
    for (let id = 1; id < objs.length; id++) {
      offsets[id] = pos;
      const o = objs[id];
      if (typeof o === "string") push(`${id} 0 obj\n${o}\nendobj\n`);
      else { push(`${id} 0 obj\n${o.head}\nstream\n`); push(o.data); push("\nendstream\nendobj\n"); }
    }
    const xrefAt = pos;
    let xref = `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objs.length; id++) xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
    push(xref + `trailer\n<< /Size ${objs.length} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`);

    const out = new Uint8Array(pos);
    let o = 0;
    for (const c of chunks) { out.set(c, o); o += c.length; }
    return out;
  }
}

function latin1(s: string): Uint8Array {
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i) & 0xff;
  return u;
}
