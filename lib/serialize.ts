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

export const pq = (req: Request) => { const u = new URL(req.url).searchParams; return { page: Math.max(1, Number(u.get('page') || 1)), size: Math.min(100, Math.max(1, Number(u.get('size') || 20))), u }; };
// Liste paginee des documents d'un marchand SANS index composite : filtre simple cote Firestore, tri/filtre/pagination cote serveur.
export async function byMerchant(col: string, merchantId: string, req: Request, filter: (x: any) => boolean = () => true) {
  const { page, size } = pq(req);
  const s = await db.collection(col).where('merchantId', '==', merchantId).limit(5000).get();
  const t = (d: FirebaseFirestore.QueryDocumentSnapshot) => { const v = d.data().createdAt; return v?.toMillis ? v.toMillis() : v instanceof Date ? v.getTime() : 0; };
  const all = s.docs.sort((a, b) => t(b) - t(a)).map(x => ({ id: x.id, ...ser(x.data()) })).filter(filter);
  return { items: all.slice((page - 1) * size, page * size), total: all.length, page, size };
}
