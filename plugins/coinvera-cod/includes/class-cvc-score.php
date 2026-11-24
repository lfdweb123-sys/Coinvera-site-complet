<?php
if (!defined('ABSPATH')) exit;

/**
 * Score de fiabilité (0-100) d'un client, calculé localement à partir de l'historique de CETTE boutique.
 *   score = 100 × (d + 2) / (d + 2 + 3r + u + 1)
 * d = commandes livrées et payées, r = colis refusés (marqués par le marchand), u = commandes non confirmées
 * (refusées par le client ou restées sans réponse). Un nouveau client vaut ~67 : on ne pénalise jamais un inconnu.
 * Un seul colis refusé sans historique positif (~33) passe sous le seuil par défaut (40) ; trois livraisons réussies
 * le remettent au-dessus.
 * Les clients sont reconnus par un hachage du numéro (8 derniers chiffres) et de l'e-mail, jamais en clair.
 */
final class CVC_Score {
  public static function compute($d, $r, $u) { return (int) round(100 * ($d + 2) / ($d + 2 + 3 * $r + $u + 1)); }

  private static function salt() { return wp_salt('auth') . 'cvc-score'; }
  public static function phone_ident($phone) {
    $d = preg_replace('/\D/', '', (string) $phone); if (strlen($d) < 6) return '';
    return hash_hmac('sha256', 'p:' . substr($d, -8), self::salt());
  }
  public static function email_ident($email) {
    $e = strtolower(trim((string) $email)); if ($e === '' || strpos($e, '@') === false) return '';
    return hash_hmac('sha256', 'e:' . $e, self::salt());
  }
  public static function idents($phone, $email) { return array_values(array_filter([self::phone_ident($phone), self::email_ident($email)])); }

  /** Score le plus bas parmi les identifiants ayant un historique ; null si le client est inconnu. */
  public static function for_customer($phone, $email) {
    $min = null;
    foreach (self::idents($phone, $email) as $id) {
      $c = CVC_DB::counts($id); if (!$c) continue;
      $s = self::compute((int) $c->delivered, (int) $c->refused, (int) $c->unconfirmed);
      if ($min === null || $s < $min) $min = $s;
    }
    return $min;
  }
  public static function record($phone, $email, $col) { foreach (self::idents($phone, $email) as $id) CVC_DB::bump($id, $col); }
  public static function allowed($phone, $email) {
    if (!CVC_Settings::score_enabled()) return true;
    $s = self::for_customer($phone, $email);
    return $s === null || $s >= CVC_Settings::min_score();
  }
}
