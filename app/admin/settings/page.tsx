import Link from 'next/link';
export default function S() { return <div className="card"><h1>Paramètres</h1><p className="mut">Les paramètres commerciaux (commissions, prix, limites) se modifient dans <Link href="/admin/pricing">Fees & Pricing</Link>. Les secrets d’infrastructure restent dans les variables d’environnement Vercel.</p></div>; }
