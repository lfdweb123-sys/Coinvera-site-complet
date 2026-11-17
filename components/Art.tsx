import { CheckCircle2 } from 'lucide-react';
import { CardLogos } from '@/components/Logos';
// Illustration de fond des bannieres (SVG vectoriel original) : v = variante de composition
export function BannerArt({ v = 0 }: { v?: number }) {
  const cx = [1130, 1000, 1180, 1262][v % 4], cy = [200, 260, 150, 230][v % 4], id = 'b' + v;
  return <svg className="art" viewBox="0 0 1440 560" preserveAspectRatio="xMaxYMid slice" aria-hidden="true" focusable="false">
    <defs><radialGradient id={'g' + id} cx={cx / 1440} cy={cy / 560} r=".6"><stop offset="0" stopColor="#2F63F5" stopOpacity=".6" /><stop offset="1" stopColor="#0A1535" stopOpacity="0" /></radialGradient>
      <pattern id={'p' + id} width="30" height="30" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="#fff" opacity=".14" /></pattern></defs>
    <rect width="1440" height="560" fill="#0A1535" /><rect width="1440" height="560" fill={`url(#g${id})`} /><rect width="1440" height="560" fill={`url(#p${id})`} />
    {[90, 170, 250, 330, 410].map(r => <circle key={r} cx={cx} cy={cy} r={r} fill="none" stroke="#fff" strokeOpacity={.09 - r / 8000} />)}
    <g transform={`translate(${cx - 250},${cy - 150}) rotate(-12)`}><rect width="250" height="152" rx="20" fill="#13317F" stroke="#5B86FF" strokeOpacity=".55" /><rect x="22" y="38" width="46" height="34" rx="7" fill="#F6C453" /><rect x="22" y="104" width="130" height="9" rx="4.500" fill="#fff" opacity=".4" /><rect x="22" y="122" width="76" height="9" rx="4.500" fill="#fff" opacity=".28" /><circle cx="208" cy="40" r="14" fill="#EB001B" opacity=".9" /><circle cx="224" cy="40" r="14" fill="#F79E1B" opacity=".9" /></g>
    <g transform={`translate(${cx + 90},${cy + 60})`}><circle r="56" fill="#26A17B" /><circle r="56" fill="none" stroke="#fff" strokeOpacity=".35" strokeWidth="3" /><path d="M-26 -20h52M0 -20v50" stroke="#fff" strokeWidth="11" strokeLinecap="round" /></g>
    <path d={`M${cx - 120} ${cy + 120} C ${cx - 40} ${cy + 40}, ${cx + 10} ${cy + 150}, ${cx + 60} ${cy + 80}`} fill="none" stroke="#8FB2FF" strokeOpacity=".7" strokeWidth="3" strokeDasharray="7 8" strokeLinecap="round" />
    {[[cx - 330, cy + 150, 7], [cx + 230, cy - 120, 9], [cx + 120, cy + 190, 6], [cx - 60, cy - 190, 8]].map(([x, y, r], i) => <circle key={i} cx={x} cy={y} r={r} fill="#8FB2FF" opacity=".55" />)}
  </svg>;
}
// Composition du hero : carte de paiement + Crypto Wallet (HTML/CSS, 100 % fluide)
export function HeroVisual() {
  return <div className="hv" aria-label="Aperçu illustratif du paiement et du portefeuille">
    <div className="hv-card hv-pay"><span className="hv-chip">Paiement confirmé</span>
      <div className="hv-top"><b style={{ color: 'var(--ink)', fontSize: 15 }}>Paiement sécurisé</b><CardLogos /></div>
      <div className="hv-row"><div><small>Montant dû</small><b>49,00 $</b></div><span className="badge ok">Commande #1042</span></div>
      <div className="hv-field"><span>•••• •••• •••• 4242</span><span>12/28</span></div><div className="hv-btn">Payer 49,00 $</div></div>
    <div className="hv-card hv-wallet"><div className="hv-top"><b style={{ color: 'var(--ink)', fontSize: 15 }}>Crypto Wallet</b><span className="badge info">USDT · TRC20</span></div>
      <div className="hv-row"><div><small>Solde disponible</small><b>1 248,50 $</b></div><span className="badge ok"><CheckCircle2 size={12} />Retrait automatique</span></div>
      <div className="hv-bars" aria-hidden="true">{[38, 52, 44, 66, 58, 80, 72, 94].map((h, i) => <i key={i} style={{ height: h + '%' }} />)}</div><div className="hv-btn dk">Retirer</div></div>
    <div className="mut" style={{ textAlign: 'center', fontSize: 12, marginTop: 14, color: '#9FB1D3' }}>Aperçu illustratif — données d’exemple</div></div>;
}
