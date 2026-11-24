<?php
if (!defined('ABSPATH')) exit;

/** Client de l'API Coinvera : requêtes signées (HMAC-SHA256) et licence — même schéma que les autres plugins Coinvera. */
final class CVC_API {
  public static function base() { return untrailingslashit((string) CVC_Settings::get('api_base')); }

  public static function call($method, $path, $body = null, $extra = []) {
    $raw = $body === null ? '' : wp_json_encode($body);
    $ts = (string) round(microtime(true) * 1000); $nonce = bin2hex(random_bytes(12));
    $sig = hash_hmac('sha256', "$ts.$nonce.$method.$path." . hash('sha256', $raw), CVC_Settings::secret());
    $args = ['method' => $method, 'timeout' => 20, 'redirection' => 0,
      'headers' => array_merge(['Content-Type' => 'application/json', 'X-Api-Key' => (string) CVC_Settings::get('public_key'), 'X-Timestamp' => $ts, 'X-Nonce' => $nonce, 'X-Signature' => $sig], $extra)];
    if ($raw !== '') $args['body'] = $raw;
    $r = wp_remote_request(self::base() . $path, $args);
    if (is_wp_error($r)) return $r;
    return ['code' => (int) wp_remote_retrieve_response_code($r), 'data' => json_decode(wp_remote_retrieve_body($r), true)];
  }

  /** $kind : 'cod' (demande de confirmation d'une commande payable à la livraison). $vars remplit {{1}}, {{2}}... du modèle Meta. */
  public static function send_whatsapp($phone, $country, $kind, array $vars, $idem) {
    return self::call('POST', '/v1/whatsapp', ['to' => $phone, 'country' => $country, 'kind' => $kind, 'vars' => array_values($vars)], ['Idempotency-Key' => $idem]);
  }

  // --- Licence (même clé et mêmes points d'accès que les autres plugins Coinvera) ---
  public static function license($action) {
    $key = (string) CVC_Settings::get('license_key');
    if (strlen($key) < 10) return new WP_Error('cvc_no_license', 'Aucune clé de licence.');
    $r = wp_remote_post(self::base() . '/license/' . $action, ['timeout' => 15, 'redirection' => 0, 'headers' => ['Content-Type' => 'application/json'],
      'body' => wp_json_encode(['licenseKey' => $key, 'siteUrl' => home_url(), 'plugin' => 'cod'])]);
    if (is_wp_error($r)) return $r;
    $d = json_decode(wp_remote_retrieve_body($r), true);
    return is_array($d) ? $d : [];
  }

  public static function licensed() {
    $v = get_transient('cvc_license_ok');
    if ($v === 'yes') return true;
    if ($v === 'no') return false;
    if ($v === 'err') return (time() - (int) get_option('cvc_license_ok_at', 0)) < 3 * DAY_IN_SECONDS;
    $r = self::license('check');
    if (is_wp_error($r)) { set_transient('cvc_license_ok', 'err', 5 * MINUTE_IN_SECONDS); return (time() - (int) get_option('cvc_license_ok_at', 0)) < 3 * DAY_IN_SECONDS; }
    $ok = !empty($r['valid']);
    set_transient('cvc_license_ok', $ok ? 'yes' : 'no', $ok ? 12 * HOUR_IN_SECONDS : HOUR_IN_SECONDS);
    if ($ok) update_option('cvc_license_ok_at', time(), false);
    return $ok;
  }
}
