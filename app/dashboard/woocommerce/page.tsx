'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Download } from 'lucide-react';
import { api, msg, useData } from '@/lib/client';
import { Badge, Copy, PageHead } from '@/components/Bits';
import DataTable from '@/components/DataTable';
import { useBulk } from '@/components/Bulk';
import { useConfirm } from '@/components/Confirm';
import { LISTED } from '@/lib/plugins';
export default function Woo() {
  const { data, reload } = useData('/api/license/purchase'); const keys = useData('/api/keys'); const [err, setErr] = useState(''), [busy, setBusy] = useState(false);
  const activated = !!keys.data?.activation?.activated; const items: any[] = data?.items ?? []; const ask = useConfirm();
  const bulk = useBulk({ c: 'woocommerce_licenses', mine: true, rows: items, reload, label: 'licence', revoke: true, canRevoke: (l: any) => l.status === 'active' });
  return <div className="stack"><PageHead title="Plugins" sub="Une seule licence pour tous les plugins Coinvera." />
    {!activated ? <div className="card"><h3>Plugins inclus dans l’activation</h3><p className="mut" style={{ margin: '8px 0 14px' }}>Votre licence est créée automatiquement lors de l’activation du compte (paiement unique : API de production et tous les plugins Coinvera).</p><Link className="btn p" href="/dashboard/activate">Activer mon compte</Link></div>
      : !items.length ? <div className="card"><h3>Générer ma licence</h3><p className="mut" style={{ margin: '8px 0 14px' }}>Votre compte est activé : la licence unique des plugins est incluse, sans frais supplémentaires.</p><button className="btn p" disabled={busy} onClick={async () => { setBusy(true); setErr(''); try { await api('/api/license/purchase', { method: 'POST' }); reload(); } catch (e) { setErr(msg(e)); } setBusy(false); }}>{busy ? 'Génération…' : 'Générer ma licence'}</button>{err && <div className="err">{err}</div>}</div> : null}
    {bulk.status}<DataTable rows={items} empty="Aucune licence" emptyHint="La licence apparaît après l’activation de votre compte." toolbar={<><b>Mes licences</b><button className="btn sm" onClick={reload}>Actualiser</button>{bulk.toolbar}</>}
      cols={[...bulk.pre, { key: 'key', label: 'Clé', render: l => <><code>{l.key}</code> <Copy text={l.key} /></> }, { key: 'status', label: 'Statut', render: l => <Badge s={l.status} /> }, { key: 'sites', label: 'Sites', render: l => `${l.sites.length}/${l.maxActivations} · ${l.sites.join(', ') || 'aucun'}` },
        { key: 'a', label: '', right: true, render: l => l.status === 'active' && <button className="btn d sm" onClick={async () => { if (await ask({ title: 'Révoquer cette licence ?', message: 'Les plugins qui utilisent cette licence cesseront de fonctionner.', confirmLabel: 'Révoquer', danger: true })) { try { await api('/api/records', { method: 'POST', body: JSON.stringify({ c: 'woocommerce_licenses', ids: [l.id], action: 'revoke' }) }); reload(); } catch (e) { setErr(msg(e)); } } }}>Révoquer</button> }, ...bulk.post]} />
    {activated && <div className="card"><h3>Télécharger les plugins</h3><div className="g2" style={{ marginTop: 12 }}>{LISTED.map(p => <div key={p.key} style={{ border: '1px solid var(--line, #E5EAF2)', borderRadius: 12, padding: 16 }}><b>{p.name}</b><p className="mut" style={{ margin: '6px 0 12px' }}>{p.tagline} <Link href={p.href}>En savoir plus</Link></p><a className="btn" href={p.zip}><Download size={16} />Télécharger</a></div>)}</div><p className="mut" style={{ margin: '12px 0 0' }}>Saisissez la même clé de licence dans chaque plugin (avec vos clés API). Elle s’active par site, tous plugins confondus.</p></div>}</div>;
}
