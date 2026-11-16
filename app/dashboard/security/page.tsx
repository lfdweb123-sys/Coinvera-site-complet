'use client';
import { useState } from 'react';
import { sendPasswordResetEmail, signOut } from 'firebase/auth';
import { auth } from '@/lib/client';
export default function Sec() {
  const [m, setM] = useState('');
  return <div style={{ display: 'grid', gap: 20, maxWidth: 720 }}><h1>Sécurité</h1><div className="card"><h3>Mot de passe</h3><p className="mut">Recevez un lien de réinitialisation par email.</p>
    <button className="btn" onClick={async () => { await sendPasswordResetEmail(auth, auth.currentUser!.email!); setM('Email envoyé.'); }}>Réinitialiser mon mot de passe</button> <span className="okm">{m}</span></div>
    <div className="card"><h3>Sessions</h3><p className="mut">Déconnectez-vous de cet appareil.</p><button className="btn d" onClick={() => signOut(auth).then(() => location.assign('/login'))}>Déconnexion</button></div></div>;
}
