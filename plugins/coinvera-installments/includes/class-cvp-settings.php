<?php
if (!defined('ABSPATH')) exit;

final class CVP_Settings {
  const OPT = 'cvp_settings';

  public static function defaults() {
    return [
      'api_base' => 'https://api.coinvera.me', 'public_key' => '', 'secret_enc' => '', 'license_key' => '', 'enabled' => 1,
      'plan_deposit' => 1, 'deposit_pct' => 50, 'plan_split2' => 1, 'plan_split3' => 1, 'min_total' => 0,
      'interval_days' => 30, 'balance_days' => 7, 'overdue_days' => 3, 'block_complete' => 1, 'notify_whatsapp' => 1,
      'delete_on_uninstall' => 0,
    ];
  }
  public static function all() { $o = get_option(self::OPT, []); return wp_parse_args(is_array($o) ? $o : [], self::defaults()); }
  public static function get($k) { $a = self::all(); return $a[$k] ?? null; }
  public static function update(array $new) { update_option(self::OPT, array_merge(self::all(), $new), false); }

  // --- Chiffrement du secret (identique aux autres plugins Coinvera : AES via libsodium, clé dérivée des sels WP) ---
  private static function key() { return hash('sha256', wp_salt('auth') . wp_salt('secure_auth'), true); }
  public static function encrypt($plain) {
    if ($plain === '') return '';
    if (function_exists('sodium_crypto_secretbox')) { $n = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES); return 's1:' . base64_encode($n . sodium_crypto_secretbox($plain, $n, self::key())); }
    return 'p1:' . base64_encode($plain);   // repli si libsodium absent (rare sur PHP 7.4+) : à éviter en production
  }
  private static function decrypt($s) {
    $s = (string) $s; if ($s === '') return '';
    if (strpos($s, 's1:') === 0 && function_exists('sodium_crypto_secretbox_open')) {
      $b = base64_decode(substr($s, 3), true); if ($b === false || strlen($b) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES) return '';
      $p = sodium_crypto_secretbox_open(substr($b, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), substr($b, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), self::key());
      return $p === false ? '' : $p;
    }
    if (strpos($s, 'p1:') === 0) return (string) base64_decode(substr($s, 3), true);
    return '';
  }
  public static function secret() { return self::decrypt(self::get('secret_enc')); }

  public static function enabled() { return !empty(self::get('enabled')); }
  public static function license_set() { return strlen((string) self::get('license_key')) >= 10; }
  public static function configured() { return self::get('public_key') !== '' && self::secret() !== '' && self::license_set(); }

  public static function int($k, $min, $max) { return max($min, min($max, (int) self::get($k))); }
  public static function plan_enabled($plan) { return in_array($plan, ['deposit', 'split2', 'split3'], true) && !empty(self::get('plan_' . $plan)); }
  public static function block_complete() { return !empty(self::get('block_complete')); }
  public static function notify_whatsapp() { return !empty(self::get('notify_whatsapp')) && self::configured(); }
}
