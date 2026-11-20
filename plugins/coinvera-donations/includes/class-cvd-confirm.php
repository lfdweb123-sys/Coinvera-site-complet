<?php
if (!defined('ABSPATH')) exit;

/**
 * Confirmation des dons. Un don n'est JAMAIS compté sur un simple retour du navigateur ni sur le contenu brut d'un webhook :
 * on relit toujours le paiement auprès de l'API Coinvera (statut, mode, montant, référence) avant de le valider.
 */
final class CVD_Confirm {
  public static function init() {
    add_action('cvd_check_donations', [__CLASS__, 'cron']);
    add_action('rest_api_init', [__CLASS__, 'routes']);
    add_action('admin_init', function () { if (!wp_next_scheduled('cvd_check_donations')) wp_schedule_event(time() + 60, 'cvd_5min', 'cvd_check_donations'); });
  }

  public static function cron() {
    if (!CVD_Settings::configured()) return;
    CVD_DB::expire_stale();
    foreach (CVD_DB::pending_to_check() as $row) self::check($row);
  }

  /** Relit le paiement et met le don à jour. Retourne le statut final du don. */
  public static function check($row) {
    if (!$row || $row->status !== 'pending' || $row->cv_payment_id === '') return $row ? $row->status : '';
    $res = CVD_API::get_payment($row->cv_payment_id);
    if (is_wp_error($res) || $res['code'] !== 200 || !is_array($res['data'])) return 'pending';
    $d = $res['data']; $st = (string) ($d['status'] ?? ''); $id = (int) $row->id;

    if ($st === 'confirmed') {
      // La référence et le montant renvoyés par l'API doivent correspondre exactement à notre don.
      $ref_ok = (string) ($d['orderRef'] ?? '') === 'cvd:' . $id;
      $amount_ok = isset($d['amount']) && (int) round(((float) $d['amount']) * 100) === (int) $row->amount_cents;
      if (!$ref_ok || !$amount_ok) { CVD_DB::transition($id, 'review'); CVD_Util::log("don $id : référence ou montant incohérent"); return 'review'; }
      if (($d['mode'] ?? '') !== 'live') { CVD_DB::transition($id, 'test'); return 'test'; }   // paiement de test : jamais compté
      if (CVD_DB::transition($id, 'confirmed', true)) { do_action('cvd_donation_confirmed', $id); self::notify($id); }
      return 'confirmed';
    }
    if ($st === 'failed' || $st === 'expired') { CVD_DB::transition($id, $st); return $st; }
    return 'pending';
  }

  // --- Webhook signé (optionnel) : sert uniquement de déclencheur, la vérification se refait via l'API ---
  public static function routes() {
    register_rest_route('coinvera-donations/v1', '/webhook', ['methods' => 'POST', 'permission_callback' => '__return_true', 'callback' => [__CLASS__, 'webhook']]);
  }
  public static function webhook(WP_REST_Request $req) {
    $raw = $req->get_body(); $sig = (string) $req->get_header('x-coinvera-signature'); $secret = CVD_Settings::webhook_secret();
    if ($secret === '' || $sig === '' || strlen($raw) > 65536 || !hash_equals(hash_hmac('sha256', $raw, $secret), $sig)) return new WP_REST_Response(['error' => 'invalid_signature'], 401);
    $e = json_decode($raw, true);
    $ref = is_array($e) ? (string) ($e['data']['orderRef'] ?? '') : '';
    if (($e['type'] ?? '') === 'payment.confirmed' && preg_match('/^cvd:(\d{1,18})$/', $ref, $m)) self::check(CVD_DB::get((int) $m[1]));
    return new WP_REST_Response(['ok' => true], 200);   // les références d'autres plugins sont ignorées sans erreur
  }

  // --- E-mails ---
  private static function notify($id) {
    $r = CVD_DB::get($id); if (!$r) return;
    $site = CVD_Util::one_line(get_bloginfo('name'), 80);
    $camp = $r->campaign_id ? CVD_Campaigns::get($r->campaign_id) : null; $label = $camp ? $camp['title'] : 'don libre';
    if (CVD_Settings::get('notify_admin')) {
      $to = sanitize_email((string) CVD_Settings::get('notify_email')); if (!is_email($to)) $to = get_option('admin_email');
      $body = sprintf("Nouveau don confirmé : %s\nCagnotte : %s\nDonateur : %s%s\nMessage : %s\n\nVoir les dons : %s", CVD_Util::money($r->amount_cents), $label,
        $r->donor_name !== '' ? $r->donor_name : '(non renseigné)', $r->anonymous ? ' (anonyme sur le site)' : '', $r->message !== '' ? $r->message : '—', admin_url('admin.php?page=cvd-donations'));
      wp_mail($to, CVD_Util::one_line("[$site] Nouveau don de " . CVD_Util::money($r->amount_cents)), $body);
    }
    if (CVD_Settings::get('receipt_donor') && is_email($r->donor_email))
      wp_mail($r->donor_email, CVD_Util::one_line("Merci pour votre don — $site"), sprintf("Bonjour%s,\n\nNous avons bien reçu votre don de %s (%s). Merci pour votre générosité !\n\n%s", $r->donor_name !== '' ? ' ' . CVD_Util::one_line($r->donor_name, 80) : '', CVD_Util::money($r->amount_cents), $label, $site));
  }
}
