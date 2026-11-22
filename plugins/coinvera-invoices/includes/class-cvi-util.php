<?php
if (!defined('ABSPATH')) exit;

final class CVI_Util {
  const MIN_PAY_CENTS = 100;       // 1 USD : minimum de l'API Coinvera
  const MAX_PAY_CENTS = 5000000;   // 50 000 USD : plafond de l'API Coinvera
  const MAX_CENTS = 99999999999;   // plafond d'une ligne / d'un sous-total (évite tout dépassement d'entier)

  /** "10", "10.5", "10,50" -> hundredths (entier). Pas de flottant. null si invalide. $digits = nombre maximal de chiffres avant la virgule. */
  public static function parse_dec($v, $digits) {
    if (!is_string($v) && !is_int($v) && !is_float($v)) return null;
    $v = trim((string) $v);
    if (!preg_match('/^(\d{1,' . (int) $digits . '})(?:[.,](\d{1,2}))?\z/', $v, $m)) return null;
    return (int) $m[1] * 100 + (isset($m[2]) ? (int) str_pad($m[2], 2, '0') : 0);
  }
  /** Montant en centimes (0 à MAX_CENTS) ou null. */
  public static function to_cents($v) { return self::parse_dec($v, 9); }
  /** Taux en % ("18", "7,5") -> points de base (0 à 10000) ou null. */
  public static function to_bp($v) { $b = self::parse_dec($v, 3); return ($b !== null && $b <= 10000) ? $b : null; }
  public static function bp_text($bp) { return rtrim(rtrim(sprintf('%.2f', ((int) $bp) / 100), '0'), '.'); }

  public static function money($cents) { return number_format_i18n(((int) $cents) / 100, 2) . ' $'; }
  public static function now() { return gmdate('Y-m-d H:i:s'); }

  /** Date du jour dans le fuseau du site (Y-m-d). */
  public static function today() { return current_time('Y-m-d'); }
  public static function valid_date($s) {
    if (!is_string($s) || !preg_match('/^(\d{4})-(\d{2})-(\d{2})\z/', $s, $m)) return false;
    return $m[1] >= 2000 && $m[1] <= 2100 && checkdate((int) $m[2], (int) $m[3], (int) $m[1]);
  }
  public static function add_days($date, $n) { return gmdate('Y-m-d', strtotime($date . ' 00:00:00 UTC') + ((int) $n) * DAY_IN_SECONDS); }
  public static function days_between($from, $to) { return (int) round((strtotime($to . ' 00:00:00 UTC') - strtotime($from . ' 00:00:00 UTC')) / DAY_IN_SECONDS); }
  public static function fmt_date($d) { return self::valid_date((string) $d) ? substr($d, 8, 2) . '/' . substr($d, 5, 2) . '/' . substr($d, 0, 4) : ''; }
  public static function fmt_gmt($dt) { return ($dt && $dt !== '0000-00-00 00:00:00') ? get_date_from_gmt($dt, 'd/m/Y') : ''; }

  /** "3,7,14" -> [3,7,14] (1 à 365 jours, uniques, triés, 8 maximum). */
  public static function parse_days($s) {
    $out = [];
    foreach (preg_split('/[\s,;]+/', (string) $s) as $p) if (preg_match('/^\d{1,3}\z/', $p) && (int) $p >= 1 && (int) $p <= 365) $out[(int) $p] = (int) $p;
    sort($out); return array_slice(array_values($out), 0, 8);
  }

  public static function public_url($token) { return add_query_arg('cvi_invoice', $token, home_url('/')); }
  public static function valid_token($t) { return is_string($t) && (bool) preg_match('/^[a-f0-9]{32}\z/', $t); }

  public static function is_overdue($r) { return $r->status === 'sent' && $r->due_date < self::today(); }
  public static function status_label($r) {
    if (self::is_overdue($r)) return 'En retard';
    $l = ['draft' => 'Brouillon', 'sent' => 'Envoyée', 'paid' => 'Payée', 'cancelled' => 'Annulée'];
    return $l[$r->status] ?? $r->status;
  }
  public static function payable_range($cents) { return (int) $cents >= self::MIN_PAY_CENTS && (int) $cents <= self::MAX_PAY_CENTS; }

  public static function ip() {
    $ip = isset($_SERVER['REMOTE_ADDR']) ? wp_unslash($_SERVER['REMOTE_ADDR']) : '';
    $ip = apply_filters('cvi_client_ip', $ip);   // à adapter derrière un proxy de confiance
    return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '0.0.0.0';
  }

  /** Compteur à fenêtre fixe. Retourne false si la limite est dépassée. */
  public static function hit($key, $limit, $window) {
    $k = 'cvi_rl_' . md5($key); $n = (int) get_transient($k) + 1;
    set_transient($k, $n, $window);
    return $n <= $limit;
  }

  /** Origine de la requête : vide ou identique à l'hôte du site. */
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

  public static function log($msg) { if (defined('WP_DEBUG') && WP_DEBUG) error_log('[coinvera-invoices] ' . self::one_line($msg, 300)); }
}
