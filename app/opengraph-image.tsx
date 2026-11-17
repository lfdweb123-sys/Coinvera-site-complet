import { ImageResponse } from 'next/og';
export const alt = 'Coinvera — Encaissez par carte, retirez en crypto'; export const size = { width: 1200, height: 630 }; export const contentType = 'image/png';
export default function Image() {
  return new ImageResponse(<div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: 80, background: '#0A1535', color: '#fff' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}><div style={{ width: 72, height: 72, borderRadius: 20, background: '#2255E8', display: 'flex' }} /><div style={{ fontSize: 54, fontWeight: 800 }}>Coinvera</div></div>
    <div style={{ fontSize: 76, fontWeight: 800, marginTop: 40, lineHeight: 1.05 }}>Acceptez les cartes. Retirez en crypto.</div><div style={{ fontSize: 30, marginTop: 28, color: '#B6C2D6' }}>Visa · Mastercard · Retraits USDT · API · WooCommerce</div></div>, size);
}
