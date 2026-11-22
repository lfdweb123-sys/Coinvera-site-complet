# Carte Pro (ScarabPay)

Module séparé des cartes virtuelles : `lib/scarab/*`, `app/api/scarab/*`, pages `/dashboard/carte-pro` et `/admin/carte-pro`.

## Mise en route
1. Portail ScarabPay → clés API : créez une clé (scopes `cards.read`, `cards.write`, `cards.reveal`, `customers.read`, `customers.write`). **Pas de liste d'IP** (Vercel n'a pas d'IP fixe).
2. Variables Vercel : `SCARABPAY_KEY_ID`, `SCARABPAY_SECRET`, `SCARABPAY_WEBHOOK_SECRET`. Commencez par une clé de test.
3. Webhook : URL `https://<votre-domaine>/api/webhooks/scarab`, tous les événements `card.*` et `customer.kyc.*`.
4. Cron toutes les 2 à 5 minutes sur `/api/cron/scarab` avec `Authorization: Bearer $CRON_SECRET` (rapproche les opérations incertaines, purge les codes expirés). `vercel.json` n'a pas été modifié : ajoutez-le vous-même ou utilisez un cron externe.
5. Admin → Carte Pro : créez une adresse de dépôt, alimentez le portefeuille, réglez la marge, cochez « activée ».

## Garantie de prix
Le prix client = tarif **Starter** (pire cas, toutes les offres supérieures sont moins chères) + votre marge. Une commande est refusée si le prix passait sous le coût réel lu chez le prestataire. Changer d'offre ne peut qu'augmenter votre marge. Attention : les abonnements mensuels (Growth 100 $, Scale 199 $, Pro 499 $) ne sont pas dans le prix des cartes ; ils ne sont rentables qu'à partir d'un certain volume.

## Points à connaître
- Marges par défaut : 2,00 $ + 2,5 % à la création, 0,50 $ + 2,5 % par recharge (modifiables en admin). Service désactivé tant que non activé.
- Les frais de pénalité (`card.fee_charged`) sont facturés à votre portefeuille et non répercutés : suivis en admin.
- Codes de vérification (3-D Secure, Apple/Google Pay) : reçus par webhook, chiffrés, valables quelques minutes, effacés à la première lecture.
- Résultat incertain (timeout, 500) : fonds conservés et même clé d'idempotence rejouée ; après 20 h → « à trancher » en admin.
- Non testé en réel : paiement direct USDT, liste des pays acceptés, devise du champ `annual_salary`.

## Paiement direct, adresses et retraits (cartes uniquement)
- **Adresses de dépôt** : celles de votre compte ScarabPay (`GET /deposit-addresses`, une par réseau). Une adresse avec mémo est écartée. Aucune variable d'environnement n'est utilisée par les cartes. Le reste du site (paiements marchands, retraits marchands) n'est pas touché.
- **Taux de conversion** : chaque dépôt est crédité avec un `rate` (ex. 0,9999). Le montant demandé à l'utilisateur est majoré du plus bas taux des 20 derniers dépôts crédités (repli 0,999).
- **Retrait de carte** : `POST /cards/{card}/withdraw` (min 1,00 $, 1,00 $ doit rester, un retrait par carte toutes les 5 min). Le solde de l'utilisateur est crédité du **net** (montant moins frais) à la réception de `card.withdrawn` ; `card.withdrawal_failed` ne crédite rien. Sans nouvelle après 2 h : admin → Carte Pro → « Retraits de carte à vérifier ».
- Les retraits du portefeuille marchand du prestataire se font uniquement dans leur portail (événements `withdrawal.*` seulement).

## Carte Standard (CryptoInfra)
- Adresses de dépôt : `GET /v1/cards/wallet` (portefeuille du programme). Montant majoré de `recharge_fee_bps` et, pour USDT TRC20, du network charge (devis réseau en direct, plafonné à 5 $, repli `CARDS_TRC20_CHARGE_USD`, 2 $ par défaut). Le solde carte crédité = ce que le portefeuille a réellement reçu.
- Pas de retrait de carte chez CryptoInfra (supprimé) : fermer la carte rembourse le portefeuille du programme.
