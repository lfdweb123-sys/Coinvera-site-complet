# Coinvera

Next.js (App Router) + Firebase Auth/Firestore (sans Storage) + Vercel.

## Etat
Livre : site public, authentification (email, Google, GitHub), dashboard marchand, dashboard admin, registre comptable, API v1 signee, activation API, licences WooCommerce, plugin WooCommerce, documentation (/docs), support Brevo, regles Firestore, tests unitaires.
NON TESTE en conditions reelles : aucun appel vers le prestataire d'encaissement, Bybit ou Brevo n'a ete execute. Ne pas lancer en production avant les verifications ci-dessous.

## A verifier avant production
1. Webhook du prestataire : champ portant l'identifiant du paiement (app/api/webhooks/processor/route.ts).
2. Bybit : parametres de /v5/asset/withdraw/create (requestId, forceChain, accountType), statuts de retrait, whitelist IP, droit Withdraw uniquement.
3. Autorisations legales pour detenir et redistribuer des fonds de tiers ; textes dans lib/legal.ts a completer et faire valider.
4. docs/SECURITY-TESTS.md (concurrence, double credit, double retrait) sur l'emulateur Firestore.
5. Limites connues : journal API sans code reponse ni duree ; pas de recherche par crypto (paiements par carte) ; remboursements non geres ; protection de session via jeton Firebase (pas de cookie serveur).

## Installation
1. `npm install` puis `npm test`.
2. Copier `.env.example` en `.env.local` et remplir. `openssl rand -hex 32` pour API_SECRET_ENC_KEY et CRON_SECRET.
3. Firebase : activer Authentication (email, Google, GitHub), creer Firestore, `firebase deploy --only firestore:rules`. Autoriser les domaines coinvera.me dans Authentication.
4. Premier admin : creer un compte, puis `node scripts/set-admin.mjs <uid>`.
5. Vercel : importer le depot, renseigner les variables, ajouter les domaines coinvera.me, www et docs.coinvera.me (meme projet). Pas de cron Vercel : le traitement des retraits est déclenché par cron-job.org (voir ci-dessous).
6. DNS : CNAME www et docs vers cname.vercel-dns.com ; apex selon les instructions Vercel.
7. Declarer l'URL https://www.coinvera.me/api/webhooks/processor chez le prestataire d'encaissement et renseigner PROCESSOR_WEBHOOK_SECRET.
8. Brevo : verifier l'expediteur SUPPORT_EMAIL. Plugin : public/downloads/coinvera-crypto-gateway.zip.

## Cron des retraits (cron-job.org)
Créez une tâche sur cron-job.org : URL `https://www.coinvera.me/api/cron/withdrawals`, méthode GET, toutes les 5 minutes (ou chaque minute), et ajoutez l'en-tête `Authorization: Bearer <valeur de CRON_SECRET>`. La réponse attendue est `{"ok":true}`.

## Pagination
Toutes les listes sont paginées côté serveur (`?page=1&size=20`, size max 100), sans index Firestore : le serveur lit au plus 5000 documents d'un marchand, les trie et découpe la page demandée.

## Domaines (Vercel + DNS)
Ajoutez au même projet Vercel : `www.coinvera.me` (principal), `api.coinvera.me`, `docs.coinvera.me`, `status.coinvera.me`. Chez votre registrar, créez un CNAME pour chacun (www, api, docs, status) vers la valeur indiquée par Vercel, et redirigez `coinvera.me` vers `www.coinvera.me`. Le middleware route les sous-domaines : `docs.` -> documentation, `status.` -> état des services, `api.` -> API (`https://api.coinvera.me/v1/payments`). Dans Firebase Authentication, autorisez ces domaines.
Variable : `NEXT_PUBLIC_SITE_URL=https://www.coinvera.me`. `CAPTCHA_SECRET` est facultatif (par défaut `API_SECRET_ENC_KEY`).
