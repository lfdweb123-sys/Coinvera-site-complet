# Cartes virtuelles (CryptoInfra)

Module isolé du reste de la plateforme : collections `card_*`, routes `/api/cards/*`, webhook `/api/webhooks/cards`, cron `/api/cron/cards`.

## Mise en service
1. Variables d'environnement : `CRYPTOINFRA_API_KEY` (clé `ck_live_…`, jamais côté navigateur) et `CARDS_WEBHOOK_SECRET`.
2. Enregistrer le webhook chez CryptoInfra (le secret n'est affiché qu'une fois, à copier dans `CARDS_WEBHOOK_SECRET`) :
   `curl -X POST https://api.cryptoinfra.build/v1/developer/webhooks -H "Authorization: Bearer $CRYPTOINFRA_API_KEY" -H "Content-Type: application/json" -d '{"url":"https://VOTRE-SITE/api/webhooks/cards"}'`
   Cet endpoint reçoit tous les événements du projet ; seuls les `card.*` sont traités.
3. Planifier `GET /api/cron/cards` (en-tête `Authorization: Bearer $CRON_SECRET`) toutes les 2 à 5 minutes.
4. Alimenter le portefeuille du programme (USDT TRC20 ou BEP20, adresses dans Admin > Virtual Cards) : il paie chaque carte et chaque recharge.
5. Admin > Virtual Cards : régler la marge puis cocher « Service de cartes activé » (désactivé par défaut).

## Flux d'argent
- L'utilisateur paie `total CryptoInfra + marge`, depuis son solde ou en USDT direct (adresse + montant unique, 60 min).
- Les fonds sont réservés dans le registre avant l'appel au prestataire (clé d'idempotence = ordre), dépensés à la confirmation, rendus au solde en cas d'échec définitif. Un état inconnu (timeout) garde la réservation : le cron rejoue.
- Crédit cartes : recharge en USDT (5 à 10 000 $), dépensé en premier, non retirable. Un paiement USDT arrivé après expiration est détecté pendant 7 jours et crédité automatiquement sur ce crédit.
- Fermeture : le solde revient au portefeuille du programme. Dès que la carte est réellement fermée (non dépensable), l’utilisateur est crédité de l’estimation lue avant la fermeture (avance, désactivable dans l’admin) ; à l’arrivée du remboursement réel (`close_refund.state = paid`, documenté dans le changelog CryptoInfra 7.10.0) l’écart est réglé : complément si plus élevé, perte absorbée par la plateforme si plus bas. Le remboursement revient dans les mêmes proportions crédit cartes / solde retirable que le financement de la carte.
