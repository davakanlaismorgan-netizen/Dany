import assert from "node:assert/strict";
import { fitText, MAX_LOGO_BYTES, parseJpeg, PdfBuilder, textWidth, toWinAnsi, wrapText } from "./pdf.ts";

const opts = { title: "Test", footer: "pied", accent: [10, 20, 30] as [number, number, number], brandName: "Marque", pageLabel: (n: number, t: number) => `P ${n}/${t}` };
const latin1 = (b: Uint8Array) => new TextDecoder("latin1").decode(b);

Deno.test("toWinAnsi : accents français, euro, espaces insécables, caractères hors cp1252", () => {
  assert.equal(toWinAnsi("é à ç"), "é à ç");
  assert.equal(toWinAnsi("5 €"), "5 \u0080");
  assert.equal(toWinAnsi("a b c"), "a b c");
  assert.equal(toWinAnsi("œ’"), "\u009c\u0092");
  assert.equal(toWinAnsi("日本"), "??");
  assert.equal(toWinAnsi("a\u0000b\nc"), "a b c");
});

Deno.test("wrapText : aucune ligne ne dépasse la largeur, y compris un mot sans espace", () => {
  const lines = wrapText("Un texte assez long pour passer à la ligne plusieurs fois " + "x".repeat(200), 10, 200);
  assert.ok(lines.length > 3);
  for (const l of lines) assert.ok(textWidth(l, 10) <= 200 + 1e-6, `trop large: ${l}`);
  assert.deepEqual(wrapText("", 10, 100), [""]);
});

Deno.test("fitText : tronque avec une ellipse et ne touche pas un texte qui tient", () => {
  assert.equal(fitText("court", 9, 200), "court");
  const cut = fitText("a".repeat(100), 9, 60);
  assert.ok(cut.endsWith("\u0085") && textWidth(cut, 9) <= 60);
});

Deno.test("PDF : structure valide, table xref exacte, texte échappé", () => {
  const pdf = new PdfBuilder(opts);
  pdf.title("Titre (avec) parenthèses \\ et accents é").heading("Section").paragraph("Texte (entre) parenthèses.")
    .keyValues([["Clé", "Valeur"]]).table(["A", "B"], [["1", "2"], ["3", "4"]], [0.5, 0.5]).bars([{ label: "x", value: 2 }], String);
  const s = latin1(pdf.build());
  assert.ok(s.startsWith("%PDF-1.4"));
  assert.ok(s.trimEnd().endsWith("%%EOF"));
  const xrefAt = Number(/startxref\n(\d+)\n/.exec(s)![1]);
  assert.equal(s.slice(xrefAt, xrefAt + 4), "xref");
  const entries = [...s.slice(xrefAt).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
  assert.ok(entries.length >= 6);
  entries.forEach((off, i) => assert.equal(s.slice(off, off + `${i + 1} 0 obj`.length), `${i + 1} 0 obj`));
  assert.ok(s.includes("\\(avec\\)") && s.includes("\\\\"));
  assert.ok(!s.includes("/Producer"), "aucune mention de la plateforme dans les métadonnées");
});

Deno.test("PDF : plusieurs pages, numérotation « n / total » sur chacune", () => {
  const pdf = new PdfBuilder(opts);
  for (let i = 0; i < 200; i++) pdf.bullet(`Point numéro ${i}`);
  const s = latin1(pdf.build());
  const total = Number(/\/Count (\d+)/.exec(s)![1]);
  assert.ok(total >= 3);
  for (let p = 1; p <= total; p++) assert.ok(s.includes(`(P ${p}/${total})`));
});

Deno.test("PDF : un tableau qui déborde reprend son en-tête sur la page suivante", () => {
  const pdf = new PdfBuilder(opts);
  pdf.table(["Colonne"], Array.from({ length: 120 }, (_, i) => [`ligne ${i}`]), [1]);
  const s = latin1(pdf.build());
  assert.ok((s.match(/\(Colonne\)/g) ?? []).length >= 2);
});

// JPEG synthétique : SOI, APP0 vide, SOF0 (8 bits, hauteur, largeur, composantes), EOI.
const jpeg = (w: number, h: number, comps: number, marker = 0xc0, precision = 8) =>
  new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0xff, marker, 0x00, 0x0b, precision, h >> 8, h & 255, w >> 8, w & 255, comps, 1, 0x11, 0, 0xff, 0xd9]);

Deno.test("parseJpeg : accepte gris et RVB, refuse le reste", () => {
  assert.deepEqual({ ...parseJpeg(jpeg(40, 20, 3))!, bytes: undefined }, { bytes: undefined, width: 40, height: 20, components: 3 });
  assert.equal(parseJpeg(jpeg(10, 10, 1))!.components, 1);
  assert.equal(parseJpeg(jpeg(10, 10, 1, 0xc2))!.width, 10); // progressif
  assert.equal(parseJpeg(jpeg(10, 10, 4)), null); // CMYK
  assert.equal(parseJpeg(jpeg(10, 10, 3, 0xc0, 12)), null); // 12 bits
  assert.equal(parseJpeg(jpeg(10, 10, 3, 0xc9)), null); // arithmétique
  assert.equal(parseJpeg(jpeg(5000, 10, 3)), null); // démesuré
  assert.equal(parseJpeg(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0])), null); // PNG
  assert.equal(parseJpeg(new Uint8Array(0)), null);
  assert.equal(parseJpeg(new Uint8Array(MAX_LOGO_BYTES + 1).fill(0)), null);
  assert.equal(parseJpeg(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0xff, 0xff, 0, 0])), null); // longueur de segment mensongère
});

Deno.test("PDF : un logo JPEG est embarqué tel quel avec la bonne longueur", () => {
  const logo = parseJpeg(jpeg(60, 30, 3))!;
  const s = latin1(new PdfBuilder({ ...opts, logo }).paragraph("x").build());
  assert.ok(s.includes("/Subtype /Image /Width 60 /Height 30 /ColorSpace /DeviceRGB"));
  assert.ok(s.includes(`/Length ${logo.bytes.length}`));
  assert.ok(s.includes("/Im1 Do"));
});
