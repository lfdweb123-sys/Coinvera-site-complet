<?php
if (!defined('ABSPATH')) exit;

/** Coinvera Guard ne crée jamais de paiement ni n'intercepte de donnée de carte : il ne fait que vérifier la licence
 *  auprès de l'API Coinvera (même point d'accès et même clé que les autres plugins). */
final class CVG_API {
  public static function base() { return untrailingslashit((string) CVG_Settings::get('api_base')); }

  public static function license($action) {
    $key = (string) CVG_Settings::get('license_key');
    if (strlen($key) < 10) return new WP_Error('cvg_no_license', 'Aucune clé de licence.');
    $r = wp_remote_post(self::base() . '/license/' . $action, ['timeout' => 15, 'redirection' => 0, 'headers' => ['Content-Type' => 'application/json'],
      'body' => wp_json_encode(['licenseKey' => $key, 'siteUrl' => home_url(), 'plugin' => 'guard'])]);
    if (is_wp_error($r)) return $r;
    $d = json_decode(wp_remote_retrieve_body($r), true);
    return is_array($d) ? $d : [];
  }

  /** Licence valide pour ce site ? Résultat mis en cache 12 h ; en cas de panne réseau, tolérance de 72 h après le dernier succès. */
  public static function licensed() {
    $v = get_transient('cvg_license_ok');
    if ($v === 'yes') return true;
    if ($v === 'no') return false;
    if ($v === 'err') return (time() - (int) get_option('cvg_license_ok_at', 0)) < 3 * DAY_IN_SECONDS;
    $r = self::license('check');
    if (is_wp_error($r)) { set_transient('cvg_license_ok', 'err', 5 * MINUTE_IN_SECONDS); return (time() - (int) get_option('cvg_license_ok_at', 0)) < 3 * DAY_IN_SECONDS; }
    $ok = !empty($r['valid']);
    set_transient('cvg_license_ok', $ok ? 'yes' : 'no', $ok ? 12 * HOUR_IN_SECONDS : HOUR_IN_SECONDS);
    if ($ok) update_option('cvg_license_ok_at', time(), false);
    return $ok;
  }
}
