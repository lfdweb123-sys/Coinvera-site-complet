import { Timestamp } from 'firebase-admin/firestore';
import { fromUnits } from './money';
import { db } from './firebase-admin';
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

// Liste les documents d'un marchand SANS index composite : filtre simple cote Firestore, tri fait cote serveur.
export async function byMerchant(col: string, merchantId: string, max = 200) {
  const s = await db.collection(col).where('merchantId', '==', merchantId).limit(1000).get();
  const t = (d: FirebaseFirestore.QueryDocumentSnapshot) => { const v = d.data().createdAt; return v?.toMillis ? v.toMillis() : v instanceof Date ? v.getTime() : 0; };
  return s.docs.sort((a, b) => t(b) - t(a)).slice(0, max).map(x => ({ id: x.id, ...ser(x.data()) }));
}
