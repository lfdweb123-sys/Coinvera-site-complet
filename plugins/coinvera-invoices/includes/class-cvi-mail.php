<?php
if (!defined('ABSPATH')) exit;

/** E-mails (texte brut) et relances. Les variables sont remplacées en une seule passe (strtr) par des valeurs déjà nettoyées. */
final class CVI_Mail {
  public static function init() { add_action('cvi_reminders', [__CLASS__, 'run_reminders']); }

  public static function vars($r) {
    return ['{number}' => CVI_Util::one_line($r->number, 40), '{total}' => CVI_Util::money($r->total_cents), '{link}' => CVI_Util::public_url($r->token),
      '{customer}' => CVI_Util::one_line($r->customer_name, 120), '{company}' => CVI_Settings::company_name(), '{due}' => CVI_Util::fmt_date($r->due_date)];
  }
  private static function headers() {
    $e = sanitize_email((string) CVI_Settings::get('company_email'));
    return is_email($e) ? ['Reply-To: ' . $e] : [];
  }
  private static function send($to, $subject_tpl, $body_tpl, $r) {
    if (!is_email($to)) return false;
    $v = self::vars($r);
    return wp_mail($to, CVI_Util::one_line(strtr((string) $subject_tpl, $v), 150), strtr((string) $body_tpl, $v), self::headers());
  }

  public static function invoice($r)  { return self::send($r->customer_email, CVI_Settings::get('tpl_invoice_subject'),  CVI_Settings::get('tpl_invoice_body'),  $r); }
  public static function reminder($r) { return self::send($r->customer_email, CVI_Settings::get('tpl_reminder_subject'), CVI_Settings::get('tpl_reminder_body'), $r); }
  public static function receipt($r)  { return self::send($r->customer_email, CVI_Settings::get('tpl_receipt_subject'),  CVI_Settings::get('tpl_receipt_body'),  $r); }

  private static function admin_to() {
    $to = sanitize_email((string) CVI_Settings::get('notify_email'));
    return is_email($to) ? $to : get_option('admin_email');
  }
  public static function admin_paid($r) {
    if (!CVI_Settings::get('notify_admin')) return;
    wp_mail(self::admin_to(), CVI_Util::one_line('[' . CVI_Settings::company_name() . '] Facture ' . $r->number . ' payée'),
      sprintf("La facture %s (%s) a été payée par carte par %s.\n\nVoir : %s", $r->number, CVI_Util::money($r->total_cents), CVI_Util::one_line($r->customer_name, 120), admin_url('admin.php?page=cvi-edit&id=' . (int) $r->id)));
  }
  /** Paiement reçu mais à vérifier à la main : toujours notifié, même si les notifications sont coupées. */
  public static function admin_review($r) {
    wp_mail(self::admin_to(), CVI_Util::one_line('[' . CVI_Settings::company_name() . '] Paiement à vérifier : facture ' . $r->number),
      sprintf("Un paiement a été reçu pour la facture %s mais ne peut pas être validé automatiquement (facture annulée ou déjà payée, ou montant/référence différents).\n\nVérifiez-le dans votre tableau de bord Coinvera, puis dans : %s", $r->number, admin_url('admin.php?page=cvi-edit&id=' . (int) $r->id)));
  }

  // ---------- Relances (cron quotidien) ----------
  /** Nombre de paliers atteints : paliers [3,7,14] et 8 jours de retard -> 2. */
  public static function steps_reached(array $steps, $days_late) {
    $n = 0; foreach ($steps as $s) if ($days_late >= $s) $n++;
    return $n;
  }
  public static function run_reminders() {
    if (!CVI_Settings::get('reminders_on') || !CVI_Settings::configured() || !CVI_API::licensed()) return;
    $steps = CVI_Util::parse_days(CVI_Settings::get('reminder_days')); if (!$steps) return;
    $today = CVI_Util::today();
    foreach (CVI_DB::overdue_for_reminders($today) as $r) {
      $reached = self::steps_reached($steps, CVI_Util::days_between($r->due_date, $today));
      // Une seule relance par exécution et par facture, au palier le plus élevé atteint (pas de rattrapage en rafale).
      if ($reached > (int) $r->reminders_sent && CVI_DB::claim_reminder($r->id, $r->reminders_sent, $reached)) self::reminder($r);
    }
  }
}
