<?php
if (!defined('ABSPATH')) exit;

/** Création (ou réutilisation) du paiement Coinvera d'une échéance. */
final class CVS_Pay {
  public static function ok_url($u) { return is_string($u) && strpos($u, 'https://') === 0 && wp_http_validate_url($u); }

  /** Retourne ['url' => …] ou ['err' => code]. */
  public static function start($charge, $sub, $plan) {
    if (!$charge || $charge->status !== 'pending' || !$sub || $sub->status === 'cancelled' && $charge->kind !== 'renewal') return ['err' => 'off'];
    if (!CVS_Settings::configured() || !CVS_API::licensed() || (int) $charge->amount_cents < 100 || (int) $charge->amount_cents > CVS_Util::MAX_CENTS) return ['err' => 'off'];
    // Paiement déjà créé il y a moins de 2 h : on y renvoie le client plutôt que d'en créer un second.
    if ($charge->pay_state === 'pending' && self::ok_url($charge->checkout_url) && strtotime($charge->updated_at . ' UTC') > time() - 2 * HOUR_IN_SECONDS) return ['url' => $charge->checkout_url];
    $title = CVS_Util::one_line(($plan ? $plan['title'] : 'Abonnement') . ' — ' . get_bloginfo('name'), 110);
    $res = CVS_API::create_payment((int) $charge->amount_cents, $title, (string) $sub->email, 'cvs:' . (int) $charge->id, 'cvs-' . (int) $charge->id . '-' . (int) $charge->amount_cents . '-' . (int) floor(time() / 600));
    $d = is_wp_error($res) ? null : $res['data']; $url = is_array($d) ? (string) ($d['checkoutUrl'] ?? '') : '';
    if (is_wp_error($res) || !in_array($res['code'], [200, 201], true) || empty($d['id']) || !self::ok_url($url)) {
      CVS_Util::log('échéance ' . (int) $charge->id . ' : création du paiement impossible' . (is_wp_error($res) ? '' : ' (HTTP ' . $res['code'] . ')'));
      return ['err' => 'pay'];
    }
    CVS_DB::attach_payment($charge->id, sanitize_text_field((string) $d['id']), $url, sanitize_key((string) ($d['mode'] ?? '')));
    return ['url' => $url];
  }
}
