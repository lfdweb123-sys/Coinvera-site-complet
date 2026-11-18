import { ShieldCheck } from 'lucide-react';
export const LogoMark = ({ s = 34 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="11" fill="#2255E8" /><path d="M25.5 13.2A9 9 0 1 0 25.5 26.8" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" /><circle cx="27" cy="20" r="3.6" fill="#7FB0FF" /></svg>;
export function FlowArt() {
  const N = ({ x, t, l1, l2, c }: { x: number; t: string; l1: string; l2: string; c: string }) => <g><rect x={x} y="50" width="170" height="110" rx="16" fill="#fff" stroke={c} strokeWidth="2" /><text x={x + 85} y="92" textAnchor="middle" fontSize="16" fontWeight="700" fill="#0B1220" fontFamily="Manrope,Inter,sans-serif">{t}</text><text x={x + 85} y="119" textAnchor="middle" fontSize="12.5" fill="#64748B" fontFamily="Inter,sans-serif">{l1}</text><text x={x + 85} y="137" textAnchor="middle" fontSize="12.5" fill="#64748B" fontFamily="Inter,sans-serif">{l2}</text></g>;
  return <svg viewBox="0 0 660 210" role="img" aria-label="Le client paie par carte, Coinvera vérifie le paiement et crédite le marchand, le marchand retire en USDT" style={{ width: '100%', height: 'auto' }}>
    <N x={10} t="Client" l1="Carte Visa" l2="ou Mastercard" c="#D5DCE8" /><N x={245} t="Coinvera" l1="Paiement vérifié" l2="Solde crédité" c="#2255E8" /><N x={480} t="Marchand" l1="Retrait" l2="en USDT" c="#0E9F6E" />
    {[182, 417].map(x => <g key={x}><path d={`M${x} 105 H${x + 48}`} stroke="#2255E8" strokeWidth="2.500" strokeDasharray="6 5" /><path d={`M${x + 41} 97 L${x + 51} 105 L${x + 41} 113`} fill="none" stroke="#2255E8" strokeWidth="2.500" /></g>)}
    <text x="330" y="196" textAnchor="middle" fontSize="13" fill="#64748B" fontFamily="Inter,sans-serif">Exemple : 100 USDT encaissés · 3 USDT de commission · 97 USDT nets</text></svg>;
}
export function CodeWindow() {
  return <div className="code" aria-label="Exemple de code"><div style={{ display: 'flex', gap: 6, marginBottom: 12 }}><i style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF5F57' }} /><i style={{ width: 10, height: 10, borderRadius: '50%', background: '#FEBC2E' }} /><i style={{ width: 10, height: 10, borderRadius: '50%', background: '#28C840' }} /></div>
    <pre>{`POST /api/v1/payments
X-Api-Key: cv_pk_…
X-Timestamp: 1763300000000
X-Nonce: 9f2c…
X-Signature: HMAC-SHA256(…)

{ "amount": 49.90,
  "title": "Commande #1042" }

→ 201 Created
{ "id": "…", "status": "pending",
  "checkoutUrl": "https://…" }`}</pre></div>;
}
export function ShieldArt() {
  return <svg viewBox="0 0 360 300" role="img" aria-label="Bouclier de sécurité" style={{ width: '100%', maxWidth: 420, height: 'auto' }}><circle cx="180" cy="150" r="120" fill="#16233E" /><circle cx="180" cy="150" r="84" fill="#1B2D52" />
    <path d="M180 62l72 26v54c0 48-31 82-72 98-41-16-72-50-72-98V88z" fill="#2255E8" /><path d="M148 148l24 24 42-48" fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
    {[[60, 80], [300, 70], [320, 200], [50, 220]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="6" fill="#7FB0FF" opacity=".7" />)}</svg>;
}
export const SafeIcon = ShieldCheck;
