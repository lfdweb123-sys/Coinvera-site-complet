<?php
if (!defined('ABSPATH')) exit;

/**
 * Confirmation des paiements. Une échéance n'est JAMAIS validée sur un retour du navigateur ni sur le contenu brut d'un webhook :
 * le paiement est toujours relu auprès de l'API Coinvera (statut, mode réel, montant, référence) avant de prolonger un abonnement.
 */
final class CVS_Confirm {
  public static function init() {
    add_action('cvs_check_payments', [__CLASS__, 'cron']);
    add_action('rest_api_init', [__CLASS__, 'routes']);
    add_action('admin_init', function () { if (!wp_next_scheduled('cvs_check_payments')) wp_schedule_event(time() + 60, 'cvs_5min', 'cvs_check_payments'); });
  }
  public static function cron() { if (!CVS_Settings::configured()) return; foreach (CVS_DB::pending_to_check() as $c) self::check($c); }

  public static function check($charge) {
    if (!$charge || $charge->cv_payment_id === '' || $charge->status === 'paid') return;
    $res = CVS_API::get_payment($charge->cv_payment_id);
    if (is_wp_error($res) || $res['code'] !== 200 || !is_array($res['data'])) return;
    $d = $res['data']; $st = (string) ($d['status'] ?? ''); $cid = (int) $charge->id; $pid = (string) $charge->cv_payment_id;

    if ($st === 'confirmed') {
      $ref_ok = (string) ($d['orderRef'] ?? '') === 'cvs:' . $cid;
      $amount_ok = isset($d['amount']) && (int) round(((float) $d['amount']) * 100) === (int) $charge->amount_cents;
      if (!$ref_ok || !$amount_ok) { if (CVS_DB::flag_review($cid)) CVS_Mail::admin_review($charge); CVS_Util::log("échéance $cid : référence ou montant incohérent"); return; }
      if (($d['mode'] ?? '') !== 'live') { CVS_DB::settle_payment($cid, $pid, 'test'); return; }   // paiement de test : aucun effet sur l'abonnement
      if ($charge->status !== 'pending') { if (CVS_DB::flag_review($cid)) CVS_Mail::admin_review($charge); return; }   // échéance annulée entre-temps : à examiner (remboursement éventuel)
      self::apply($charge);
      return;
    }
    if ($st === 'failed' || $st === 'expired') CVS_DB::settle_payment($cid, $pid, '');
  }

  /** Effets d'un paiement validé : prolongation, compte, reçu. Ne s'exécute qu'une fois (transition atomique dans CVS_DB::apply_paid). */
  private static function apply($charge) {
    $sub = CVS_DB::sub($charge->sub_id); if (!$sub) return;
    $plan = CVS_Plans::get($sub->plan_id);
    if ($charge->kind === 'first') {   // même e-mail déjà abonné à ce plan : on prolonge l'abonnement existant au lieu de créer un doublon
      $open = CVS_DB::open_sub($sub->email, $sub->plan_id, $sub->id);
      if ($open && CVS_DB::move_charge($charge->id, $open->id)) { CVS_DB::delete_pending_sub($sub->id); $charge->sub_id = $open->id; $sub = $open; }
    }
    $end = CVS_DB::apply_paid($charge, $plan ? $plan['unit'] : 'month', CVS_Util::now());
    if ($end === null) { $fresh = CVS_DB::charge($charge->id); if ($fresh && $fresh->status !== 'paid' && CVS_DB::flag_review($charge->id)) CVS_Mail::admin_review($charge); return; }
    $sub = CVS_DB::sub($sub->id); CVS_Access::ensure_user($sub); $sub = CVS_DB::sub($sub->id);
    CVS_Mail::send('receipt', $sub, $plan, CVS_DB::charge($charge->id));
    do_action('cvs_subscription_paid', (int) $sub->id, (int) $charge->id);
  }

  public static function routes() { register_rest_route('coinvera-subscriptions/v1', '/webhook', ['methods' => 'POST', 'permission_callback' => '__return_true', 'callback' => [__CLASS__, 'webhook']]); }
  public static function webhook(WP_REST_Request $req) {
    $raw = $req->get_body(); $sig = (string) $req->get_header('x-coinvera-signature'); $secret = CVS_Settings::webhook_secret();
    if ($secret === '' || $sig === '' || strlen($raw) > 65536 || !hash_equals(hash_hmac('sha256', $raw, $secret), $sig)) return new WP_REST_Response(['error' => 'invalid_signature'], 401);
    $e = json_decode($raw, true); $ref = is_array($e) ? (string) ($e['data']['orderRef'] ?? '') : '';
    if (($e['type'] ?? '') === 'payment.confirmed' && preg_match('/^cvs:(\d{1,18})$/', $ref, $m)) self::check(CVS_DB::charge((int) $m[1]));
    return new WP_REST_Response(['ok' => true], 200);   // les références des autres plugins sont ignorées sans erreur
  }
}
