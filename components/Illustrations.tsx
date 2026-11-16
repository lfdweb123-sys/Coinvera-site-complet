import { ArrowDownToLine, CheckCircle2, ShieldCheck } from 'lucide-react';
export const LogoMark = ({ s = 34 }: { s?: number }) => <svg width={s} height={s} viewBox="0 0 40 40" aria-hidden="true"><rect width="40" height="40" rx="11" fill="#2255E8" /><path d="M25.5 13.2A9 9 0 1 0 25.5 26.8" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round" /><circle cx="27" cy="20" r="3.6" fill="#7FB0FF" /></svg>;
const bars = [34, 52, 41, 66, 58, 80, 72, 92];
export function HeroMock() {
  return <div style={{ position: 'relative', paddingBottom: 20 }}><div className="mock"><div className="bar"><i /><i /><i /></div>
    <div className="body"><div className="sb"><b className="on">Overview</b><b>Transactions</b><b>Withdrawals</b><b>Balances</b><b>API</b><b>WooCommerce</b></div>
      <div className="main"><div className="kp"><div><small>Disponible</small><strong>1 248,50 $</strong></div><div><small>Réservé</small><strong>150,00 $</strong></div><div><small>Reçu ce mois</small><strong>3 920,00 $</strong></div></div>
        <svg viewBox="0 0 320 90" style={{ width: '100%', height: 90 }} role="img" aria-label="Graphique d’exemple">{bars.map((h, i) => <rect key={i} x={i * 40 + 6} y={90 - h} width="26" height={h} rx="6" fill={i === 7 ? '#2255E8' : '#DCE6FD'} />)}</svg>
        <div className="tx">{[['Commande #1042', '49,90 $', 'ok', 'Confirmé'], ['Commande #1041', '120,00 $', 'ok', 'Confirmé'], ['Commande #1043', '35,00 $', 'warn', 'En attente']].map(r => <div key={r[0]}><span>{r[0]}</span><b>{r[1]}</b><span className={'badge ' + r[2]}>{r[3]}</span></div>)}</div></div></div></div>
    <div className="float" style={{ right: -6, top: 70 }}><span className="dot" style={{ background: 'var(--oksoft)', color: 'var(--ok)' }}><CheckCircle2 size={18} /></span><span><b>Paiement confirmé</b><br /><span className="mut">3-D Secure vérifié</span></span></div>
    <div className="float" style={{ left: -10, bottom: 0 }}><span className="dot" style={{ background: 'var(--brandsoft)', color: 'var(--brand)' }}><ArrowDownToLine size={18} /></span><span><b>Retrait envoyé</b><br /><span className="mut">USDT · TRC20</span></span></div>
    <div className="mut" style={{ textAlign: 'center', fontSize: 12, marginTop: 14 }}>Aperçu illustratif — données d’exemple</div></div>;
}
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
