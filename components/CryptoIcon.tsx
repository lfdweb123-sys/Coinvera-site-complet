const C: Record<string, [string, React.ReactNode]> = {
  USDT: ['#26A17B', <path key="a" d="M-7-6h14M0-6v14" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />],
  USDC: ['#2775CA', <g key="a" fill="none" stroke="#fff" strokeWidth="2"><circle r="6.500" /><path d="M2.800-2.500c-.6-1.200-3.600-1.400-3.600.4 0 2.200 3.600 1 3.600 3.200 0 1.800-3.200 1.700-3.800.3M0-8v2M0 6v2" /></g>],
  TRX: ['#EF0027', <path key="a" d="M-7-6l13 3-6 10zM-7-6l9 5M6-3l-8 2" fill="none" stroke="#fff" strokeWidth="1.800" strokeLinejoin="round" />],
  Bitcoin: ['#F7931A', <text key="a" y="5.500" textAnchor="middle" fontSize="15" fontWeight="800" fill="#fff" fontFamily="Arial">₿</text>],
  Ethereum: ['#627EEA', <path key="a" d="M0-8l5 8-5 3-5-3zM0 4l5-3.500L0 8-5.500.5z" fill="#fff" />],
  Solana: ['#111827', <g key="a" fill="#9945FF"><path d="M-7-5h11l3 2.500H-4zM-7 1h11l3-2.500H-4zM-7 6h11l3-2.500H-4z" /></g>],
  BNB: ['#F3BA2F', <path key="a" d="M0-8l3 3-3 3-3-3zM-6-2l3 3-3 3-3-3zM6-2l3 3-3 3-3-3zM0 4l3 3-3 3-3-3z" transform="scale(.75)" fill="#fff" />],
  Litecoin: ['#345D9D', <path key="a" d="M-3-7l-2.500 9.500 8-2.500M-5.500 2.500l-1 3.500h10" fill="none" stroke="#fff" strokeWidth="2.200" strokeLinecap="round" />] };
export default function CryptoIcon({ sym, size = 40 }: { sym: string; size?: number }) {
  const [bg, g] = C[sym] ?? ['#64748B', null];
  return <svg width={size} height={size} viewBox="-12 -12 24 24" aria-hidden="true" style={{ flex: 'none' }}><circle r="12" fill={bg} />{g}</svg>;
}
