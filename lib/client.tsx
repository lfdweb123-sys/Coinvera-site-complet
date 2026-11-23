'use client';
import { CARD_ERR } from './cards/errors';
import { SCARAB_ERR } from './scarab/errors';
import React from "react";
import { useCallback, useEffect, useRef, useState } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged, signOut, User } from 'firebase/auth';
const app = getApps()[0] ?? initializeApp({ apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'missing-key', authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID });
export const auth = getAuth(app);
export async function api(path: string, init: RequestInit = {}) {
  const t = await auth.currentUser?.getIdToken();
  const r = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e: any = new Error(j.error || 'error'); e.status = r.status; throw e; }
  return j;
}
// Session réellement invalide (jeton refusé ou compte désactivé) : seule situation où l'on déconnecte. Une panne serveur (5xx) ne doit jamais déconnecter.
export const isAuthFailure = (e: any) => e?.status === 401 || e?.message === 'account_disabled';
export const ERR: Record<string, string> = { insufficient_balance: 'Solde disponible insuffisant.', amount_out_of_limits: 'Montant hors des limites autorisées.', unsupported_coin_or_network: 'Cryptomonnaie ou réseau non pris en charge.',
  license_already_issued: 'Votre licence a déjà été émise puis supprimée : contactez le support pour en obtenir une nouvelle.',
  twofa_required: 'Activez la double authentification (Paramètres → Double authentification) pour retirer vos fonds ou modifier votre adresse de retrait.', mfa_setup_required: 'Activez d’abord la double authentification (menu Sécurité).', rate_limited: 'Trop de tentatives, réessayez plus tard.', ai_not_configured: 'Coinvera AI n’est pas encore disponible.', ai_unavailable: 'Coinvera AI est momentanément indisponible. Réessayez dans un instant.', ai_busy: 'Coinvera AI est très sollicité. Réessayez dans un instant.', email_not_verified: 'Vérifiez votre adresse email.', account_disabled: 'Compte désactivé.', invalid_request: 'Données invalides.', too_many_keys: 'Nombre maximal de clés atteint.', unsafe_url: 'URL non autorisée (https public requis).', invalid_address: 'Adresse invalide pour ce réseau : vérifiez-la (faute de frappe ?).', address_required: 'Enregistrez d’abord une adresse de retrait.', code_invalid: 'Code incorrect.', already_activated: 'Votre compte est déjà activé.', protected_admin: 'Cet administrateur est protégé.', email_in_use: 'Cette adresse e-mail est déjà utilisée.', activation_required: 'Activez d’abord votre compte.', code_expired: 'Code expiré : demandez-en un nouveau.', too_many_attempts: 'Trop d’essais : demandez un nouveau code.', too_soon: 'Patientez avant de redemander un code.', mfa_required: 'Vérification en deux étapes requise.', network_unavailable: 'Le réseau est momentanément injoignable. Réessayez.', tx_already_used: 'Cette transaction a déjà été utilisée.', quote_unavailable: 'Cours indisponible, réessayez dans un instant.', currency_unavailable: 'Cette cryptomonnaie n’est pas disponible.', mail_failed: 'Envoi de l’e-mail impossible. Réessayez.', already_enabled: 'Déjà activé.', setup_required: 'Relancez la configuration.' };
export const msg = (e: any) => ERR[e?.message] ?? CARD_ERR[e?.message] ?? SCARAB_ERR[e?.message] ?? ('Une erreur est survenue. Réessayez.' + (e?.message && e.message !== 'error' ? ` (code : ${e.message})` : ''));
// Chargement initial compte globalement : le tableau de bord n'affiche rien tant que toutes les donnees de la page ne sont pas arrivees.
let pending = 0; const subs = new Set<() => void>(); const bump = (d: number) => { pending += d; subs.forEach(f => f()); };
export function usePending() { const [n, setN] = useState(pending); useEffect(() => { const f = () => setN(pending); subs.add(f); f(); return () => { subs.delete(f); }; }, []); return n; }
export function useData<T = any>(path: string) {
  const [data, setData] = useState<T | null>(null); const [error, setError] = useState(''); const [loading, setLoading] = useState(true); const [ready, setReady] = useState(false);
  const counted = useRef(false), done = useRef(false);
  const load = useCallback(async () => {
    if (!done.current && !counted.current) { counted.current = true; bump(1); }
    setLoading(true); try { setData(await api(path)); setError(''); } catch (e) { setError(msg(e)); }
    setLoading(false); setReady(true); if (counted.current && !done.current) { done.current = true; bump(-1); }
  }, [path]);
  useEffect(() => () => { if (counted.current && !done.current) { done.current = true; bump(-1); } }, []);
  useEffect(() => { const u = onAuthStateChanged(auth, x => { if (x) load(); }); return u; }, [load]);
  return { data, error, loading, ready, reload: load };
}
export const Skel = () => <div style={{ display: 'grid', gap: 10 }}><div className="skel" /><div className="skel" style={{ width: '70%' }} /><div className="skel" style={{ width: '85%' }} /></div>;

export function useAuthUser() {
  const [st, setSt] = useState<{ ready: boolean; user: User | null }>({ ready: false, user: null });
  useEffect(() => onAuthStateChanged(auth, user => setSt({ ready: true, user })), []);
  return st;
}
export async function pub(path: string, body: unknown) {
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'error'); return j;
}
export const IDLE_KEY = 'cv_last_activity';
export const touchSession = () => { try { localStorage.setItem(IDLE_KEY, String(Date.now())); } catch {} };
// Déconnexion totale : le serveur révoque d'abord TOUS les jetons de l'utilisateur (le jeton actuel est refusé immédiatement, y compris s'il avait été copié ailleurs),
// puis la session locale est effacée. Même sans réseau, la session locale est toujours fermée.
export async function logout() {
  try { const t = await auth.currentUser?.getIdToken(); if (t) await fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: `Bearer ${t}` }, keepalive: true }); } catch {}
  try { await signOut(auth); } catch {}
  try { localStorage.removeItem(IDLE_KEY); Object.keys(localStorage).filter(k => k.startsWith('firebase:')).forEach(k => localStorage.removeItem(k)); } catch {}
  try { indexedDB.deleteDatabase('firebaseLocalStorageDb'); } catch {}
}
