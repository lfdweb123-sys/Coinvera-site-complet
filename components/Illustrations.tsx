import { ShieldCheck } from 'lucide-react';
export const LogoMark = ({ s = 34 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="11" fill="#2255E8" /><path d="M25.5 13.2A9 9 0 1 0 25.5 26.8" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" /><circle cx="27" cy="20" r="3.6" fill="#7FB0FF" /></svg>;
export function FlowArt() {
  const N = ({ x, t, s, c }: { x: number; t: string; s: string; c: string }) => <g><rect x={x} y="60" width="150" height="96" rx="16" fill="#fff" stroke={c} strokeWidth="2" /><text x={x + 75} y="100" textAnchor="middle" fontSize="15" fontWeight="700" fill="#0B1220" fontFamily="Space Grotesk,sans-serif">{t}</text><text x={x + 75} y="124" textAnchor="middle" fontSize="12" fill="#64748B" fontFamily="Inter,sans-serif">{s}</text></g>;
  return <svg viewBox="0 0 640 220" role="img" aria-label="Le client paie par carte, Coinvera crédite le marchand, le marchand retire en USDT" style={{ width: '100%', height: 'auto' }}>
    <N x={10} t="Client" s="Carte Visa / Mastercard" c="#D5DCE8" /><N x={245} t="Coinvera" s="Paiement vérifié · solde crédité" c="#2255E8" /><N x={480} t="Marchand" s="Retrait en USDT" c="#0E9F6E" />
    {[160, 395].map(x => <g key={x}><path d={`M${x} 108 H${x + 80}`} stroke="#2255E8" strokeWidth="2.5" strokeDasharray="6 5" /><path d={`M${x + 72} 100 L${x + 82} 108 L${x + 72} 116`} fill="none" stroke="#2255E8" strokeWidth="2.5" /></g>)}
    <text x="320" y="200" textAnchor="middle" fontSize="13" fill="#64748B" fontFamily="Inter,sans-serif">Exemple : 100 USDT encaissés · 3 USDT de commission · 97 USDT nets</text></svg>;
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
