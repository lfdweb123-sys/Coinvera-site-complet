'use client';
import { useState } from 'react';
const BASE = 'https://api.coinvera.me';
const sign = {
  curl: `TS=$(date +%s000); NONCE=$(openssl rand -hex 12); BODY='{"amount":49.9,"title":"Commande #1042"}'
HASH=$(printf '%s' "$BODY" | openssl dgst -sha256 -hex | awk '{print $2}')
SIG=$(printf '%s' "$TS.$NONCE.POST./v1/payments.$HASH" | openssl dgst -sha256 -hmac "$SECRET" -hex | awk '{print $2}')
curl -X POST ${BASE}/v1/payments -H "Content-Type: application/json" \\
  -H "X-Api-Key: $PUBLIC_KEY" -H "X-Timestamp: $TS" -H "X-Nonce: $NONCE" -H "X-Signature: $SIG" \\
  -H "Idempotency-Key: order-1042" -d "$BODY"`,
  js: `import crypto from 'node:crypto';
const body = JSON.stringify({ amount: 49.9, title: 'Commande #1042' });
const ts = Date.now().toString(), nonce = crypto.randomBytes(12).toString('hex');
const hash = crypto.createHash('sha256').update(body).digest('hex');
const sig = crypto.createHmac('sha256', SECRET).update(\`\${ts}.\${nonce}.POST./v1/payments.\${hash}\`).digest('hex');
const r = await fetch('${BASE}/v1/payments', { method: 'POST', body, headers: {
  'Content-Type': 'application/json', 'X-Api-Key': PUBLIC_KEY, 'X-Timestamp': ts, 'X-Nonce': nonce, 'X-Signature': sig, 'Idempotency-Key': 'order-1042' } });
console.log(await r.json());`,
  python: `import hashlib, hmac, json, os, time, requests
body = json.dumps({"amount": 49.9, "title": "Commande #1042"}, separators=(",", ":"))
ts, nonce = str(int(time.time() * 1000)), os.urandom(12).hex()
h = hashlib.sha256(body.encode()).hexdigest()
sig = hmac.new(SECRET.encode(), f"{ts}.{nonce}.POST./v1/payments.{h}".encode(), hashlib.sha256).hexdigest()
r = requests.post("${BASE}/v1/payments", data=body, headers={"Content-Type": "application/json",
  "X-Api-Key": PUBLIC_KEY, "X-Timestamp": ts, "X-Nonce": nonce, "X-Signature": sig, "Idempotency-Key": "order-1042"})
print(r.json())`,
  php: `<?php
$body = json_encode(['amount' => 49.9, 'title' => 'Commande #1042']);
$ts = (string) round(microtime(true) * 1000); $nonce = bin2hex(random_bytes(12));
$sig = hash_hmac('sha256', "$ts.$nonce.POST./v1/payments." . hash('sha256', $body), $SECRET);
$ch = curl_init('${BASE}/v1/payments');
curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_POSTFIELDS => $body, CURLOPT_RETURNTRANSFER => true, CURLOPT_HTTPHEADER => [
  'Content-Type: application/json', "X-Api-Key: $PUBLIC_KEY", "X-Timestamp: $ts", "X-Nonce: $nonce", "X-Signature: $sig", 'Idempotency-Key: order-1042']]);
echo curl_exec($ch);` };
const SECTIONS: [string, string, string][] = [
  ['intro', 'Introduction', 'L’API Coinvera est une API REST en JSON, versionnée (/v1). Elle permet de créer des paiements par carte, de consulter leur statut, vos transactions, votre solde et votre profil marchand. Seuls les endpoints listés ici sont disponibles.'],
  ['quickstart', 'Quick Start', '1) Créez un compte et générez une clé test dans « API & Développeurs ». 2) Signez vos requêtes (voir Authentification). 3) Créez un paiement et redirigez le client vers checkoutUrl. 4) Attendez la confirmation (webhook ou GET /payments/{id}). Vous disposez de 2 essais gratuits en mode test ; la production nécessite l’activation.'],
  ['auth', 'Authentication', 'Base URL : https://api.coinvera.me. Chaque requête porte : X-Api-Key (clé publique), X-Timestamp (millisecondes, tolérance 5 min), X-Nonce (unique par requête) et X-Signature = HMAC-SHA256(secret, "{timestamp}.{nonce}.{METHOD}.{path}.{sha256(corps brut)}"). Pour un GET, le corps est vide. Un nonce réutilisé est refusé (401).'],
  ['create', 'Create Payment', 'POST /v1/payments — corps : amount (nombre, 1 à 50000 USD), title (texte), customerEmail (optionnel), orderRef (optionnel). En-tête optionnel Idempotency-Key : rejouer la même clé renvoie la même réponse sans créer de doublon. Réponse 201 : { id, status: "pending", amount, mode, checkoutUrl, fees: { processingBps, platformBps, totalBps } }. Erreur 402 activation_required une fois les essais gratuits épuisés.'],
  ['get', 'Get Payment', 'GET /v1/payments/{id} — renvoie le paiement du marchand authentifié : status (pending, confirmed), amount, net, fees { processing, platform, total }, mode (test ou live). Un paiement d’un autre marchand renvoie 404.'],
  ['transactions', 'Transactions', 'GET /v1/transactions?page=1&size=20 — vos transactions, de la plus récente à la plus ancienne. Paramètres : page (défaut 1) et size (défaut 20, maximum 100). Réponse : { data, total, page, size }.'],
  ['balances', 'Balances', 'GET /v1/balances — { currency: "USD", available, reserved }.'],
  ['merchant', 'Merchant', 'GET /v1/merchant — { merchantCode, company, keyMode, apiActivated, trialsUsed }.'],
  ['webhooks', 'Webhooks', 'Configurez jusqu’à 5 URL https dans « Webhooks » : chaque événement est envoyé à toutes. Coinvera envoie un POST JSON { type: "payment.confirmed", data: { id, orderRef }, createdAt } avec l’en-tête X-Coinvera-Signature = HMAC-SHA256 du corps brut, avec votre secret de webhook. Vérifiez la signature, puis relisez le paiement via GET /payments/{id} avant de livrer.'],
  ['autohook', 'Webhook automatique', 'PUT /v1/webhooks — corps : { url } (https). AJOUTE l’URL à la liste de notification de votre compte (5 maximum, sans remplacer les autres, appel répété sans effet) et renvoie { url, urls, secret } ; le secret de signature est le même pour toutes les URL. Les plugins WooCommerce et de dons l’appellent automatiquement à l’enregistrement des réglages : aucune configuration manuelle. Erreurs : 400 unsafe_url (https obligatoire), 409 webhook_limit. GET /v1/webhooks renvoie { url, urls }.'],
  ['errors', 'Error Codes', '400 invalid_request · 401 missing_auth_headers, timestamp_out_of_range, invalid_or_revoked_key, bad_signature, nonce_reused · 402 activation_required · 404 not_found · 429 rate_limited · 500 internal_error.'],
  ['limits', 'Rate Limits', 'Des limites de débit s’appliquent ; au-delà, la réponse est 429 rate_limited. Les montants vont de 1 à 50 000 USD par paiement.'],
  ['security', 'Security', 'Conservez le secret côté serveur uniquement, ne l’exposez jamais dans un navigateur ou une application mobile. Révoquez toute clé compromise (effet immédiat). Ne livrez une commande qu’après statut confirmed lu côté serveur.'],
  ['woocommerce', 'WooCommerce Integration', 'Installez le plugin Coinvera Crypto Gateway, activez votre licence, saisissez vos clés API. Le plugin crée le paiement, redirige le client, puis vérifie le statut côté serveur toutes les 5 minutes : la commande n’est marquée payée qu’après confirmation.'],
  ['sdks', 'SDKs and Examples', 'Pas de SDK officiel pour l’instant ; exemples ci-dessous.'] ];
export default function Docs() {
  const [q, setQ] = useState(''), [lang, setLang] = useState<keyof typeof sign>('curl'), [ok, setOk] = useState(false);
  const list = SECTIONS.filter(([, t, b]) => (t + b).toLowerCase().includes(q.toLowerCase()));
  const code = <div><div className="tabs">{(Object.keys(sign) as (keyof typeof sign)[]).map(l => <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>{l === 'js' ? 'JavaScript' : l === 'php' ? 'PHP' : l === 'curl' ? 'cURL' : 'Python'}</button>)}</div>
    <div className="code"><button className="btn" style={{ position: 'absolute', right: 8, top: 8, minHeight: 30, padding: '2px 10px' }} onClick={() => { navigator.clipboard.writeText(sign[lang]); setOk(true); setTimeout(() => setOk(false), 1500); }}>{ok ? 'Copié' : 'Copier'}</button><pre style={{ margin: 0 }}>{sign[lang]}</pre></div></div>;
  return <div className="docs wrap" style={{ paddingTop: 28 }}><aside><input className="in" placeholder="Rechercher" value={q} onChange={e => setQ(e.target.value)} aria-label="Rechercher dans la documentation" style={{ marginBottom: 10 }} />{list.map(([id, t]) => <a key={id} href={'#' + id}>{t}</a>)}</aside>
    <main><h1 style={{ fontSize: 40, marginBottom: 24 }}>Documentation API Coinvera</h1>{list.map(([id, t, b]) => <section key={id} id={id}><h2 style={{ fontSize: 26 }}>{t}</h2><p>{b}</p>{(id === 'auth' || id === 'create' || id === 'sdks') && code}</section>)}
      {!list.length && <p className="mut">Aucun résultat.</p>}<p className="mut">Réponse type (201) : <code>{'{ "id": "…", "status": "pending", "amount": 49.9, "mode": "test", "checkoutUrl": "https://…" }'}</code></p></main></div>;
}
