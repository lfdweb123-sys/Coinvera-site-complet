# Relais Bybit (IP fixe)

Bybit exige une IP enregistrée pour donner le droit de retrait à une clé API. Vercel n'a pas d'IP fixe : ce petit service tourne sur un serveur (VPS) à IP fixe et c'est lui qui appelle Bybit.

## 1. Serveur
Un VPS Linux avec Node 18+ (n'importe quel hébergeur, IP publique fixe). Copier `server.mjs`.

## 2. Variables (sur le VPS uniquement)
- `BYBIT_API_KEY`, `BYBIT_API_SECRET` : une clé Bybit créée pour ce relais (droit de retrait seul), avec l'IP du VPS enregistrée.
- `RELAY_SECRET` : secret partagé de 32 caractères minimum (`openssl rand -hex 32`).
- Optionnel : `RELAY_MAX_AMOUNT` (500 par défaut), `PORT` (8787), `BYBIT_BASE_URL`.


Lancer : `node server.mjs` (ou pm2 / systemd pour le garder actif).

## 3. HTTPS avec Cloudflare Tunnel (sans ouvrir de port)
Cloudflare Tunnel relie le relais à Cloudflare par une connexion sortante : le relais reçoit les appels de Vercel en HTTPS, sans port ouvert ni proxy à installer. Il faut un domaine géré par Cloudflare.
1. Dans le tableau de bord Cloudflare (Zero Trust, rubrique Tunnels), créer un tunnel et copier la commande d'installation du connecteur `cloudflared` pour Linux, puis l'exécuter sur le serveur (il s'installe en service et redémarre seul).
2. Ajouter un nom d'hôte public, par exemple `relay.mondomaine.com`, qui pointe vers le service `http://localhost:8787`.
3. Vérifier : `https://relay.mondomaine.com/health` doit répondre `{"ok":true}`.

**Important : le Tunnel ne change pas l'IP vue par Bybit.** Il ne sert qu'aux appels qui ARRIVENT au relais. Quand le relais appelle Bybit, Bybit voit l'IP publique de la machine qui fait tourner le relais. Cette IP doit donc être fixe, et c'est elle qu'on enregistre dans la clé Bybit. Sur un ordinateur de maison, l'IP change en général : il faut un serveur à IP publique fixe.

Alternative sans Cloudflare : Caddy (`relay.mondomaine.com { reverse_proxy localhost:8787 }`) avec les ports 80 et 443 ouverts.

## 4. Sur Vercel
- `BYBIT_RELAY_URL` = `https://relay.mondomaine.com`
- `BYBIT_RELAY_SECRET` = le même `RELAY_SECRET`
- Les variables Bybit existantes de Vercel peuvent rester : tant que `BYBIT_RELAY_URL` et `BYBIT_RELAY_SECRET` sont présentes, les appels passent par le relais ; sinon ils partent directement.

Le relais n'accepte que deux routes (créer et lire un retrait), des demandes signées de moins de 60 s, sans rejeu, avec un plafond de montant par retrait.
