=== Coinvera Tickets ===
Requires at least: 5.8
Requires PHP: 7.4
Stable tag: 1.0.0

Billetterie d'événements via Coinvera : jauge garantie sans surbooking, billets avec QR code, contrôle d'entrée sur téléphone.

== Description ==
* Événements avec plusieurs types de billets, quotas, fenêtre de vente et jauge totale garantie (jamais dépassée, même avec des achats simultanés).
* Réservation des places pendant le paiement, libérées automatiquement si le paiement n'aboutit pas.
* Paiement par carte hébergé par Coinvera : aucune donnée de carte ne transite par votre site.
* Une commande n'est validée qu'après relecture du paiement auprès de l'API Coinvera (statut, mode réel, montant, référence). Paiement tardif sans place disponible : signalé « à vérifier », jamais de billet au-delà de la jauge.
* Billets avec QR code (page privée imprimable) envoyés par e-mail ; codes à contrôle intégré.
* Contrôle d'entrée sur téléphone (scan caméra ou saisie), chaque billet n'est valable qu'une fois.
* Billets offerts, remboursement manuel (places libérées), export CSV des participants, outils RGPD.
* Webhook configuré automatiquement. Même licence que les autres plugins Coinvera.

== Installation ==
1. Extensions > Ajouter > Téléverser le fichier ZIP, puis activer.
2. Billetterie Coinvera > Réglages : licence et clés API ; enregistrer (le webhook se configure tout seul).
3. Billetterie Coinvera > Événements : créer un événement et ses types de billets, puis placer [coinvera_event id="ID"] dans une page.

== Shortcodes ==
[coinvera_event id="12"] — vitrine et achat.
[coinvera_checkin event="12"] — contrôle d'entrée (équipe connectée).

== Changelog ==
= 1.0.0 =
Première version.
