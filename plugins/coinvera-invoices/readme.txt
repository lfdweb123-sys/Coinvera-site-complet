=== Coinvera Invoices ===
Requires at least: 5.8
Requires PHP: 7.4
Stable tag: 1.0.0

Factures numérotées avec lien de paiement par carte via Coinvera, statut « payée » automatique et relances automatiques.

== Description ==
* Factures numérotées (PRÉFIXE-2026-0001), lignes, remise, taxe ; tous les montants sont calculés côté serveur, en entiers.
* Envoi par e-mail avec un lien privé (jeton aléatoire de 128 bits) vers une page de facture imprimable / PDF.
* Bouton « Payer par carte » : paiement hébergé par Coinvera, aucune donnée de carte ne transite par votre site.
* Une facture n'est marquée payée qu'après relecture du paiement auprès de l'API Coinvera (statut, mode réel, montant, référence).
* Paiement reçu sur une facture annulée ou avec un montant différent : signalé « à vérifier », jamais validé automatiquement.
* Relances automatiques par paliers de retard, reçu de paiement, encaissement manuel, duplication, export CSV, outils RGPD.
* Webhook configuré automatiquement, sans remplacer ceux de vos autres sites ou plugins.
* Même licence que les autres plugins Coinvera.

== Installation ==
1. Extensions > Ajouter > Téléverser le fichier ZIP, puis activer.
2. Factures Coinvera > Réglages : licence, clés API, informations de votre entreprise ; enregistrer (le webhook se configure tout seul).
3. Factures Coinvera > Nouvelle facture, puis « Envoyer au client ».

== Changelog ==
= 1.0.0 =
Première version.
