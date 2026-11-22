<?php
if (!defined('ABSPATH')) exit;

final class CVT_Util {
  const MAX_CENTS = 5000000;   // 50 000 USD : plafond de l'API Coinvera

  /** "10", "10.5", "10,50" -> centimes. Retourne null si invalide ou hors bornes. */
  public static function to_cents($v, $floor = 1) {
    $v = trim((string) $v);
    if (!preg_match('/^\d{1,7}(?:[.,]\d{1,2})?$/', $v)) return null;
    $c = (int) round(((float) str_replace(',', '.', $v)) * 100);
    return ($c >= max(1, (int) $floor) && $c <= self::MAX_CENTS) ? $c : null;
  }

  public static function money($cents) {
    $cents = (int) $cents;
    return number_format_i18n($cents / 100, $cents % 100 === 0 ? 0 : 2) . ' $';
  }

  public static function now() { return gmdate('Y-m-d H:i:s'); }

  /** Date UTC « Y-m-d H:i:s » + N jours (N peut être négatif). */
  public static function add_days($utc, $n) {
    $d = new DateTimeImmutable($utc, new DateTimeZone('UTC'));
    return $d->modify(((int) $n >= 0 ? '+' : '') . (int) $n . ' days')->format('Y-m-d H:i:s');
  }

  public static function datetime($utc) { return ($utc === null || $utc === '') ? '—' : get_date_from_gmt((string) $utc, 'd/m/Y H:i'); }
  /** Date d'affichage (fuseau du site). */
  public static function date($utc) { return ($utc === null || $utc === '') ? '—' : get_date_from_gmt((string) $utc, 'd/m/Y'); }

  public static function token() { return bin2hex(random_bytes(16)); }
  public static function is_token($s) { return is_string($s) && preg_match('/^[a-f0-9]{32}$/', $s) === 1; }

  public static function ip() {
    $ip = isset($_SERVER['REMOTE_ADDR']) ? wp_unslash($_SERVER['REMOTE_ADDR']) : '';
    $ip = apply_filters('cvt_client_ip', $ip);   // à adapter derrière un proxy de confiance
    return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '0.0.0.0';
  }

  /** Compteur à fenêtre fixe. Retourne false si la limite est dépassée. */
  public static function hit($key, $limit, $window) {
    $k = 'cvt_rl_' . md5($key); $n = (int) get_transient($k) + 1;
    set_transient($k, $n, $window);
    return $n <= $limit;
  }

  /** Origine de la requête (si indiquée par le navigateur) = hôte du site. */
  public static function same_origin($src) {
    return $src === '' || strtolower((string) wp_parse_url($src, PHP_URL_HOST)) === strtolower((string) wp_parse_url(home_url(), PHP_URL_HOST));
  }

  /** Une ligne, sans retour chariot : pour objets d'e-mail et journaux. */
  public static function one_line($s, $max = 150) {
    return mb_substr(trim(preg_replace('/[\r\n\t]+/', ' ', wp_strip_all_tags((string) $s))), 0, $max);
  }

  /** Neutralise l'injection de formules dans les exports CSV. */
  public static function csv_cell($s) {
    $s = (string) $s;
    return ($s !== '' && strpos("=+-@\t\r", $s[0]) !== false) ? "'" . $s : $s;
  }

  public static function log($msg) { if (defined('WP_DEBUG') && WP_DEBUG) error_log('[coinvera-tickets] ' . self::one_line($msg, 300)); }
}
