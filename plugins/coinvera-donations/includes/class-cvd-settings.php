<?php
if (!defined('ABSPATH')) exit;

final class CVD_Settings {
  const OPT = 'cvd_settings';

  public static function defaults() {
    return ['api_base' => 'https://api.coinvera.me', 'public_key' => '', 'secret_enc' => '', 'webhook_secret_enc' => '', 'license_key' => '',
      'suggested' => '5,10,25,50', 'min_amount' => '1', 'show_donors' => 1, 'notify_admin' => 1, 'notify_email' => '', 'receipt_donor' => 1, 'delete_on_uninstall' => 0];
  }
  public static function all() { $o = get_option(self::OPT, []); return wp_parse_args(is_array($o) ? $o : [], self::defaults()); }
  public static function get($k) { $a = self::all(); return $a[$k] ?? null; }
  public static function update(array $new) { update_option(self::OPT, array_merge(self::all(), $new), false); }

  // Les clés secrètes sont chiffrées au repos (libsodium, clé dérivée des sels WordPress), jamais renvoyées au navigateur.
  private static function key() { return hash('sha256', wp_salt('auth') . '|cvd', true); }
  public static function encrypt($plain) {
    if ($plain === '') return '';
    if (function_exists('sodium_crypto_secretbox')) { $n = random_bytes(SODIUM_CRYPTO_SECRETBOX_NONCEBYTES); return 's1:' . base64_encode($n . sodium_crypto_secretbox($plain, $n, self::key())); }
    return 'p0:' . base64_encode($plain);
  }
  public static function decrypt($s) {
    $s = (string) $s;
    if (strpos($s, 's1:') === 0 && function_exists('sodium_crypto_secretbox_open')) {
      $b = base64_decode(substr($s, 3), true); if ($b === false || strlen($b) <= SODIUM_CRYPTO_SECRETBOX_NONCEBYTES) return '';
      $p = sodium_crypto_secretbox_open(substr($b, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), substr($b, 0, SODIUM_CRYPTO_SECRETBOX_NONCEBYTES), self::key());
      return $p === false ? '' : $p;
    }
    if (strpos($s, 'p0:') === 0) { $p = base64_decode(substr($s, 3), true); return $p === false ? '' : $p; }
    return '';
  }
  public static function secret() { return self::decrypt(self::get('secret_enc')); }
  public static function webhook_secret() { return self::decrypt(self::get('webhook_secret_enc')); }
  public static function configured() { return self::get('public_key') !== '' && self::secret() !== '' && strlen((string) self::get('license_key')) >= 10; }
}
