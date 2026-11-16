'use client';
import React from "react";
import { useCallback, useEffect, useState } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
const app = getApps()[0] ?? initializeApp({ apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'missing-key', authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID });
export const auth = getAuth(app);
export async function api(path: string, init: RequestInit = {}) {
  const t = await auth.currentUser?.getIdToken();
  const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || 'error');
  return j;
}
export const ERR: Record<string, string> = { insufficient_balance: 'Solde disponible insuffisant.', amount_out_of_limits: 'Montant hors des limites autorisées.', unsupported_coin_or_network: 'Cryptomonnaie ou réseau non pris en charge.',
  rate_limited: 'Trop de tentatives, réessayez plus tard.', email_not_verified: 'Vérifiez votre adresse email.', account_disabled: 'Compte désactivé.', invalid_request: 'Données invalides.', too_many_keys: 'Nombre maximal de clés atteint.', unsafe_url: 'URL non autorisée (https public requis).' };
export const msg = (e: any) => ERR[e?.message] ?? 'Une erreur est survenue. Réessayez.';
export function useData<T = any>(path: string) {
  const [data, setData] = useState<T | null>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true);
  const load = useCallback(async () => { setLoading(true); try { setData(await api(path)); setError(''); } catch (e) { setError(msg(e)); } setLoading(false); }, [path]);
  useEffect(() => { const u = onAuthStateChanged(auth, x => { if (x) load(); }); return u; }, [load]);
  return { data, error, loading, reload: load };
}
export const Skel = () => <div style={{ display: 'grid', gap: 10 }}><div className="skel" /><div className="skel" style={{ width: '70%' }} /><div className="skel" style={{ width: '85%' }} /></div>;
