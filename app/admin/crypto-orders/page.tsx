'use client';
import { api, useData } from '@/lib/client';
import { Badge, day, PageHead } from '@/components/Bits';
import DataTable from '@/components/DataTable';
import { useConfirm } from '@/components/Confirm';
import { useBulk } from '@/components/Bulk';
export default function CO() {
  const { data, loading, reload } = useData('/api/admin/list?c=crypto_orders'); const ask = useConfirm(); const bulk = useBulk({ c: 'crypto_orders', rows: data?.items ?? [], reload, canDelete: o => o.status !== 'awaiting' && ['confirmed', 'expired', 'failed', 'cancelled', 'canceled', 'fulfilled', 'refunded'].includes(o.status), label: 'commande', danger: 'Seules les commandes terminées ou expirées peuvent être supprimées.' });
  return <div className="stack"><PageHead title="Commandes crypto" sub="Activations et licences payées en cryptomonnaie. La confirmation manuelle est journalisée." />
    {bulk.status}<DataTable loading={loading} rows={data?.items ?? []} empty="Aucune commande" toolbar={bulk.toolbar} cols={[...bulk.pre, { key: 'cur', label: 'Crypto', render: o => <code>{o.cur}</code> }, { key: 'purpose', label: 'Objet', render: o => o.purpose === 'api' ? 'Activation API' : 'Licence plugin' }, { key: 'merchantId', label: 'Marchand', render: o => <code>{o.merchantId}</code> }, { key: 'createdAt', label: 'Créée', render: o => day(new Date(o.createdAt).toISOString()) }, { key: 'status', label: 'Statut', render: o => <Badge s={o.status === 'awaiting' ? 'pending' : o.status} /> }, { key: 'txid', label: 'Transaction', render: o => <span className="mut" style={{ wordBreak: 'break-all' }}>{o.txid ?? '—'}</span> },
      { key: 'a', label: '', right: true, render: o => o.status !== 'confirmed' && <button className="btn sm" onClick={async () => { if (await ask({ title: 'Confirmer manuellement ?', message: 'Le marchand sera activé sans vérification automatique. Cette action est enregistrée dans le journal d’audit.', confirmLabel: 'Confirmer' })) { await api('/api/admin/crypto-orders/' + o.id, { method: 'POST', body: JSON.stringify({ txid: '' }) }); reload(); } }}>Confirmer</button> }, ...bulk.post]} /></div>;
}
