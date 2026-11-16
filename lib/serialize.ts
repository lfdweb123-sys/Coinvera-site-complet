import { Timestamp } from 'firebase-admin/firestore';
import { fromUnits } from './money';
const U = ['amount', 'net', 'amountUnits', 'available', 'reserved'];
export function ser(d: any): any {
  if (d instanceof Timestamp) return d.toDate().toISOString();
  if (Array.isArray(d)) return d.map(ser);
  if (d && typeof d === 'object') {
    const o: any = {};
    for (const [k, v] of Object.entries(d)) {
      if (['secretEnc', 'webhookSecret'].includes(k)) continue;
      o[k] = typeof v === 'number' && U.includes(k) ? fromUnits(v)
        : k === 'fees' && v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as any).map(([a, b]) => [a, fromUnits(b as number)])) : ser(v);
    }
    return o;
  }
  return d;
}
export const rows = (s: FirebaseFirestore.QuerySnapshot) => s.docs.map(x => ({ id: x.id, ...ser(x.data()) }));
