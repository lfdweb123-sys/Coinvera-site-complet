import CryptoIcon from '@/components/CryptoIcon';
// Bandeau « Bybit + cryptomonnaies prises en charge », affiché juste avant le pied de page. Logo Bybit : marque verbale stylisée ; remplacez-la par le fichier officiel si vous en disposez.
const COINS: [string, string, string][] = [['Bitcoin', 'Bitcoin', 'BTC'], ['Ethereum', 'Ethereum', 'ETH'], ['USDT', 'Tether', 'USDT'], ['USDC', 'USD Coin', 'USDC'], ['Solana', 'Solana', 'SOL'], ['TRX', 'TRON', 'TRX'], ['BNB', 'BNB', 'BNB'], ['Litecoin', 'Litecoin', 'LTC'], ['Monero', 'Monero', 'XMR']];
export const BybitLogo = ({ height = 30 }: { height?: number }) => <svg height={height} viewBox="0 0 120 34" role="img" aria-label="Bybit" style={{ display: 'block' }}><text x="0" y="26" fontFamily="Arial Black,Arial,Helvetica,sans-serif" fontWeight="900" fontSize="28" letterSpacing="-.5" fill="currentColor">B<tspan fill="#F7A600">Y</tspan>BIT</text></svg>;
export default function CryptoStrip() {
  return <section className="cstrip" aria-label="Cryptomonnaies prises en charge"><div className="cs-in">
    <div className="cs-head"><span className="cs-eyebrow">Retraits en cryptomonnaie</span><h2>Les cryptos que vous utilisez déjà</h2><p>Retirez vos fonds vers l’actif de votre choix. Les retraits sont traités via notre partenaire d’échange.</p></div>
    <div className="cs-bybit"><span>Partenaire d’échange</span><BybitLogo /></div>
    <ul className="cs-coins">{COINS.map(([s, n, t]) => <li key={t} className="cs-coin"><CryptoIcon sym={s} size={38} /><span><b>{n}</b><small>{t}</small></span></li>)}</ul></div></section>;
}
