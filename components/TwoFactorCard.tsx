'use client';
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, ShieldCheck, Smartphone } from 'lucide-react';
import { api, msg, useData } from '@/lib/client';
import OtpInput from './OtpInput';
// Double authentification (TOTP) : même mécanique que pour les marchands, profil administrateur séparé côté serveur.
export default function TwoFactorCard() {
  const me = useData('/api/me'); const on = !!me.data?.twoFactor;
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null), [qr, setQr] = useState(''), [tc, setTc] = useState(''), [err, setErr] = useState(''), [busy, setBusy] = useState(false), [dis, setDis] = useState(false), [copied, setCopied] = useState(false);
  useEffect(() => { if (setup) QRCode.toDataURL(setup.uri, { margin: 1, width: 220 }).then(setQr).catch(() => {}); }, [setup]);
  const call = async (path: string, body?: unknown) => { setBusy(true); setErr(''); try { const r = await api(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }); return r; } catch (x) { setErr(msg(x)); return null; } finally { setBusy(false); } };
  const start = async () => { const r = await call('/api/2fa/setup'); if (r) setSetup(r); };
  const enable = async (code: string) => { if (await call('/api/2fa/enable', { code })) { setSetup(null); setTc(''); me.reload(); } };
  const disable = async (code: string) => { if (await call('/api/2fa/disable', { code })) { setDis(false); setTc(''); me.reload(); } };
  return <div className="g2" style={{ alignItems: 'start' }}>
    <div className="card"><div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 10 }}><div className="ic" style={{ margin: 0 }}><Smartphone size={22} /></div><div><h3 style={{ fontSize: 19 }}>Authentification à deux facteurs</h3><p className="mut" style={{ margin: 0 }}>Protégez votre accès administrateur avec un code temporaire.</p></div></div>
      {me.loading && !me.data ? <p className="mut" role="status">Chargement…</p> : on ? <><p><span className="badge ok">Activée</span></p><p className="mut">Un code de votre application d’authentification est demandé à chaque connexion.</p>
        {dis ? <div><label style={{ marginTop: 0 }}>Saisissez un code pour désactiver</label><OtpInput value={tc} onChange={setTc} onComplete={disable} disabled={busy} invalid={!!err} />{err && <div className="err" role="alert" style={{ marginTop: 10 }}>{err}</div>}<button className="btn" style={{ marginTop: 14 }} onClick={() => { setDis(false); setTc(''); setErr(''); }}>Annuler</button></div> : <button className="btn d" onClick={() => setDis(true)}>Désactiver la 2FA</button>}</> :
        !setup ? <><p className="mut">Scannez un QR code avec Google Authenticator, Authy, 1Password ou une application équivalente, puis saisissez le code pour activer.</p>{err && <div className="err" role="alert">{err}</div>}<button className="btn p" onClick={start} disabled={busy}>{busy ? 'Préparation…' : 'Configurer la 2FA'}</button></> :
        <div><p className="mut">1. Scannez ce QR code avec votre application d’authentification.</p><div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', margin: '12px 0' }}><div className="qr">{qr && <img src={qr} alt="QR code d’authentification" width={170} height={170} />}</div>
          <div style={{ flex: '1 1 200px', minWidth: 0 }}><div className="mut" style={{ fontSize: 13 }}>Ou saisissez cette clé manuellement :</div><div className="mono" style={{ background: 'var(--soft)', borderRadius: 10, padding: '10px 12px', margin: '6px 0', fontSize: 14, wordBreak: 'break-all' }}>{setup.secret}</div><button className="btn sm" onClick={() => { navigator.clipboard.writeText(setup.secret).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 1500); }}><Copy size={14} />{copied ? 'Copiée' : 'Copier la clé'}</button></div></div>
          <p className="mut">2. Saisissez le code à 6 chiffres affiché pour activer.</p><OtpInput value={tc} onChange={setTc} onComplete={enable} disabled={busy} invalid={!!err} />{err && <div className="err" role="alert" style={{ marginTop: 10 }}>{err}</div>}<button className="btn" style={{ marginTop: 14 }} onClick={() => { setSetup(null); setTc(''); setErr(''); }}>Annuler</button></div>}</div>
    <div className="card flat" style={{ background: 'var(--soft)' }}><h3 style={{ fontSize: 17, marginBottom: 8 }}>Bon à savoir</h3><ul className="ck"><li><ShieldCheck size={18} />Le code change toutes les 30 secondes.</li><li><ShieldCheck size={18} />Il vous est demandé à chaque nouvelle connexion.</li><li><ShieldCheck size={18} />Conservez la clé manuelle en lieu sûr : elle permet de reconfigurer l’application si vous changez de téléphone.</li></ul></div></div>;
}
