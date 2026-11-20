'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Download } from 'lucide-react';
import { api, msg, useData } from '@/lib/client';
import { Badge, Copy, PageHead } from '@/components/Bits';
import DataTable from '@/components/DataTable';
import { DONATIONS_ZIP, WOOCOMMERCE_ZIP } from '@/lib/plugins';
export default function Woo() {
  const { data, reload } = useData('/api/license/purchase'); const keys = useData('/api/keys'); const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const activated = !!keys.data?.activation?.activated; const items: any[] = data?.items ?? [];
  return <div className="stack"><PageHead title="Plugins" sub="Une seule licence pour le plugin WooCommerce et le plugin de dons.">{activated && <><a className="btn" href={WOOCOMMERCE_ZIP}><Download size={16} />Plugin WooCommerce</a><a className="btn" href={DONATIONS_ZIP}><Download size={16} />Plugin de dons</a></>}</PageHead>
    {!activated ? <div className="card"><h3>Plugins inclus dans l’activation</h3><p className="mut" style={{ margin: '8px 0 14px' }}>Votre licence est créée automatiquement lors de l’activation du compte (paiement unique : API de production, plugin WooCommerce et plugin de dons).</p><Link className="btn p" href="/dashboard/activate">Activer mon compte</Link></div>
      : !items.length ? <div className="card"><h3>Générer ma licence</h3><p className="mut" style={{ margin: '8px 0 14px' }}>Votre compte est activé : la licence unique des plugins est incluse, sans frais supplémentaires.</p><button className="btn p" disabled={busy} onClick={async () => { setBusy(true); setErr(''); try { await api('/api/license/purchase', { method: 'POST' }); reload(); } catch (e) { setErr(msg(e)); } setBusy(false); }}>{busy ? 'Génération…' : 'Générer ma licence'}</button>{err && <div className="err">{err}</div>}</div> : null}
    <DataTable rows={items} empty="Aucune licence" emptyHint="La licence apparaît après l’activation de votre compte." toolbar={<><b>Mes licences</b><button className="btn sm" onClick={reload}>Actualiser</button></>}
      cols={[{ key: 'key', label: 'Clé', render: l => <><code>{l.key}</code> <Copy text={l.key} /></> }, { key: 'status', label: 'Statut', render: l => <Badge s={l.status} /> }, { key: 'sites', label: 'Sites', render: l => `${l.sites.length}/${l.maxActivations} · ${l.sites.join(', ') || 'aucun'}` }]} />
    {activated && <div className="card"><h3>Plugin de dons</h3><p className="mut" style={{ margin: '8px 0 0' }}>Cagnottes et dons par carte sur WordPress, sans WooCommerce. Utilisez la même clé de licence : saisissez-la dans « Dons Coinvera → Réglages » avec vos clés API. <Link href="/dons">En savoir plus</Link></p></div>}</div>;
}
