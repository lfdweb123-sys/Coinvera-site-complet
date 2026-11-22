<?php
if (!defined('ABSPATH')) exit;

/** Décide si une tentative de commande doit être acceptée, signalée (acceptée mais journalisée) ou bloquée.
 *  Les règles s'évaluent dans l'ordre et s'arrêtent à la première conclusion : liste blanche > liste noire >
 *  vélocité (commandes, puis échecs de paiement récents) > e-mail jetable > signal externe (filtre). */
final class CVG_Rules {
  public static function evaluate($context, $ip, $email) {
    if (!CVG_Settings::enabled()) return ['action' => 'allow', 'reason' => ''];
    $email = sanitize_email((string) $email);

    if (CVG_Util::ip_in_list($ip, CVG_Settings::get('whitelist_ips'))) return ['action' => 'allow', 'reason' => ''];
    if ($email !== '' && CVG_Util::email_in_list($email, CVG_Settings::get('whitelist_emails'))) return ['action' => 'allow', 'reason' => ''];

    if (CVG_Util::ip_in_list($ip, CVG_Settings::get('blocklist_ips'))) return self::block($ip, 'ip_blocklisted');
    if ($email !== '' && CVG_Util::email_in_list($email, CVG_Settings::get('blocklist_emails'))) return self::block($ip, 'email_blocklisted');

    // Une fois bloquée, une IP le reste pour toute la durée de refroidissement, sans ré-évaluer les règles à chaque tentative.
    if (get_transient('cvg_cd:' . $ip)) return ['action' => 'block', 'reason' => 'cooldown'];

    // Vélocité : trop de nouvelles commandes depuis cette IP en peu de temps (signe de card testing en cours).
    if (!CVG_Util::hit('cvg_ord:' . $ip, CVG_Settings::order_limit(), CVG_Settings::order_window())) return self::block($ip, 'velocity_orders');

    // Vélocité : trop de paiements déjà échoués depuis cette IP (compteur alimenté par CVG_Rules::record_failure).
    if (CVG_Util::count('cvg_fail:' . $ip) >= CVG_Settings::fail_limit()) return self::block($ip, 'velocity_fail');

    $domain = CVG_Util::domain_of($email);
    if ($domain !== '' && CVG_Util::is_disposable($domain)) {
      $a = CVG_Settings::disposable_action();
      if ($a === 'block') return ['action' => 'block', 'reason' => 'disposable_email'];   // pas de refroidissement : un visiteur peut revenir avec un e-mail valide
      if ($a === 'log') return ['action' => 'flag', 'reason' => 'disposable_email'];
    }

    // Point d'extension : un site peut brancher ici son propre service de réputation IP (VPN/proxy/datacenter).
    // apply_filters('cvg_ip_is_risky', false, $ip, $email) -> true si l'IP est jugée à risque.
    if (apply_filters('cvg_ip_is_risky', false, $ip, $email)) {
      $a = CVG_Settings::risky_action();
      if ($a === 'block') return ['action' => 'block', 'reason' => 'risky_ip'];
      if ($a === 'log') return ['action' => 'flag', 'reason' => 'risky_ip'];
    }

    return ['action' => 'allow', 'reason' => ''];
  }

  /** Bloque et pose un refroidissement sur l'IP (la tentative suivante sera rejetée immédiatement, sans recalcul). */
  private static function block($ip, $reason) {
    set_transient('cvg_cd:' . $ip, 1, CVG_Settings::cooldown());
    return ['action' => 'block', 'reason' => $reason];
  }

  /** Paiement échoué sur cette IP : alimente la fenêtre de vélocité « échecs », qui durcit les tentatives suivantes. */
  public static function record_failure($ip) {
    if (!filter_var($ip, FILTER_VALIDATE_IP)) return;
    CVG_Util::hit('cvg_fail:' . $ip, PHP_INT_MAX, CVG_Settings::fail_window());   // incrémente sans jamais "échouer" lui-même
  }
  /** Paiement confirmé sur cette IP : on arrête de pénaliser un client qui a fini par payer normalement. */
  public static function clear_failures($ip) { CVG_Util::reset('cvg_fail:' . $ip); }
}
