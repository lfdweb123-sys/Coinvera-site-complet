# Coinvera AI

Assistant intégré au tableau de bord utilisateur (bouton dans l'en-tête, panneau en bas à droite, historique, agrandir/réduire). Marchands uniquement (pas dans l'admin).

## Mise en service
- Variable Vercel `ANTHROPIC_API_KEY` (clé de l'API Claude, jamais côté navigateur). Sans clé, le panneau affiche « Coinvera AI n'est pas encore disponible ».
- Modèle : `claude-haiku-5-5` (le moins coûteux). Changeable avec `COINVERA_AI_MODEL`.
- Aucun index Firestore à créer.

## Fonctionnement
- `POST /api/ai/chat` (flux texte), `GET/DELETE /api/ai/chats`, `GET/DELETE /api/ai/chats/{id}`. Historique dans `ai_chats` (un document par conversation, rattaché au `uid`, 100 messages max).
- Limites : 30 messages/heure et 120/jour par personne ; message ≤ 2 000 caractères ; réponse ≤ 900 jetons ; 20 derniers messages envoyés au modèle.
- Le prompt système (`lib/ai/knowledge.ts`) contient le guide de la plateforme, les tarifs lus en direct dans les réglages, le centre d'aide et le contexte du compte (nom, statut, 2FA, solde). Il interdit de nommer les prestataires de cartes et de divulguer secrets/marges. Mettez ce fichier à jour quand une fonction change.
- Coût : surveiller la consommation dans la console Anthropic ; ajuster les limites ci-dessus au besoin.
