=== Coinvera Installments ===
Requires at least: 5.8
Requires PHP: 7.4
Stable tag: 1.0.0

Paiement en 2 ou 3 fois et acompte pour WooCommerce, gérés par le marchand : échéances automatiques avec lien de paiement envoyé au client.

== Description ==
* Au checkout, le client choisit : payer la totalité, verser un acompte (pourcentage réglable, 50 % par défaut) ou payer en 2 ou 3 fois. Vous activez les formules que vous voulez, avec un montant minimum de commande.
* Fonctionne avec n'importe quelle passerelle de paiement WooCommerce (Coinvera, Mobile Money, carte, virement...) : la commande ne porte que le montant dû maintenant.
* Quand l'acompte ou la première échéance est payé, chaque échéance restante devient, à sa date, une commande en attente de paiement dont le lien est envoyé au client par e-mail (et par WhatsApp si vous l'activez).
* Acompte : le solde peut être demandé automatiquement après un délai, ou à la main depuis l'écran de commande (par exemple juste avant l'expédition).
* Un rappel unique si une échéance reste impayée, avec alerte e-mail au marchand.
* La commande d'origine ne peut pas passer en « Terminée » tant que tout n'est pas payé (réglable) : pas d'expédition avant le solde.
* Annulation ou remboursement de la commande d'origine : les échéances restantes sont annulées.
* Tableau des échéances et état du plan sur chaque commande.
* Ne stocke aucune donnée personnelle dans ses propres tables (identifiants de commande, montants, dates).
* Compatible HPOS (commandes en tables dédiées).
* Même licence que les autres plugins Coinvera.

== Limites connues ==
* Le choix du plan est proposé sur le checkout classique (shortcode). Le checkout en blocs n'est pas pris en charge : le plugin se déclare incompatible auprès de WooCommerce et, sans sélection, le paiement reste intégral (jamais un paiement partiel par erreur).
* Le plugin ne prélève pas automatiquement les échéances : le client reçoit un lien et paie lui-même. Le risque d'impayé reste celui du marchand ; privilégiez l'acompte pour les montants élevés et le blocage de la commande jusqu'au solde.
* Les échéances sont traitées par une tâche planifiée WordPress (toutes les heures) : sur un site peu visité, déclenchez le WP-Cron par un vrai cron serveur pour plus de régularité.
* Un frais négatif est utilisé pour réduire le montant dû maintenant ; le total affiché sur la commande d'origine est donc l'acompte ou la première échéance. Livraison et taxes sont comprises dans le total fractionné : les échéances sont des parts du total TTC.
* Les messages WhatsApp hors fenêtre de 24 h utilisent un modèle pré-approuvé par Meta, géré côté Coinvera.

== Installation ==
1. WooCommerce doit être installé et activé (checkout classique).
2. Extensions > Ajouter > Téléverser le fichier ZIP, puis activer.
3. Coinvera Installments > Réglages : licence, puis choisissez les formules, les délais et le blocage de la commande. Clé publique/secret API seulement si vous voulez envoyer les liens par WhatsApp.

== Changelog ==
= 1.0.0 =
Première version.
