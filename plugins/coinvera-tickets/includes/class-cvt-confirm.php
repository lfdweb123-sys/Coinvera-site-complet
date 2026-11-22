<?php
if (!defined('ABSPATH')) exit;

/**
 * Confirmation des paiements. Une commande n'est JAMAIS validée sur un retour du navigateur ni sur le contenu brut d'un webhook :
 * le paiement est toujours relu auprès de l'API Coinvera (statut, mode réel, montant, référence). Les places sont ensuite vérifiées sous verrou.
 */
final class CVT_Confirm {
  public static function init() {
    add_action('cvt_cycle', [__CLASS__, 'cron']);
    add_action('rest_api_init', [__CLASS__, 'routes']);
    add_action('admin_init', function () { if (!wp_next_scheduled('cvt_cycle')) wp_schedule_event(time() + 60, 'cvt_5min', 'cvt_cycle'); });
  }
  /** Cron 5 min : d'abord les paiements en cours (une réservation expirée peut encore être honorée), puis l'expiration des réservations. */
  public static function cron() {
    if (CVT_Settings::configured()) foreach (CVT_DB::pending_to_check() as $o) self::check($o);
    CVT_DB::expire_due();
  }

  public static function check($order) {
    if (!$order || $order->cv_payment_id === '' || in_array($order->status, ['paid'], true)) return;
    $res = CVT_API::get_payment($order->cv_payment_id);
    if (is_wp_error($res) || $res['code'] !== 200 || !is_array($res['data'])) return;
    $d = $res['data']; $st = (string) ($d['status'] ?? ''); $oid = (int) $order->id; $pid = (string) $order->cv_payment_id;
    if ($st === 'confirmed') {
      $ref_ok = (string) ($d['orderRef'] ?? '') === 'cvt:' . $oid;
      $amount_ok = isset($d['amount']) && (int) round(((float) $d['amount']) * 100) === (int) $order->total_cents;
      if (!$ref_ok || !$amount_ok) { if (CVT_DB::flag_review($oid)) CVT_Mail::admin_review($order); CVT_Util::log("commande $oid : référence ou montant incohérent"); return; }
      if (($d['mode'] ?? '') !== 'live') { CVT_DB::settle_payment($oid, $pid, 'test'); return; }   // paiement de test : aucun billet validé
      $r = CVT_DB::confirm_order($order, CVT_Events::get($order->event_id));
      if ($r === 'paid') { $o = CVT_DB::order($oid); CVT_Mail::tickets($o); CVT_Mail::admin_paid($o); do_action('cvt_order_paid', $oid); }
      elseif ($r === 'review') { if (CVT_DB::flag_review($oid)) CVT_Mail::admin_review($order); }
      return;   // 'already' / 'retry' : rien à faire
    }
    if ($st === 'failed' || $st === 'expired') CVT_DB::settle_payment($oid, $pid, '');
  }

  public static function routes() { register_rest_route('coinvera-tickets/v1', '/webhook', ['methods' => 'POST', 'permission_callback' => '__return_true', 'callback' => [__CLASS__, 'webhook']]); }
  public static function webhook(WP_REST_Request $req) {
    $raw = $req->get_body(); $sig = (string) $req->get_header('x-coinvera-signature'); $secret = CVT_Settings::webhook_secret();
    if ($secret === '' || $sig === '' || strlen($raw) > 65536 || !hash_equals(hash_hmac('sha256', $raw, $secret), $sig)) return new WP_REST_Response(['error' => 'invalid_signature'], 401);
    $e = json_decode($raw, true); $ref = is_array($e) ? (string) ($e['data']['orderRef'] ?? '') : '';
    if (($e['type'] ?? '') === 'payment.confirmed' && preg_match('/^cvt:(\d{1,18})$/', $ref, $m)) self::check(CVT_DB::order((int) $m[1]));
    return new WP_REST_Response(['ok' => true], 200);   // les références des autres plugins sont ignorées sans erreur
  }
}
