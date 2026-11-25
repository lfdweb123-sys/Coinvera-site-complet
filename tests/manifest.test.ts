import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import manifest from '@/app/manifest';
// Garde-fou PWA : une icône déclarée mais absente (ou de mauvaise taille) rend l'application non installable ou sans image sur mobile.
const png = (f: string) => { const b = readFileSync(f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }; };
describe('manifeste PWA', () => {
  const icons = manifest().icons as { src: string; sizes: string; type: string; purpose: string }[];
  it('toutes les icônes déclarées existent', () => { for (const i of icons) expect(existsSync(i.src === '/icon.svg' ? 'app/icon.svg' : 'public' + i.src), i.src).toBe(true); });
  it('la taille déclarée de chaque PNG est la taille réelle', () => {
    for (const i of icons.filter(x => x.type === 'image/png')) { const { w, h } = png('public' + i.src); expect(`${w}x${h}`, i.src).toBe(i.sizes); }
  });
  it('fournit les icônes exigées par Chrome (192 et 512, « any » et « maskable »)', () => {
    for (const p of ['any', 'maskable']) for (const s of ['192x192', '512x512']) expect(icons.some(i => i.purpose === p && i.sizes === s && i.type === 'image/png'), `${p} ${s}`).toBe(true);
  });
  it('l’icône iPhone est un carré opaque de 180 px (sinon iOS affiche des coins noirs)', () => {
    const b = readFileSync('app/apple-icon.png'); expect([b.readUInt32BE(16), b.readUInt32BE(20)]).toEqual([180, 180]);
    expect(b[25]).toBe(2);   // type de couleur PNG 2 = RVB sans canal alpha ; 6 = RVBA (transparence possible)
  });
});
