=== Coinvera Reminders ===
Requires at least: 5.8
Requires PHP: 7.4
Stable tag: 1.0.0

Relance automatique des commandes WooCommerce en attente de paiement et notifications de statut, par WhatsApp.

== Description ==
* Relance par WhatsApp les commandes restées en attente de paiement après un délai réglable, avec un lien de paiement direct.
* Notifie le client par WhatsApp à chaque changement de statut de commande que vous choisissez (en cours, terminée, annulée, remboursée...).
* Aucun compte WhatsApp Business à créer : l'envoi passe par le compte unique Coinvera, avec la même licence que vos autres plugins.
* Case de consentement au checkout pour la relance panier (classée « marketing » par les règles de Meta) ; les notifications de statut sont des messages transactionnels liés à une commande existante.
* Journal des relances envoyées/ignorées, conservé 180 jours. Ne stocke aucune donnée personnelle dans ses propres tables : le numéro de téléphone est lu depuis la commande au moment de l'envoi, jamais archivé par ce plugin.
* Compatible HPOS (commandes en tables dédiées).

== Limites connues ==
* La case de consentement est garantie sur le checkout classique. Sur le checkout en blocs, son affichage dépend de la version de WooCommerce (API d'extension disponible à partir de la version ~8.6) : vérifiez son apparition sur votre site après installation.
* Les messages WhatsApp hors fenêtre de 24 h doivent utiliser un modèle pré-approuvé par Meta ; ces modèles sont gérés côté Coinvera (Business Manager), pas dans ce plugin.

== Installation ==
1. WooCommerce doit être installé et activé.
2. Extensions > Ajouter > Téléverser le fichier ZIP, puis activer.
3. Coinvera Reminders > Réglages : licence + clé publique/secret API (les mêmes que pour vos autres plugins Coinvera), puis ajustez le délai de relance et les statuts notifiés.

== Changelog ==
= 1.0.0 =
Première version.
