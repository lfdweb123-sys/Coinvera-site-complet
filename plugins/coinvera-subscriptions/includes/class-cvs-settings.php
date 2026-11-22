<?php
if (!defined('ABSPATH')) exit;

final class CVS_Settings {
  const OPT = 'cvs_settings';
  /** Modèles d'e-mail (texte brut). Variables : {site} {name} {plan} {amount} {due_date} {period_end} {pay_url} {manage_url}. */
  const TEMPLATES = [
    'new' => ['Votre échéance « {plan} » ({amount})', "Bonjour {name},\n\nVotre abonnement « {plan} » arrive à échéance le {due_date}. Pour le renouveler ({amount}), payez par carte ici :\n{pay_url}\n\nGérer mon abonnement : {manage_url}\n\n{site}"],
    'remind' => ['Rappel : renouvellement de « {plan} »', "Bonjour {name},\n\nVotre abonnement « {plan} » arrive à échéance le {due_date}. Paiement du renouvellement ({amount}) :\n{pay_url}\n\nSans paiement, votre accès sera interrompu.\n\n{site}"],
    'receipt' => ['Reçu : paiement de {amount}', "Bonjour {name},\n\nNous avons bien reçu votre paiement de {amount} pour « {plan} ». Votre abonnement est valable jusqu’au {period_end}.\n\nGérer mon abonnement : {manage_url}\n\n{site}"],
    'expired' => ['Votre abonnement « {plan} » a expiré', "Bonjour {name},\n\nVotre abonnement « {plan} » a expiré et votre accès est interrompu. Vous pouvez le réactiver en payant ici :\n{pay_url}\n\n{site}"],
  ];

  public static function defaults() {
    $d = ['api_base' => 'https://api.coinvera.me', 'public_key' => '', 'secret_enc' => '', 'webhook_secret_enc' => '', 'license_key' => '',
      'consent_text' => '', 'account_url' => '', 'delete_on_uninstall' => 0];
    foreach (self::TEMPLATES as $k => $t) { $d['mail_' . $k . '_subject'] = $t[0]; $d['mail_' . $k . '_body'] = $t[1]; }
    return $d;
  }
  public static function all() { $o = get_option(self::OPT, []); return wp_parse_args(is_array($o) ? $o : [], self::defaults()); }
  public static function get($k) { $a = self::all(); return $a[$k] ?? null; }
  public static function update(array $new) { update_option(self::OPT, array_merge(self::all(), $new), false); }

  // Les clés secrètes sont chiffrées au repos (libsodium, clé dérivée des sels WordPress), jamais renvoyées au navigateur.
  private static function key() { return hash('sha256', wp_salt('auth') . '|cvs', true); }
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
  public static function ready() { return self::configured(); }
}
