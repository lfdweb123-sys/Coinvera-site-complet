# Relais Bybit (IP fixe)

Bybit exige une IP enregistrée pour donner le droit de retrait à une clé API. Vercel n'a pas d'IP fixe : ce petit service tourne sur un serveur (VPS) à IP fixe et c'est lui qui appelle Bybit.

## 1. Serveur
Un VPS Linux avec Node 18+ (n'importe quel hébergeur, IP publique fixe). Copier `server.mjs`.

## 2. Variables (sur le VPS uniquement)
- `BYBIT_API_KEY`, `BYBIT_API_SECRET` : une clé Bybit créée pour ce relais (droit de retrait seul), avec l'IP du VPS enregistrée.
- `RELAY_SECRET` : secret partagé de 32 caractères minimum (`openssl rand -hex 32`).
- Optionnel : `RELAY_MAX_AMOUNT` (500 par défaut), `PORT` (8787), `BYBIT_BASE_URL`.

Lancer : `node server.mjs` (ou pm2 / systemd pour le garder actif).

## 3. HTTPS
Mettre un proxy HTTPS devant (Caddy : `relay.mondomaine.com { reverse_proxy localhost:8787 }`). Ouvrir uniquement les ports 80/443.

## 4. Sur Vercel
- `BYBIT_RELAY_URL` = `https://relay.mondomaine.com`
- `BYBIT_RELAY_SECRET` = le même `RELAY_SECRET`
- Les variables Bybit existantes de Vercel peuvent rester : tant que `BYBIT_RELAY_URL` et `BYBIT_RELAY_SECRET` sont présentes, les appels passent par le relais ; sinon ils partent directement.

Le relais n'accepte que deux routes (créer et lire un retrait), des demandes signées de moins de 60 s, sans rejeu, avec un plafond de montant par retrait.
