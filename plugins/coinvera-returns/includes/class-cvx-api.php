<?php
if (!defined('ABSPATH')) exit;

/** Coinvera Returns fonctionne entièrement en local (coupons WooCommerce, remboursements enregistrés sur la commande) :
 *  il ne fait que vérifier la licence auprès de l'API Coinvera, comme les autres plugins. */
final class CVX_API {
  public static function base() { return untrailingslashit((string) CVX_Settings::get('api_base')); }

  public static function license($action) {
    $key = (string) CVX_Settings::get('license_key');
    if (strlen($key) < 10) return new WP_Error('cvx_no_license', 'Aucune clé de licence.');
    $r = wp_remote_post(self::base() . '/license/' . $action, ['timeout' => 15, 'redirection' => 0, 'headers' => ['Content-Type' => 'application/json'],
      'body' => wp_json_encode(['licenseKey' => $key, 'siteUrl' => home_url(), 'plugin' => 'returns'])]);
    if (is_wp_error($r)) return $r;
    $d = json_decode(wp_remote_retrieve_body($r), true);
    return is_array($d) ? $d : [];
  }

  public static function licensed() {
    $v = get_transient('cvx_license_ok');
    if ($v === 'yes') return true;
    if ($v === 'no') return false;
    if ($v === 'err') return (time() - (int) get_option('cvx_license_ok_at', 0)) < 3 * DAY_IN_SECONDS;
    $r = self::license('check');
    if (is_wp_error($r)) { set_transient('cvx_license_ok', 'err', 5 * MINUTE_IN_SECONDS); return (time() - (int) get_option('cvx_license_ok_at', 0)) < 3 * DAY_IN_SECONDS; }
    $ok = !empty($r['valid']);
    set_transient('cvx_license_ok', $ok ? 'yes' : 'no', $ok ? 12 * HOUR_IN_SECONDS : HOUR_IN_SECONDS);
    if ($ok) update_option('cvx_license_ok_at', time(), false);
    return $ok;
  }
}
