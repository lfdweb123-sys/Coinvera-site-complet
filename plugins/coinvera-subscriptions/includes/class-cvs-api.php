<?php
if (!defined('ABSPATH')) exit;

/** Client de l'API Coinvera : requêtes signées (HMAC-SHA256) et licence. */
final class CVS_API {
  public static function base() { return untrailingslashit((string) CVS_Settings::get('api_base')); }

  // Requête signée : HMAC-SHA256(secret, "ts.nonce.METHOD.path.sha256(corps)") — identique au plugin WooCommerce.
  public static function call($method, $path, $body = null, $extra = []) {
    $raw = $body === null ? '' : wp_json_encode($body);
    $ts = (string) round(microtime(true) * 1000); $nonce = bin2hex(random_bytes(12));
    $sig = hash_hmac('sha256', "$ts.$nonce.$method.$path." . hash('sha256', $raw), CVS_Settings::secret());
    $args = ['method' => $method, 'timeout' => 20, 'redirection' => 0,   // pas de redirection : les en-têtes signés ne suivent jamais ailleurs
      'headers' => array_merge(['Content-Type' => 'application/json', 'X-Api-Key' => (string) CVS_Settings::get('public_key'), 'X-Timestamp' => $ts, 'X-Nonce' => $nonce, 'X-Signature' => $sig], $extra)];
    if ($raw !== '') $args['body'] = $raw;
    $r = wp_remote_request(self::base() . $path, $args);
    if (is_wp_error($r)) return $r;
    return ['code' => (int) wp_remote_retrieve_response_code($r), 'data' => json_decode(wp_remote_retrieve_body($r), true)];
  }

  public static function create_payment($cents, $title, $email, $ref, $idem) {
    $b = ['amount' => round($cents / 100, 2), 'title' => mb_substr($title, 0, 120), 'orderRef' => $ref];
    if ($email !== '' && is_email($email)) $b['customerEmail'] = $email;
    return self::call('POST', '/v1/payments', $b, ['Idempotency-Key' => $idem]);
  }
  public static function get_payment($id) { return self::call('GET', '/v1/payments/' . rawurlencode($id)); }
  public static function register_webhook($url) { return self::call('PUT', '/v1/webhooks', ['url' => $url]); }

  // --- Licence (même clé et mêmes points d'accès que le plugin WooCommerce) ---
  public static function license($action) {
    $key = (string) CVS_Settings::get('license_key');
    if (strlen($key) < 10) return new WP_Error('cvs_no_license', 'Aucune clé de licence.');
    $r = wp_remote_post(self::base() . '/license/' . $action, ['timeout' => 15, 'redirection' => 0, 'headers' => ['Content-Type' => 'application/json'],
      'body' => wp_json_encode(['licenseKey' => $key, 'siteUrl' => home_url(), 'plugin' => 'subscriptions'])]);
    if (is_wp_error($r)) return $r;
    $d = json_decode(wp_remote_retrieve_body($r), true);
    return is_array($d) ? $d : [];
  }

  /** Licence valide pour ce site ? Résultat mis en cache 12 h ; en cas de panne réseau, tolérance de 72 h après le dernier succès. */
  public static function licensed() {
    $v = get_transient('cvs_license_ok');
    if ($v === 'yes') return true;
    if ($v === 'no') return false;
    if ($v === 'err') return (time() - (int) get_option('cvs_license_ok_at', 0)) < 3 * DAY_IN_SECONDS;
    $r = self::license('check');
    if (is_wp_error($r)) { set_transient('cvs_license_ok', 'err', 5 * MINUTE_IN_SECONDS); return (time() - (int) get_option('cvs_license_ok_at', 0)) < 3 * DAY_IN_SECONDS; }
    $ok = !empty($r['valid']);
    set_transient('cvs_license_ok', $ok ? 'yes' : 'no', $ok ? 12 * HOUR_IN_SECONDS : HOUR_IN_SECONDS);
    if ($ok) update_option('cvs_license_ok_at', time(), false);
    return $ok;
  }
}
