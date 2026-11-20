<?php
if (!defined('ABSPATH')) exit;

final class CVD_Util {
  const MAX_CENTS = 5000000;   // 50 000 USD : plafond de l'API Coinvera

  /** "10", "10.5", "10,50" -> 1000 / 1050 / 1050 (centimes). Retourne null si invalide. */
  public static function to_cents($v, $floor = 1) {
    $v = trim((string) $v);
    if (!preg_match('/^\d{1,6}(?:[.,]\d{1,2})?$/', $v)) return null;
    $c = (int) round(((float) str_replace(',', '.', $v)) * 100);
    return ($c >= max(1, (int) $floor) && $c <= self::MAX_CENTS) ? $c : null;
  }

  /** Liste "5,10,25" -> [500,1000,2500] (valeurs valides uniquement, 1 USD minimum, max 8). */
  public static function parse_amounts($s) {
    $out = [];
    foreach (preg_split('/\s*[;|,]\s*/', (string) $s) as $p) { $c = self::to_cents($p, 100); if ($c !== null) $out[] = $c; }
    return array_slice(array_values(array_unique($out)), 0, 8);
  }

  public static function money($cents) {
    $cents = (int) $cents;
    return number_format_i18n($cents / 100, $cents % 100 === 0 ? 0 : 2) . ' $';
  }

  public static function now() { return gmdate('Y-m-d H:i:s'); }

  public static function ip() {
    $ip = isset($_SERVER['REMOTE_ADDR']) ? wp_unslash($_SERVER['REMOTE_ADDR']) : '';
    $ip = apply_filters('cvd_client_ip', $ip);   // à adapter derrière un proxy de confiance
    return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '0.0.0.0';
  }

  /** Compteur à fenêtre fixe. Retourne false si la limite est dépassée. */
  public static function hit($key, $limit, $window) {
    $k = 'cvd_rl_' . md5($key); $n = (int) get_transient($k) + 1;
    set_transient($k, $n, $window);
    return $n <= $limit;
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

  public static function log($msg) { if (defined('WP_DEBUG') && WP_DEBUG) error_log('[coinvera-donations] ' . self::one_line($msg, 300)); }
}
