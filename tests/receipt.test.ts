import { describe, expect, it, vi, beforeEach } from 'vitest';
import { writeFileSync } from 'node:fs';

// Faux Firestore en mémoire : un seul document, transaction simple.
const store: Record<string, any> = {};
vi.mock('@/lib/firebase-admin', () => ({
  adminAuth: { getUser: async () => ({ email: 'merchant@example.com' }) },
  db: {
    doc: (p: string) => ({ get: async () => ({ data: () => store[p] }), update: async (u: any) => { for (const [k, v] of Object.entries(u)) { if (v && (v as any).__del) delete store[p][k]; else store[p][k] = v; } } }),
    runTransaction: async (fn: any) => fn({ get: async (r: any) => r.get(), update: (r: any, u: any) => { r.update(u); } }),
  },
}));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'TS', delete: () => ({ __del: true }) } }));
import { usd, receiptNumber, renderReceiptPdf, sendReceipt } from '@/lib/receipt';
import { winAnsi, wrap, textWidth } from '@/lib/pdf';

const R = { number: 'REC-ABC', date: new Date('2026-11-24T10:00:00Z'), heading: 'Reçu de paiement', description: 'Commande n° 42 — Café « Éthiopie » œuvre €', rows: [['Montant', '12.50 USD']] as [string, string][], totalLabel: 'Total', total: '12.50 USD' };

describe('formats', () => {
  it('usd : 2 décimales minimum, plus si nécessaire', () => { expect(usd(12_500_000)).toBe('12.50 USD'); expect(usd(1_234_567)).toBe('1.234567 USD'); expect(usd(0)).toBe('0.00 USD'); });
  it('numéro de reçu stable', () => { expect(receiptNumber('ab-c12XYZ9876543')).toBe('REC-ABC12XYZ98'); });
  it('WinAnsi : accents et € conservés, inconnu -> ?', () => { expect(winAnsi('é€')).toEqual([0xe9, 128]); expect(winAnsi('日')).toEqual([63]); expect(winAnsi('a\u0000b')).toEqual([97, 98]); });
  it('wrap : jamais plus large que la limite', () => { for (const l of wrap('x'.repeat(200) + ' mot court', 10, 120)) expect(textWidth(l, 10)).toBeLessThanOrEqual(120); });
});
describe('PDF', () => {
  it('structure valide, en mémoire', () => {
    const b = renderReceiptPdf({ ...R, rows: Array.from({ length: 80 }, (_, i) => [`Ligne ${i}`, '1.00 USD'] as [string, string]) });
    const s = b.toString('latin1'); expect(s.startsWith('%PDF-1.4')).toBe(true); expect(s.trimEnd().endsWith('%%EOF')).toBe(true);
    const off = Number(/startxref\n(\d+)/.exec(s)![1]); expect(s.slice(off, off + 4)).toBe('xref');
    expect((s.match(/\/Type \/Page /g) ?? []).length).toBeGreaterThan(1);
    writeFileSync('/tmp/receipt-test.pdf', renderReceiptPdf(R));
  });
});
describe('envoi', () => {
  beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; process.env.BREVO_API_KEY = 'k'; process.env.SUPPORT_EMAIL = 's@coinvera.me'; });
  it('une seule fois, PDF en pièce jointe, aucun PDF stocké', async () => {
    store['transactions/t1'] = { merchantId: 'm1' };
    const bodies: any[] = []; vi.stubGlobal('fetch', vi.fn(async (_u: string, i: any) => { bodies.push(JSON.parse(i.body)); return { ok: true, status: 201 }; }));
    expect(await sendReceipt('transactions/t1', R, ['Client@Example.com', 'client@example.com'], { merchantId: 'm1' })).toBe(true);
    expect(await sendReceipt('transactions/t1', R, ['client@example.com'], { merchantId: 'm1' })).toBe(false);
    expect(bodies).toHaveLength(2);   // client (dédoublonné) + marchand
    const att = bodies[0].attachment[0]; expect(att.name).toBe('REC-ABC.pdf'); expect(Buffer.from(att.content, 'base64').toString('latin1').startsWith('%PDF')).toBe(true);
    expect(JSON.stringify(store['transactions/t1'])).not.toContain('JVBER');   // pas de PDF en base
    expect(Object.keys(store['transactions/t1']).sort()).toEqual(['merchantId', 'receiptSentAt']);
  });
  it('échec d’envoi : indicateur retiré pour un nouvel essai, aucune exception', async () => {
    store['transactions/t2'] = { merchantId: 'm1' };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    expect(await sendReceipt('transactions/t2', R, ['a@b.co'])).toBe(false);
    expect(store['transactions/t2'].receiptSentAt).toBeUndefined();
  });
  it('sans clé e-mail : rien n’est réservé', async () => {
    delete process.env.BREVO_API_KEY; store['transactions/t3'] = {};
    expect(await sendReceipt('transactions/t3', R, ['a@b.co'])).toBe(false); expect(store['transactions/t3'].receiptSentAt).toBeUndefined();
  });
});
