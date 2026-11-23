import { FieldValue } from 'firebase-admin/firestore';
import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { createCharge } from '@/lib/processor';
import { ipOf, rateLimit } from '@/lib/ratelimit';
import { info, warn, error } from '@/lib/log';
const page = (t: string, m: string, s = 404) => new Response(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${t}</title></head><body style="margin:0;min-height:100vh;display:grid;place-items:center;background:#F5F8FC;font-family:Inter,Arial,sans-serif;color:#0B1220;padding:16px"><div style="max-width:440px;width:100%;background:#fff;border:1px solid #E5EAF2;border-radius:16px;padding:32px;text-align:center"><div style="font-weight:800;font-size:22px;margin-bottom:14px">Coinvera</div><h1 style="font-size:22px;margin:0 0 10px">${t}</h1><p style="color:#64748B;line-height:1.6;margin:0">${m}</p></div></body></html>`, { status: s, headers: { 'content-type': 'text/html; charset=utf-8' } });
// Lien de paiement public : cree un paiement a chaque visite puis redirige vers la page de paiement securisee.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try { await rateLimit('pay_' + ipOf(req), 15, 60); await rateLimit('paylink_' + id.slice(0, 40), 20, 60); } catch { return page('Trop de tentatives', 'Veuillez réessayer dans quelques instants.', 429); }
  const l = (await db.doc(`payment_links/${id}`).get()).data();
  if (!l || l.deleted || !l.active) { info('link.unavailable', { linkId: id }); return page('Lien indisponible', 'Ce lien de paiement n’existe pas ou n’est plus actif.'); }
  const act = (await db.doc(`api_activations/${l.merchantId}`).get()).data();
  if (!act?.activated) { warn('link.merchant_not_activated', { linkId: id, merchantId: l.merchantId }); return page('Paiement momentanément indisponible', 'Le marchand n’est pas encore en mesure d’accepter ce paiement.', 503); }
  const ref = db.collection('transactions').doc();
  try { await ref.set({ merchantId: l.merchantId, amount: l.amount, currency: 'USD', title: l.title, orderRef: 'link:' + id, mode: 'live', status: 'pending', createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    const ch = await createCharge('live', { amount: l.amount / 1e6, title: l.title, description: ref.id }); await ref.update({ processorChargeId: ch.id }); await db.doc(`payment_links/${id}`).update({ uses: FieldValue.increment(1) });
    info('link.checkout_created', { linkId: id, transactionId: ref.id, merchantId: l.merchantId }); return NextResponse.redirect(ch.checkout_url, 303);
  } catch (e) { error('link.checkout_failed', { linkId: id, message: (e as Error).message }); return page('Paiement indisponible', 'Impossible de démarrer le paiement. Réessayez dans quelques instants.', 502); }
}
