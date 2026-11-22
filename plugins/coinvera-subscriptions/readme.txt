=== Coinvera Subscriptions ===
Requires at least: 5.8
Requires PHP: 7.4
Stable tag: 1.0.0

Abonnements par lien de paiement via Coinvera : échéances par e-mail, accès aux contenus réservés tant que la période est payée, relances et expiration automatiques.

== Description ==
* Plans (semaine, mois, trimestre, an) avec délai de grâce ; le prix est figé à la création de chaque échéance.
* À chaque échéance, le membre reçoit un lien de paiement par carte (hébergé par Coinvera), avec rappels la veille et le jour même.
* Une échéance n'est validée qu'après relecture du paiement auprès de l'API Coinvera (statut, mode réel, montant, référence).
* Payer en avance ne fait perdre aucun jour ; payer après expiration repart de la date du paiement.
* Compte WordPress créé seulement après le premier paiement réel ; un utilisateur existant garde son rôle.
* Contenu réservé : shortcode, case dans l'éditeur, fonction PHP cvs_user_has_access().
* Espace membre : statut, paiement, annulation du renouvellement. Administration, export CSV, outils RGPD.
* Webhook configuré automatiquement. Même licence que les autres plugins Coinvera.

== Installation ==
1. Extensions > Ajouter > Téléverser le fichier ZIP, puis activer.
2. Abonnements Coinvera > Réglages : licence et clés API ; enregistrer (le webhook se configure tout seul).
3. Abonnements Coinvera > Plans : créer un plan, puis placer [coinvera_subscribe plan="ID"] dans une page.

== Shortcodes ==
[coinvera_subscribe plan="12"] — inscription.
[coinvera_members plan="12,13"]…[/coinvera_members] — contenu réservé.
[coinvera_account] — espace membre.

== Changelog ==
= 1.0.0 =
Première version.
