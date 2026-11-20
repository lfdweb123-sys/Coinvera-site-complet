=== Coinvera Donations ===
Requires at least: 5.8
Requires PHP: 7.4
Stable tag: 1.0.0

Dons et cagnottes par carte via Coinvera, sur WordPress (sans WooCommerce).

== Description ==
* Cagnottes avec objectif, date limite, montant minimum et montants suggérés.
* Dons libres et dons anonymes, message du donateur, mur des donateurs.
* Paiement par carte hébergé par Coinvera : aucune donnée de carte ne transite par votre site.
* Un don n'est compté qu'après relecture du paiement auprès de l'API Coinvera (statut, mode réel, montant, référence).
* Liste des dons, export CSV, e-mails de notification et de remerciement, outils RGPD de WordPress.
* Même licence que le plugin WooCommerce Coinvera.

== Installation ==
1. Extensions > Ajouter > Téléverser le fichier ZIP, puis activer.
2. Dons Coinvera > Réglages : saisir la licence et les clés API (tableau de bord Coinvera).
3. Dons Coinvera > Cagnottes : créer une cagnotte et placer son shortcode dans une page.

== Shortcodes ==
[coinvera_campaign id="12"] — cagnotte complète.
[coinvera_donate] ou [coinvera_donate id="12"] — formulaire de don.
[coinvera_progress id="12"] — barre de progression.
[coinvera_donors id="12" limit="10"] — derniers donateurs.

== Changelog ==
= 1.0.0 =
Première version.
