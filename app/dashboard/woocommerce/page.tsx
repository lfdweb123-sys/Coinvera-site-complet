'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Download } from 'lucide-react';
import { api, msg, useData } from '@/lib/client';
import { Badge, Copy, PageHead } from '@/components/Bits';
import DataTable from '@/components/DataTable';
export default function Woo() {
  const { data, reload } = useData('/api/license/purchase'); const keys = useData('/api/keys'); const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const activated = !!keys.data?.activation?.activated; const items: any[] = data?.items ?? [];
  return <div className="stack"><PageHead title="Plugin WooCommerce" sub="Licence, téléchargement et sites activés.">{activated && <a className="btn" href="/downloads/coinvera-crypto-gateway.zip"><Download size={16} />Télécharger le plugin</a>}</PageHead>
    {!activated ? <div className="card"><h3>Plugin inclus dans l’activation</h3><p className="mut" style={{ margin: '8px 0 14px' }}>Votre licence est créée automatiquement lors de l’activation du compte (paiement unique, API de production comprise).</p><Link className="btn p" href="/dashboard/activate">Activer mon compte</Link></div>
      : !items.length ? <div className="card"><h3>Générer ma licence</h3><p className="mut" style={{ margin: '8px 0 14px' }}>Votre compte est activé : la licence du plugin est incluse, sans frais supplémentaires.</p><button className="btn p" disabled={busy} onClick={async () => { setBusy(true); setErr(''); try { await api('/api/license/purchase', { method: 'POST' }); reload(); } catch (e) { setErr(msg(e)); } setBusy(false); }}>{busy ? 'Génération…' : 'Générer ma licence'}</button>{err && <div className="err">{err}</div>}</div> : null}
    <DataTable rows={items} empty="Aucune licence" emptyHint="La licence apparaît après l’activation de votre compte." toolbar={<><b>Mes licences</b><button className="btn sm" onClick={reload}>Actualiser</button></>}
      cols={[{ key: 'key', label: 'Clé', render: l => <><code>{l.key}</code> <Copy text={l.key} /></> }, { key: 'status', label: 'Statut', render: l => <Badge s={l.status} /> }, { key: 'sites', label: 'Sites', render: l => `${l.sites.length}/${l.maxActivations} · ${l.sites.join(', ') || 'aucun'}` }]} /></div>;
}
