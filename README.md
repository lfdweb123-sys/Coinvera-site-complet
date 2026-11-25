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
8. Brevo : verifier l'expediteur SUPPORT_EMAIL. Plugins : public/downloads/coinvera-crypto-gateway.zip (WooCommerce) et public/downloads/coinvera-{donations,invoices,subscriptions,tickets,guard,reminders,cod,installments}.zip (sources dans plugins/).

## Cron des retraits (cron-job.org)
Créez une tâche sur cron-job.org : URL `https://www.coinvera.me/api/cron/withdrawals`, méthode GET, toutes les 5 minutes (ou chaque minute), et ajoutez l'en-tête `Authorization: Bearer <valeur de CRON_SECRET>`. La réponse attendue est `{"ok":true}`.

## Pagination
Toutes les listes sont paginées côté serveur (`?page=1&size=20`, size max 100), sans index Firestore : le serveur lit au plus 5000 documents d'un marchand, les trie et découpe la page demandée.

## Domaines (Vercel + DNS)
Ajoutez au même projet Vercel : `www.coinvera.me` (principal), `api.coinvera.me`, `docs.coinvera.me`, `status.coinvera.me`. Chez votre registrar, créez un CNAME pour chacun (www, api, docs, status) vers la valeur indiquée par Vercel, et redirigez `coinvera.me` vers `www.coinvera.me`. Le middleware route les sous-domaines : `docs.` -> documentation, `status.` -> état des services, `api.` -> API (`https://api.coinvera.me/v1/payments`). Dans Firebase Authentication, autorisez ces domaines.
Variable : `NEXT_PUBLIC_SITE_URL=https://www.coinvera.me`. `CAPTCHA_SECRET` est facultatif (par défaut `API_SECRET_ENC_KEY`).

### Vérification « êtes-vous humain » (Cloudflare Turnstile)
Affichée une fois sur la page d'accueil à la première visite, puis à la demande avant une action sensible (chat public, formulaire de contact, mot de passe oublié). Un contrôle réussi pose un cookie signé de 12 h (`cv_human`, HttpOnly) que les endpoints sensibles exigent côté serveur (`requireHuman`, dans `lib/human.ts`).
1. Cloudflare → Turnstile → *Add widget* (mode *Managed*), domaines `coinvera.me` et `www.coinvera.me` → noter la **clé de site** et la **clé secrète**.
2. Variables d'environnement : `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (clé de site, lue **au build** : redéployer après l'avoir définie) et `TURNSTILE_SECRET_KEY`. `HUMAN_COOKIE_SECRET` est facultatif (par défaut dérivé de la clé secrète).
3. Désactivée tant que les DEUX clés ne sont pas définies : déployer sans clés ne bloque rien (le formulaire de contact garde alors son calcul anti-spam). Clés de test Cloudflare : `1x00000000000000000000AA` (site) et `1x0000000000000000000000000000000AA` (secret), qui valident toujours.
4. Pour couvrir un nouvel endpoint : appeler `requireHuman(req)` au début de la route ; côté client, `pub()` redemande la vérification et rejoue la requête automatiquement, ou appeler `await ensureHuman()` avant un `fetch`.


## Vérification e-mail, mot de passe et 2FA
Aucun e-mail Firebase n'est utilisé : le code à 6 chiffres (inscription et réinitialisation du mot de passe) est envoyé par Brevo avec un modèle HTML maison. `SUPPORT_EMAIL` doit être un expéditeur validé dans Brevo. La 2FA est une application TOTP (Google Authenticator, Authy…), vérifiée à chaque nouvelle connexion.

## Activation par cryptomonnaie
La page `/dashboard/activate` affiche vos adresses `PAY_ADDR_*` (variables d'environnement). Chaque commande reçoit un **montant unique** ; le paiement est détecté en scrutant l'adresse (TRON, EVM pour les tokens, Bitcoin, Litecoin, Solana) ou via le hash de transaction (obligatoire pour ETH et BNB natifs). Monero n'est pas pris en charge (vérification impossible sans portefeuille dédié). Les confirmations manuelles sont possibles dans Admin > Crypto Orders. Non testé sur le réseau réel : faites un essai avec un petit montant par devise avant le lancement.

## Journaux
Tous les événements importants sont écrits en JSON dans Vercel > Logs (champ `event`, ex. `webhook.received`, `withdraw.queued`, `otp.sent`, `crypto.order_confirmed`). Les secrets sont masqués automatiquement.

## Sous-domaines
`helpcenter.coinvera.me` (centre d'aide) s'ajoute comme les autres sous-domaines dans Vercel.

## Crons (cron-job.org)
1. Retraits : `https://www.coinvera.me/api/cron/withdrawals`, toutes les 5 minutes.
2. Paiements carte (filet de sécurité si un webhook est manqué) : `https://www.coinvera.me/api/cron/payments`, toutes les 10 minutes.
Pour chacun : méthode GET, en-tête `Authorization: Bearer <valeur de CRON_SECRET>`. Réponse attendue : `{"ok":true,...}`.

## Plugin de dons (WordPress)
Source : `plugins/coinvera-donations/` (fonctionne seul ou avec WooCommerce, même licence que le plugin WooCommerce). Deux modes de paiement, au choix dans les réglages : direct (API Coinvera) ou via WooCommerce (produit « Don » masqué, don enregistré quand la commande est payée, retiré si elle est annulée, échouée ou remboursée ; boutique en USD uniquement). L'archive téléchargeable est `public/downloads/coinvera-donations.zip` ; à chaque modification du plugin, incrémentez la version dans `plugins/coinvera-donations/coinvera-donations.php` (en-tête et `CVD_VERSION`) ET dans `lib/plugins.ts`, puis régénérez l'archive : `cd plugins && zip -rq ../public/downloads/coinvera-donations.zip coinvera-donations -x '*.DS_Store'`. `npm test` vérifie la cohérence des versions et le contenu de l'archive. Les mises à jour WordPress interrogent `/license/update?plugin=donations`.
Confirmation des dons : relecture du paiement via l'API (jamais sur un simple retour navigateur), par webhook enregistré automatiquement à la sauvegarde des réglages (`PUT /v1/webhooks`) et, en secours, par vérification toutes les 5 minutes (WP-Cron). Un compte peut avoir jusqu'à 5 URL de webhook (`lib/webhook-urls.ts`) : `PUT /v1/webhooks` ajoute l'URL sans remplacer les autres, tous les événements partent vers toutes les URL avec le même secret.

## Plugins WordPress (dons, factures, abonnements, billetterie, anti-fraude, relances, paiement à la livraison, paiement en plusieurs fois)
Sources dans `plugins/coinvera-<nom>/` ; pages de présentation `/dons`, `/factures`, `/abonnements`, `/billetterie`, hub `/plugins` ; liste et versions dans `lib/plugins.ts` (`PLUGIN_VERSIONS`, `LISTED`). Tous utilisent la **même licence unique** et le même webhook automatique (jusqu'à 5 URL par compte ; chaque plugin ignore les références des autres : `cvd:`, `cvi:`, `cvs:`, `cvt:`). Règle commune : un paiement n'est jamais validé sur un retour navigateur ou le contenu d'un webhook, il est relu auprès de l'API (statut, mode réel, montant, référence).

- **Licence par plugin** : chaque plugin envoie `plugin=<clé>` à `/license/activate|check|deactivate` ; le serveur garde un « emplacement » par site et par plugin (`lib/license-slots.ts`). Désactiver un plugin ne libère le site que si plus aucun plugin Coinvera ne l'utilise. **Déployez le serveur avant d'installer les plugins** (les anciens sites sont considérés comme utilisant WooCommerce).
- **Nouvelle version d'un plugin** : incrémentez la version dans le fichier principal (en-tête et constante `CVx_VERSION`), dans `readme.txt` et dans `PLUGIN_VERSIONS`, puis régénérez l'archive : `cd plugins && zip -rq ../public/downloads/coinvera-<nom>.zip coinvera-<nom> -x '*.DS_Store'`. `npm test` vérifie la cohérence des versions et le contenu des archives.
- **Factures** (`cvi`) : factures numérotées, page privée avec lien de paiement, relances par paliers, reçus. **Abonnements** (`cvs`) : plans, échéances par e-mail, accès aux contenus, cron horaire. **Billetterie** (`cvt`) : jauge garantie sous verrou MySQL (`GET_LOCK`), QR codes (bibliothèque MIT `qrcode-generator` embarquée), contrôle d'entrée.
- **Paiement à la livraison** (`cvc`, `/paiement-livraison`) : confirmation WhatsApp avant expédition (lien signé HMAC vers une page à deux boutons : seul un POST modifie la commande, l'aperçu de lien WhatsApp ne confirme rien) et score de fiabilité par identifiants hachés (voir l'en-tête de `class-cvc-score.php` pour la formule). **Paiement en plusieurs fois** (`cvp`, `/paiement-en-plusieurs-fois`) : acompte / 2 / 3 fois par frais négatif au checkout classique, une commande « enfant » par échéance restante avec lien de paiement, blocage de « Terminée » tant que le plan n'est pas soldé ; incompatible déclaré avec le checkout en blocs.
- **Messages WhatsApp** : `POST /v1/whatsapp` accepte les `kind` `cart`, `status`, `cod` et `installment`. Les modèles Meta correspondants (réglables dans Admin → Tarifs) doivent être créés et approuvés dans le Business Manager (facturation : même webhook `/api/webhooks/whatsapp`, débit uniquement à la livraison confirmée par Meta, au tarif « utilitaire » pour `status`, `cod` et `installment`, « marketing » pour `cart`), catégorie *utilitaire* pour `cod` et `installment` : `cvc_cod_confirm` ({{1}} boutique, {{2}} n° de commande, {{3}} lien) et `cvp_installment_due` ({{1}} boutique, {{2}} n° de commande, {{3}} montant, {{4}} lien).
- Non couvert : l'intégration WooCommerce des plugins factures, abonnements et billetterie (seul le plugin de dons l'a).

## Réseaux sociaux du pied de page

Collez les adresses complètes dans `SOCIALS` (fichier `lib/site.ts`). Un réseau laissé vide n'est pas affiché.
