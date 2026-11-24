import { db } from './firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import { sendMail } from './brevo';
import { simpleEmail } from './mail';
import { merchantEmail } from './audit';
import { buildPdf, Page, wrap } from './pdf';
import { fromUnits } from './money';
import { warn } from './log';
import { SITE } from './site';

// Reçus de transaction : le PDF est généré EN MÉMOIRE, joint à l'e-mail puis jeté. Il n'est jamais écrit sur disque ni en base.
// Seul un indicateur d'envoi (receiptSentAt) est conservé sur la transaction, pour qu'un reçu ne parte qu'une seule fois.
// Ce document est un REÇU : il atteste d'une opération, il ne contient aucune mention de TVA ni de régime fiscal.

export type ReceiptRow = [label: string, value: string];
export type Receipt = {
  number: string; date: Date; heading: string; description: string;
  rows: ReceiptRow[]; totalLabel: string; total: string; footnote?: string;
};

/** Montant en unités internes (1 USD = 1 000 000) -> « 12.50 USD » (2 décimales, davantage seulement si nécessaire). */
export function usd(units: number): string {
  const s = fromUnits(Math.round(units)); const [i, f] = s.split('.');
  const dec = f.replace(/0+$/, ''); return `${i}.${dec.length < 2 ? dec.padEnd(2, '0') : dec} USD`;
}
/** Numéro de reçu stable, dérivé de l'identifiant de la transaction : REC-XXXXXXXXXX. */
export const receiptNumber = (id: string) => 'REC-' + id.replace(/[^A-Za-z0-9]/g, '').slice(0, 10).toUpperCase();
const dateFr = (d: Date) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long', timeStyle: 'short', timeZone: 'UTC' }).format(d) + ' UTC';

/** Dessine le reçu (A4, une page, déborde proprement sur une seconde si besoin). */
export function renderReceiptPdf(r: Receipt): Buffer {
  const pages: Page[] = []; let p = new Page(); pages.push(p);
  const L = 50, R = 545; let y = 790;
  p.rect(0, 806, 595.28, 36, 0.12); p.text(L, 819, 'Coinvera', 16, 'F2', 1); p.textRight(R, 820, 'Coinvera LLC · www.coinvera.me', 9, 'F1', 0.85);
  p.text(L, y - 22, r.heading, 20, 'F2'); y -= 46;
  p.text(L, y, 'Numéro', 9, 'F1', 0.4); p.text(L + 90, y, r.number, 10, 'F2');
  p.text(300, y, 'Date', 9, 'F1', 0.4); p.text(340, y, dateFr(r.date), 10, 'F1'); y -= 26;
  p.line(L, y, R, y); y -= 22;
  for (const l of wrap(r.description, 11, R - L, 'F2')) { p.text(L, y, l, 11, 'F2'); y -= 15; }
  y -= 10;
  const rowsHeight = (row: ReceiptRow) => Math.max(wrap(row[0], 10, 270).length, wrap(row[1], 10, 190).length) * 14 + 6;
  for (const row of r.rows) {
    const h = rowsHeight(row);
    if (y - h < 90) { p = new Page(); pages.push(p); y = 790; }
    const a = wrap(row[0], 10, 270), b = wrap(row[1], 10, 190);
    a.forEach((t, i) => p.text(L, y - i * 14, t, 10, 'F1', 0.25));
    b.forEach((t, i) => p.textRight(R, y - i * 14, t, 10, 'F1'));
    y -= h; p.line(L, y + 8, R, y + 8, 0.9);
  }
  if (y < 130) { p = new Page(); pages.push(p); y = 790; }
  y -= 14; p.rect(L, y - 10, R - L, 30, 0.95);
  p.text(L + 10, y, r.totalLabel, 12, 'F2'); p.textRight(R - 10, y, r.total, 12, 'F2'); y -= 44;
  if (r.footnote) for (const l of wrap(r.footnote, 9, R - L)) { p.text(L, y, l, 9, 'F1', 0.45); y -= 12; }
  pages.forEach((pg, i) => pg.text(L, 40, `Coinvera LLC — reçu généré automatiquement, valable sans signature.${pages.length > 1 ? `  Page ${i + 1}/${pages.length}` : ''}`, 8, 'F1', 0.5));
  return buildPdf(pages, { title: `${r.heading} ${r.number}` });
}

const receiptEmailHtml = (r: Receipt) => simpleEmail({
  title: r.heading,
  paragraphs: [r.description, `${r.totalLabel} : ${r.total}`, `Votre reçu ${r.number} est joint à cet e-mail (PDF). Conservez-le : il n'est pas archivé sur notre site.`],
  link: { href: `${SITE}/dashboard`, label: 'Ouvrir mon tableau de bord' }, note: 'Coinvera LLC — reçu généré automatiquement.',
});

/**
 * Envoie le reçu (PDF en pièce jointe) aux destinataires, UNE seule fois par document.
 * - `docPath` : document Firestore qui porte l'indicateur (`opts.flag`, par défaut `receiptSentAt`) (réservé de façon atomique avant l'envoi).
 * - `to` : adresses ; les doublons et adresses vides sont ignorés. Si aucun envoi n'aboutit, l'indicateur est retiré pour permettre un nouvel essai.
 * Ne lève jamais d'erreur : un échec de reçu ne doit jamais bloquer ni annuler une opération financière.
 */
export async function sendReceipt(docPath: string, r: Receipt, to: (string | null | undefined)[], opts: { merchantId?: string; flag?: string } = {}): Promise<boolean> {
  try {
    if (!process.env.BREVO_API_KEY || !process.env.SUPPORT_EMAIL) return false;
    const ref = db.doc(docPath); const flag = opts.flag ?? 'receiptSentAt';
    const claimed = await db.runTransaction(async tx => {
      const d = (await tx.get(ref)).data(); if (!d || d[flag]) return false;
      tx.update(ref, { [flag]: FieldValue.serverTimestamp() }); return true;
    });
    if (!claimed) return false;
    const list = [...new Set([...to, ...(opts.merchantId ? [await merchantEmail(opts.merchantId).catch(() => '')] : [])].map(x => (x ?? '').trim().toLowerCase()).filter(x => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x)))];
    if (!list.length) { await ref.update({ [flag]: FieldValue.delete() }); return false; }
    const pdf = renderReceiptPdf(r); const html = receiptEmailHtml(r); let sent = 0;
    for (const addr of list) {
      try { await sendMail(addr, `${r.heading} ${r.number}`, html, [{ name: `${r.number}.pdf`, content: pdf }]); sent++; }
      catch (e) { warn('receipt.send_failed', { docPath, message: (e as Error).message }); }
    }
    if (!sent) await ref.update({ [flag]: FieldValue.delete() });
    return sent > 0;
  } catch (e) { warn('receipt.failed', { docPath, message: (e as Error).message }); return false; }
}
