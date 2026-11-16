'use client';
import Link from 'next/link';
import { Skel, useData } from '@/lib/client';
export default function Settings() {
  const { data, loading } = useData('/api/settings'); const p = data?.profile;
  return <div style={{ display: 'grid', gap: 20, maxWidth: 720 }}><h1>Paramètres</h1>{loading ? <Skel /> : <div className="card"><p><b>{p?.fullName}</b><br />{p?.company || '—'}<br />{p?.email}</p><p className="mut">Identifiant marchand : <code>{p?.merchantCode}</code></p>
    <Link className="btn" href="/dashboard/webhooks">Webhooks</Link> <Link className="btn" href="/dashboard/security">Sécurité</Link></div>}</div>;
}
