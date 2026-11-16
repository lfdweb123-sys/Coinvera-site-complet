import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/firebase-admin', () => ({ db: { doc: (p: string) => ({ path: p }) } }));
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'ts' } }));
import { postEntry } from '@/lib/ledger';
const tx = () => ({ create: vi.fn() }) as any;
describe('registre comptable', () => {
  it('accepte une ecriture equilibree', () => { const t = tx(); postEntry(t, 'e1', 'm', 't', [{ account: 'a', dir: 'debit', amount: 100 }, { account: 'b', dir: 'credit', amount: 100 }]); expect(t.create).toHaveBeenCalledOnce(); });
  it('refuse une ecriture desequilibree', () => { expect(() => postEntry(tx(), 'e2', 'm', 't', [{ account: 'a', dir: 'debit', amount: 100 }, { account: 'b', dir: 'credit', amount: 99 }])).toThrow('unbalanced_entry'); });
  it('refuse les montants non entiers ou negatifs', () => { expect(() => postEntry(tx(), 'e3', 'm', 't', [{ account: 'a', dir: 'debit', amount: 1.5 }, { account: 'b', dir: 'credit', amount: 1.5 }])).toThrow(); });
});
