=== Coinvera E-Invoice ===
Requires at least: 5.8
Requires PHP: 7.4
Stable tag: 1.1.0

Factures électroniques conformes (Factur-X / EN 16931) et TVA en temps réel pour WooCommerce.

== Description ==
* Chaque commande payée génère une facture PDF/A-3 Factur-X : un PDF lisible qui embarque le XML structuré (profil EN 16931, syntaxe CII). Les avoirs sont émis automatiquement lors d'un remboursement WooCommerce.
* Numérotation chronologique sans trou, par année (ex. FA-2026-000001), avoirs séparés. Les factures émises ne sont jamais modifiées ni supprimées ; une erreur se corrige par un avoir.
* TVA calculée en temps réel selon l'adresse de facturation ou de livraison, et selon l'adresse IP tant qu'aucune adresse n'est saisie (géolocalisation de WooCommerce). Outil pour créer en un clic les taux normaux manquants des pays UE et de quelques pays africains.
* Champ « N° de TVA » au paiement, vérifié auprès de VIES. Autoliquidation automatique, au paiement classique comme au paiement en blocs, pour un professionnel d'un autre État membre ; mentions d'exonération, de livraison intracommunautaire, d'export et de franchise en base.
* Taxes multiples ou composées sur une même ligne : facturées au taux cumulé exact (somme, ou produit pour une taxe composée), avec une mention sur la facture.
* Remboursement en montant libre : l'avoir est ventilé par taux au prorata de la facture d'origine, et le montant remboursé est conservé au centime.
* Facture jointe aux e-mails WooCommerce, téléchargeable depuis « Mon compte », et XML téléchargeable par l'administrateur.
* Sans service tiers de génération : tout est produit sur votre serveur. Compatible HPOS et paiement en blocs.

== Ce que le plugin garantit, et ce qu'il ne fait pas ==
* Le XML produit est validé en test avec le schéma officiel UN/CEFACT D16B et les règles métier (schematron) EN 16931 de la Commission européenne, sur 15 cas : vente France, taxes cumulées et composées, avoir en montant libre, multi-taux, autoliquidation, livraison intracommunautaire, export, hors champ, franchise en base, avoir, vendeur hors UE.
* Le PDF respecte les exigences PDF/A-3b contrôlables par validateur libre (polices intégrées, profil sRGB, métadonnées XMP, pièce jointe déclarée). Le contrôle complet véraPDF n'a pas pu être exécuté dans l'environnement de développement.
* Le plugin n'est PAS une plateforme agréée : il ne transmet rien à l'administration fiscale. En France, l'émission passe par une plateforme de dématérialisation partenaire (PDP) ou le portail public de facturation ; ce plugin produit le fichier Factur-X conforme à déposer ou à joindre.
* Les taux de TVA fournis sont des taux normaux de départ, modifiables ; les taux réduits restent à votre charge (classes de taxe WooCommerce). Faites valider la configuration par votre comptable.

== Installation ==
1. WooCommerce doit être installé et activé, avec les taxes activées.
2. Extensions > Ajouter > Téléverser le fichier ZIP, puis activer.
3. E-Invoice > Réglages : licence, identité du vendeur (adresse, n° de TVA), puis « Créer les taux manquants » pour vos pays de vente.

== Changelog ==
= 1.1.0 =
Taxes multiples ou composées par ligne (taux cumulé), avoirs en montant libre, autoliquidation sur le paiement en blocs, précision des taux à 4 décimales.

= 1.0.0 =
Première version.
