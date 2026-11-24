<?php
if (!defined('ABSPATH')) exit;

final class CVX_Util {
  public static function one_line($s, $max = 300) { return mb_substr(trim(preg_replace('/[\r\n\t]+/', ' ', wp_strip_all_tags((string) $s))), 0, $max); }

  /** Date de référence pour le délai de retour : date « terminée » si connue (le plus proche d'une livraison), sinon date de paiement, sinon date de création. */
  public static function reference_timestamp(WC_Order $order) {
    $d = $order->get_date_completed() ?: $order->get_date_paid() ?: $order->get_date_created();
    return $d ? $d->getTimestamp() : time();
  }
}
