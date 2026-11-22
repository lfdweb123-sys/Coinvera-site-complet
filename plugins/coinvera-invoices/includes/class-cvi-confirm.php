<?php
if (!defined('ABSPATH')) exit;

/**
 * Confirmation des paiements. Une facture n'est JAMAIS marquée payée sur un retour du navigateur ni sur le contenu brut d'un webhook :
 * on relit toujours le paiement auprès de l'API Coinvera (statut, mode réel, montant, référence) avant de le valider.
 */
final class CVI_Confirm {
  public static function init() {
    add_action('cvi_check_payments', [__CLASS__, 'cron']);
    add_action('rest_api_init', [__CLASS__, 'routes']);
    add_action('admin_init', function () { if (!wp_next_scheduled('cvi_check_payments')) wp_schedule_event(time() + 60, 'cvi_5min', 'cvi_check_payments'); });
  }

  public static function cron() {
    if (!CVI_Settings::configured()) return;
    foreach (CVI_DB::pending_to_check() as $row) self::check($row);
  }

  /** Relit le paiement et met la facture à jour. */
  public static function check($row) {
    if (!$row || $row->status === 'paid' || $row->cv_payment_id === '') return;
    $res = CVI_API::get_payment($row->cv_payment_id);
    if (is_wp_error($res) || $res['code'] !== 200 || !is_array($res['data'])) return;
    $d = $res['data']; $st = (string) ($d['status'] ?? ''); $id = (int) $row->id; $pid = (string) $row->cv_payment_id;

    if ($st === 'confirmed') {
      // La référence et le montant renvoyés par l'API doivent correspondre exactement à cette facture.
      $ref_ok = (string) ($d['orderRef'] ?? '') === 'cvi:' . $id;
      $amount_ok = isset($d['amount']) && (int) round(((float) $d['amount']) * 100) === (int) $row->total_cents;
      if (!$ref_ok || !$amount_ok) { if (CVI_DB::flag_review($id)) CVI_Mail::admin_review($row); CVI_Util::log("facture $id : référence ou montant incohérent"); return; }
      if (($d['mode'] ?? '') !== 'live') { CVI_DB::settle_payment($id, $pid, 'test'); return; }   // paiement de test : la facture reste impayée
      if (CVI_DB::mark_paid($id, 'card')) {
        $r = CVI_DB::get($id); do_action('cvi_invoice_paid', $id);
        if ($r) { CVI_Mail::receipt($r); CVI_Mail::admin_paid($r); }
      } elseif (CVI_DB::flag_review($id)) CVI_Mail::admin_review($row);   // facture annulée ou déjà payée autrement : à examiner (remboursement éventuel)
      return;
    }
    if ($st === 'failed' || $st === 'expired') CVI_DB::settle_payment($id, $pid, '');
  }

  // --- Webhook signé : sert uniquement de déclencheur, la vérification se refait via l'API ---
  public static function routes() {
    register_rest_route('coinvera-invoices/v1', '/webhook', ['methods' => 'POST', 'permission_callback' => '__return_true', 'callback' => [__CLASS__, 'webhook']]);
  }
  public static function webhook(WP_REST_Request $req) {
    $raw = $req->get_body(); $sig = (string) $req->get_header('x-coinvera-signature'); $secret = CVI_Settings::webhook_secret();
    if ($secret === '' || $sig === '' || strlen($raw) > 65536 || !hash_equals(hash_hmac('sha256', $raw, $secret), $sig)) return new WP_REST_Response(['error' => 'invalid_signature'], 401);
    $e = json_decode($raw, true);
    $ref = is_array($e) ? (string) ($e['data']['orderRef'] ?? '') : '';
    if (($e['type'] ?? '') === 'payment.confirmed' && preg_match('/^cvi:(\d{1,18})$/', $ref, $m)) self::check(CVI_DB::get((int) $m[1]));
    return new WP_REST_Response(['ok' => true], 200);   // les références des autres plugins sont ignorées sans erreur
  }
}
