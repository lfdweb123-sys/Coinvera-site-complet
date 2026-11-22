import { describe, expect, it } from 'vitest';
import { activateSlots, deactivateSlots } from '@/lib/license-slots';
const A = 'https://shop.test';
describe('emplacements de licence par plugin', () => {
  it('active deux plugins sur le même site avec un seul emplacement de site', () => {
    const a = activateSlots([], [], A, 'donations'); expect(a.addedSite).toBe(true);
    const b = activateSlots(a.sites, a.slots, A, 'invoices');
    expect(b.addedSite).toBe(false); expect(b.sites).toEqual([A]); expect(b.slots).toEqual([`${A}|donations`, `${A}|invoices`]);
  });
  it('est idempotent', () => {
    const a = activateSlots([A], [`${A}|tickets`], A, 'tickets'); expect(a.slots).toEqual([`${A}|tickets`]); expect(a.addedSite).toBe(false);
  });
  it('désactiver un plugin ne libère pas le site tant qu’un autre l’utilise', () => {
    const a = activateSlots([A], [`${A}|woocommerce`, `${A}|donations`], A, 'tickets');
    const d = deactivateSlots(a.sites, a.slots, A, 'donations'); expect(d.sites).toEqual([A]); expect(d.slots).toEqual([`${A}|woocommerce`, `${A}|tickets`]);
  });
  it('libère le site quand le dernier plugin est désactivé', () => {
    const d = deactivateSlots([A], [`${A}|donations`], A, 'donations'); expect(d.sites).toEqual([]); expect(d.slots).toEqual([]);
  });
  it('site antérieur sans emplacement : le plugin WooCommerce est présumé présent', () => {
    const a = activateSlots([A], [], A, 'donations'); expect(a.slots).toEqual([`${A}|woocommerce`, `${A}|donations`]);
    const keep = deactivateSlots([A], [], A, 'donations'); expect(keep.sites).toEqual([A]);   // ancien site, autre plugin : rien ne change
    const off = deactivateSlots([A], [], A);             expect(off.sites).toEqual([]);      // ancien plugin WooCommerce (sans nom) : libère
  });
  it('ne confond pas deux origines proches', () => {
    const d = deactivateSlots([A, `${A}.evil`], [`${A}|donations`, `${A}.evil|donations`], A, 'donations');
    expect(d.sites).toEqual([`${A}.evil`]); expect(d.slots).toEqual([`${A}.evil|donations`]);
  });
});
