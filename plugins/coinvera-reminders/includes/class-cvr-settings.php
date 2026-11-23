<?php
if (!defined('ABSPATH')) exit;

final class CVR_Settings {
  const OPT = 'cvr_settings';

  public static function defaults() {
    return [
      'api_base' => 'https://api.coinvera.me', 'public_key' => '', 'secret_enc' => '', 'license_key' => '', 'enabled' => 1,
      'cart_enabled' => 1, 'cart_delay_min' => 60, 'consent_required' => 1,
      'status_enabled' => 1, 'status_list' => 'processing,completed,cancelled,refunded',
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

  public static function cart_enabled() { return !empty(self::get('cart_enabled')); }
  public static function cart_delay_seconds() { return max(5, (int) self::get('cart_delay_min')) * MINUTE_IN_SECONDS; }
  public static function consent_required() { return !empty(self::get('consent_required')); }
  public static function status_enabled() { return !empty(self::get('status_enabled')); }
  public static function status_list() { return array_filter(array_map('trim', explode(',', (string) self::get('status_list')))); }
}
