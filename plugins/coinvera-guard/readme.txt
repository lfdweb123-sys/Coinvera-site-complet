=== Coinvera Guard ===
Requires at least: 5.8
Requires PHP: 7.4
Stable tag: 1.0.0

Protection invisible du checkout WooCommerce contre le card testing, les adresses jetables et les tentatives répétées, sans CAPTCHA.

== Description ==
* Fonctionne avec n'importe quelle passerelle de paiement WooCommerce (Coinvera ou non) : protège le checkout en amont, avant même que la demande de paiement ne parte.
* Détection par vélocité : trop de commandes, ou trop de paiements déjà échoués, depuis la même IP en peu de temps -> blocage temporaire (durée réglable).
* Blocage ou simple signalement (au choix) des adresses e-mail jetables/temporaires les plus répandues.
* Point d'extension (`cvg_ip_is_risky`) pour brancher votre propre service de détection VPN/proxy/datacenter si vous en utilisez un.
* Listes blanches et noires manuelles (IP et e-mails), journal des tentatives bloquées/signalées, alerte e-mail groupée en cas d'attaque.
* Compatible HPOS (commandes en tables dédiées) et checkout en blocs (Store API).
* Même licence que les autres plugins Coinvera.
* Aucune donnée de carte bancaire n'est traitée par ce plugin.

== Installation ==
1. WooCommerce doit être installé et activé.
2. Extensions > Ajouter > Téléverser le fichier ZIP, puis activer.
3. Coinvera Guard > Réglages : licence, puis ajustez si besoin les seuils de vélocité.

== Changelog ==
= 1.0.0 =
Première version.
