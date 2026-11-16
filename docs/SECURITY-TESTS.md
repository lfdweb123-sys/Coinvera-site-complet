# Tests de securite et de charge a executer avant le lancement
Les tests unitaires (`npm test`) couvrent : montants entiers, equilibre du registre, signature HMAC. Le reste se teste sur l'emulateur Firestore ou un environnement de preuve (non executes a ce jour).
- Acces non autorise : appeler /api/balance sans jeton (401), avec jeton non verifie (403), /api/admin/* avec un marchand (403).
- Donnees d'un autre marchand : GET /api/v1/payments/{id d'un autre marchand} doit renvoyer 404.
- Manipulation des soldes : ecrire dans balances depuis le client doit etre refuse par firestore.rules.
- Double paiement : envoyer 2 fois le meme webhook, puis 20 en parallele : un seul credit (ledger_entries payment_{id}).
- Double retrait : 10 demandes simultanees pour un solde suffisant pour 1 seule : 1 accepte, 9 `insufficient_balance`.
- Webhook falsifie : signature invalide -> 400. Nonce reutilise -> 401. Cle revoquee -> 401. Horodatage de 10 min -> 401.
- Essais gratuits : creer/revoquer des cles ne remet pas trialsUsed a zero ; 3e essai -> 402.
- Escalade : auth/init ne peut jamais creer un admin ; seul scripts/set-admin.mjs ajoute le claim.
- Reconciliation : GET /api/admin/reconcile doit renvoyer consistent=true apres chaque scenario.
