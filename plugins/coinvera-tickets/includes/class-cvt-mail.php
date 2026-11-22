<?php
if (!defined('ABSPATH')) exit;

/** E-mails texte brut. Variables remplacées en une passe (strtr) par des valeurs déjà nettoyées. */
final class CVT_Mail {
  public static function tickets_url($order) { return add_query_arg('cvt_ticket', $order->token, home_url('/')); }

  public static function tickets($order) {
    if (!$order || !is_email($order->buyer_email)) return false;
    $ev = CVT_Events::get($order->event_id); $n = count(CVT_DB::tickets_of($order->id));
    $v = ['{site}' => CVT_Util::one_line(get_bloginfo('name'), 100), '{name}' => CVT_Util::one_line($order->buyer_name, 120) ?: 'Bonjour', '{event}' => $ev ? $ev['title'] : 'votre événement',
      '{date}' => $ev ? CVT_Util::one_line($ev['starts_local'], 20) : '', '{venue}' => $ev ? $ev['venue'] : '', '{count}' => (string) $n, '{total}' => CVT_Util::money($order->total_cents), '{tickets_url}' => self::tickets_url($order)];
    return wp_mail($order->buyer_email, CVT_Util::one_line(strtr((string) CVT_Settings::get('mail_tickets_subject'), $v), 150), strtr((string) CVT_Settings::get('mail_tickets_body'), $v));
  }
  private static function admin_to() { $to = sanitize_email((string) CVT_Settings::get('notify_email')); return is_email($to) ? $to : get_option('admin_email'); }
  public static function admin_paid($order) {
    if (!CVT_Settings::get('notify_admin')) return; $ev = CVT_Events::get($order->event_id);
    wp_mail(self::admin_to(), CVT_Util::one_line('[' . get_bloginfo('name') . '] Nouvelle commande de billets (' . ($ev ? $ev['title'] : '#' . $order->event_id) . ')'),
      sprintf("Commande #%d payée : %s, %s.\n\nVoir : %s", (int) $order->id, CVT_Util::money($order->total_cents), CVT_Util::one_line($order->buyer_name, 120), admin_url('admin.php?page=cvt-orders')));
  }
  /** Toujours notifié : paiement reçu mais plus de place (ou montant/référence incohérents) → à rembourser à la main. */
  public static function admin_review($order) {
    wp_mail(self::admin_to(), CVT_Util::one_line('[' . get_bloginfo('name') . '] Paiement de billets à vérifier (commande #' . (int) $order->id . ')'),
      sprintf("Un paiement a été reçu pour la commande #%d mais elle ne peut pas être validée automatiquement (plus de place disponible, commande annulée, ou montant/référence différents).\n\nVérifiez-la et remboursez si nécessaire (tableau de bord Coinvera) : %s", (int) $order->id, admin_url('admin.php?page=cvt-orders')));
  }
}
