<?php
if (!defined('ABSPATH')) exit;

final class CVG_Util {
  public static function now() { return gmdate('Y-m-d H:i:s'); }

  public static function ip() {
    $ip = isset($_SERVER['REMOTE_ADDR']) ? wp_unslash($_SERVER['REMOTE_ADDR']) : '';
    $ip = apply_filters('cvg_client_ip', $ip);   // à adapter derrière un proxy de confiance (reverse proxy, CDN)
    return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : '0.0.0.0';
  }

  /** Compteur à fenêtre fixe. Retourne false si la limite est dépassée (incrémente avant de comparer). */
  public static function hit($key, $limit, $window) {
    $k = 'cvg_rl_' . md5($key); $n = (int) get_transient($k) + 1;
    set_transient($k, $n, max(1, (int) $window));
    return $n <= max(1, (int) $limit);
  }
  /** Valeur courante d'un compteur, sans l'incrémenter. */
  public static function count($key) { return (int) get_transient('cvg_rl_' . md5($key)); }
  public static function reset($key) { delete_transient('cvg_rl_' . md5($key)); }

  public static function domain_of($email) {
    $email = (string) $email; $at = strrpos($email, '@');
    return $at === false ? '' : strtolower(trim(substr($email, $at + 1)));
  }

  /** Domaines de messagerie jetable / temporaire les plus répandus. Liste volontairement non exhaustive :
   *  combinée à la vérification de vélocité, qui reste la protection la plus fiable contre le card testing. */
  public static function disposable_domains() {
    static $base = ['mailinator.com', 'mailinator.net', 'mailinator.org', 'yopmail.com', 'yopmail.fr', 'yopmail.net', 'guerrillamail.com', 'guerrillamail.net',
      'guerrillamail.org', 'guerrillamail.biz', 'guerrillamailblock.com', 'sharklasers.com', 'grr.la', 'pokemail.net', 'spam4.me', '10minutemail.com', '10minutemail.net',
      '20minutemail.com', 'temp-mail.org', 'tempmail.com', 'tempmail.net', 'tempmailo.com', 'tempinbox.com', 'throwawaymail.com', 'trashmail.com', 'trashmail.net',
      'trash-mail.com', 'dispostable.com', 'fakeinbox.com', 'fakemailgenerator.com', 'getnada.com', 'maildrop.cc', 'mailnesia.com', 'mintemail.com', 'mohmal.com',
      'mytemp.email', 'emailondeck.com', 'moakt.cc', 'moakt.com', 'spamgourmet.com', 'getairmail.com', 'inboxbear.com', 'discard.email', 'discardmail.com', 'mailcatch.com',
      'einrot.com', 'byom.de', 'fleckens.hu', 'jourrapide.com', 'rhyta.com', 'armyspy.com', 'cuvox.de', 'dayrep.com', 'superrito.com', 'teleworm.us', 'anonbox.net',
      'burnermail.io', 'emailfake.com', 'luxusmail.org', 'spoofmail.de', 'tempail.com', 'crazymailing.com', 'mailpoof.com', 'minuteinbox.com', 'inboxkitten.com',
      'tempm.com', 'tmail.ws', 'tmpmail.net', 'tmpmail.org', 'tmpeml.com', 'nada.email', 'spambox.us', 'incognitomail.com', 'mailexpire.com', 'spamfree24.org',
      'spamfree24.de', 'spamfree24.com', 'wegwerfmail.de', 'wegwerfmail.net', 'wegwerfmail.org', 'kurzpost.de', 'trbvm.com', 'getter.pw', 'yomail.info', 'mail-temporaire.fr',
      'jetable.org', 'yopmail.be', 'spambog.com', 'spambog.de', 'spambog.ru'];
    return apply_filters('cvg_disposable_domains', $base);
  }
  public static function is_disposable($domain) { $domain = strtolower((string) $domain); return $domain !== '' && in_array($domain, self::disposable_domains(), true); }

  /** "1.2.3.4\n5.6.7.8" -> IP exacte présente ? */
  public static function ip_in_list($ip, $list_text) {
    foreach (self::lines($list_text) as $l) if (strcasecmp($l, $ip) === 0) return true;
    return false;
  }
  /** Adresse exacte OU "@domaine.tld" présent dans la liste. */
  public static function email_in_list($email, $list_text) {
    $email = strtolower((string) $email); $domain = self::domain_of($email);
    foreach (self::lines($list_text) as $l) {
      $l = strtolower($l);
      if ($l === $email) return true;
      if ($l !== '' && $l[0] === '@' && $domain !== '' && substr($l, 1) === $domain) return true;
    }
    return false;
  }
  private static function lines($text) {
    $out = [];
    foreach (preg_split('/[\r\n]+/', (string) $text) as $l) { $l = trim($l); if ($l !== '' && $l[0] !== '#') $out[] = $l; }
    return $out;
  }

  /** Une ligne, sans retour chariot : pour les journaux et notifications. */
  public static function one_line($s, $max = 200) {
    return mb_substr(trim(preg_replace('/[\r\n\t]+/', ' ', wp_strip_all_tags((string) $s))), 0, $max);
  }
  public static function log($msg) { if (defined('WP_DEBUG') && WP_DEBUG) error_log('[coinvera-guard] ' . self::one_line($msg, 300)); }
}
