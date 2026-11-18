'use client';
import { api, useData } from '@/lib/client';
import { Badge, day, PageHead } from '@/components/Bits';
import DataTable from '@/components/DataTable';
import { useConfirm } from '@/components/Confirm';
export default function CO() {
  const { data, loading, reload } = useData('/api/admin/list?c=crypto_orders'); const ask = useConfirm();
  return <div className="stack"><PageHead title="Commandes crypto" sub="Activations et licences payées en cryptomonnaie. La confirmation manuelle est journalisée." />
    <DataTable loading={loading} rows={data?.items ?? []} empty="Aucune commande" cols={[{ key: 'cur', label: 'Crypto', render: o => <code>{o.cur}</code> }, { key: 'purpose', label: 'Objet', render: o => o.purpose === 'api' ? 'Activation API' : 'Licence plugin' }, { key: 'merchantId', label: 'Marchand', render: o => <code>{o.merchantId}</code> }, { key: 'createdAt', label: 'Créée', render: o => day(new Date(o.createdAt).toISOString()) }, { key: 'status', label: 'Statut', render: o => <Badge s={o.status === 'awaiting' ? 'pending' : o.status} /> }, { key: 'txid', label: 'Transaction', render: o => <span className="mut" style={{ wordBreak: 'break-all' }}>{o.txid ?? '—'}</span> },
      { key: 'a', label: '', right: true, render: o => o.status !== 'confirmed' && <button className="btn sm" onClick={async () => { if (await ask({ title: 'Confirmer manuellement ?', message: 'Le marchand sera activé sans vérification automatique. Cette action est enregistrée dans le journal d’audit.', confirmLabel: 'Confirmer' })) { await api('/api/admin/crypto-orders/' + o.id, { method: 'POST', body: JSON.stringify({ txid: '' }) }); reload(); } }}>Confirmer</button> }]} /></div>;
}
