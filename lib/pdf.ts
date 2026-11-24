// Générateur PDF minimal, sans dépendance, EN MÉMOIRE uniquement : rien n'est écrit sur disque ni en base.
// Polices standard Helvetica / Helvetica-Bold (WinAnsi : accents français, €, œ, guillemets) : aucune police à embarquer.
const W_REG = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,761,556,278,222,556,333,1000,556,556,333,1000,667,333,1000,278,611,278,278,222,222,333,333,350,556,1000,333,1000,500,333,944,278,500,667,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500];
const W_BOLD = [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,761,556,278,278,556,500,1000,556,556,333,1000,667,333,1000,278,611,278,278,278,278,500,500,350,556,1000,333,1000,556,333,944,278,500,667,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556];
const CP1252: Record<number, number> = { 0x20AC: 128, 0x201A: 130, 0x0192: 131, 0x201E: 132, 0x2026: 133, 0x2020: 134, 0x2021: 135, 0x02C6: 136, 0x2030: 137, 0x0160: 138, 0x2039: 139, 0x0152: 140, 0x017D: 142,
  0x2018: 145, 0x2019: 146, 0x201C: 147, 0x201D: 148, 0x2022: 149, 0x2013: 150, 0x2014: 151, 0x02DC: 152, 0x2122: 153, 0x0161: 154, 0x203A: 155, 0x0153: 156, 0x017E: 158, 0x0178: 159 };
/** Texte -> octets WinAnsi ; tout caractère non représentable devient « ? » ; contrôles retirés. */
export function winAnsi(s: string): number[] {
  const out: number[] = [];
  for (const ch of s.normalize('NFC')) {
    const c = ch.codePointAt(0)!;
    if (c === 0x09 || c === 0x0A || c === 0x0D) out.push(32);
    else if (c < 32 || (c >= 127 && c < 160)) continue;
    else if (c < 127 || (c >= 160 && c <= 255)) out.push(c);
    else out.push(CP1252[c] ?? 63);
  }
  return out;
}
export type Font = 'F1' | 'F2';
export function textWidth(s: string, size: number, f: Font = 'F1'): number {
  const w = f === 'F1' ? W_REG : W_BOLD; let t = 0;
  for (const b of winAnsi(s)) t += w[b - 32] ?? 556;
  return (t * size) / 1000;
}
/** Coupe un texte en lignes de largeur maximale `max` (points) ; un mot trop long est coupé au caractère. */
export function wrap(s: string, size: number, max: number, f: Font = 'F1'): string[] {
  const lines: string[] = []; let cur = '';
  for (const word of s.split(/\s+/).filter(Boolean)) {
    let w = word;
    while (textWidth(w, size, f) > max) { let k = w.length; while (k > 1 && textWidth(w.slice(0, k), size, f) > max) k--; if (cur) { lines.push(cur); cur = ''; } lines.push(w.slice(0, k)); w = w.slice(k); }
    const test = cur ? cur + ' ' + w : w;
    if (textWidth(test, size, f) <= max) cur = test; else { if (cur) lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}
const hex = (bytes: number[]) => '<' + bytes.map(b => b.toString(16).padStart(2, '0')).join('') + '>';
const n2 = (x: number) => (Math.round(x * 100) / 100).toString();
export class Page {
  ops: string[] = [];
  text(x: number, y: number, s: string, size = 10, f: Font = 'F1', gray = 0) { this.ops.push(`${n2(gray)} g BT /${f} ${size} Tf ${n2(x)} ${n2(y)} Td ${hex(winAnsi(s))} Tj ET`); }
  textRight(xr: number, y: number, s: string, size = 10, f: Font = 'F1', gray = 0) { this.text(xr - textWidth(s, size, f), y, s, size, f, gray); }
  line(x1: number, y1: number, x2: number, y2: number, gray = 0.8) { this.ops.push(`${n2(gray)} G 0.6 w ${n2(x1)} ${n2(y1)} m ${n2(x2)} ${n2(y2)} l S`); }
  rect(x: number, y: number, w: number, h: number, gray: number) { this.ops.push(`${n2(gray)} g ${n2(x)} ${n2(y)} ${n2(w)} ${n2(h)} re f`); }
}
/** Assemble un PDF 1.4 (A4) à partir des pages ; renvoie les octets. Métadonnées : titre et auteur (nettoyés). */
export function buildPdf(pages: Page[], meta: { title: string; author?: string }): Buffer {
  const objs: string[] = [];
  const add = (s: string) => { objs.push(s); return objs.length; };
  const cat = add(''), pgs = add(''), f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'), f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids: number[] = [];
  for (const p of pages) {
    const body = p.ops.join('\n');
    const c = add(`<< /Length ${Buffer.byteLength(body, 'latin1')} >>\nstream\n${body}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pgs} 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`));
  }
  objs[pgs - 1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  objs[cat - 1] = `<< /Type /Catalog /Pages ${pgs} 0 R >>`;
  const info = add(`<< /Title ${hex(winAnsi(meta.title))} /Author ${hex(winAnsi(meta.author ?? 'Coinvera'))} /Producer (Coinvera) >>`);
  let out = '%PDF-1.4\n'; const offs: number[] = [];
  objs.forEach((o, i) => { offs.push(Buffer.byteLength(out, 'latin1')); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out, 'latin1');
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('') + `trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
