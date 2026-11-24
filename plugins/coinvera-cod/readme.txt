=== Coinvera COD ===
Requires at least: 5.8
Requires PHP: 7.4
Stable tag: 1.0.0

Paiement à la livraison sécurisé pour WooCommerce : confirmation de chaque commande par WhatsApp avant expédition et score de fiabilité des clients.

== Description ==
* Chaque commande payable à la livraison est mise en attente et le client reçoit un message WhatsApp avec un lien de confirmation. Deux boutons : « Je confirme » ou « Ce n'est pas moi ». Seul un clic sur le bouton modifie la commande (l'aperçu automatique du lien par WhatsApp ne confirme rien).
* Confirmée : la commande passe en traitement et peut être expédiée. Refusée, ou sans réponse dans le délai réglé : annulée (ou laissée en attente, au choix).
* Score de fiabilité (0-100) par client, calculé à partir de l'historique de VOTRE boutique : livraisons réussies, colis refusés, commandes non confirmées. Sous le seuil que vous fixez, l'option « paiement à la livraison » n'est plus proposée : le client doit payer en ligne.
* Actions manuelles sur l'écran de commande : renvoyer la demande, confirmer par téléphone, marquer un colis refusé.
* Aucun compte WhatsApp Business à créer : l'envoi passe par le compte unique Coinvera, avec la même licence que vos autres plugins.
* Les clients sont reconnus par un identifiant haché et irréversible (numéro et e-mail), jamais stockés en clair. Journal conservé 180 jours, scores 24 mois après la dernière activité.
* Compatible HPOS (commandes en tables dédiées) et checkout en blocs.
* Même licence que les autres plugins Coinvera.

== Comment le score est calculé ==
score = 100 x (d + 2) / (d + 2 + 3r + u + 1), où d = commandes livrées, r = colis refusés, u = commandes non confirmées. Un nouveau client vaut environ 67 et n'est jamais pénalisé d'avance. Seuil par défaut : 40.

== Bon à savoir ==
* Passez une commande en « Terminée » une fois livrée et encaissée : c'est ce qui crédite le client. Si le colis est refusé, utilisez l'action « colis refusé » au lieu de terminer la commande.
* Le score ne repose que sur l'historique de votre boutique ; un client inconnu n'est jamais bloqué.
* Seul WhatsApp est pris en charge pour la confirmation (pas de SMS). Si l'envoi échoue ou si le client n'a pas WhatsApp, confirmez par téléphone depuis l'écran de commande.
* Sur le checkout classique, le mode COD disparaît dès que le numéro saisi correspond à un client sous le seuil. Sur le checkout en blocs, la commande est refusée avec un message à la validation.
* Les messages WhatsApp hors fenêtre de 24 h utilisent un modèle pré-approuvé par Meta, géré côté Coinvera.

== Installation ==
1. WooCommerce doit être installé et activé, avec le paiement à la livraison activé.
2. Extensions > Ajouter > Téléverser le fichier ZIP, puis activer.
3. Coinvera COD > Réglages : licence + clé publique/secret API (les mêmes que pour vos autres plugins Coinvera), puis délai de confirmation et seuil de score.

== Changelog ==
= 1.0.0 =
Première version.
