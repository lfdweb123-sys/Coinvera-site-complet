<?php
if (!defined('ABSPATH')) exit;

/** E-mails texte brut. Variables remplacées en une passe (strtr) par des valeurs déjà nettoyées. */
final class CVS_Mail {
  public static function manage_url() {
    $u = (string) CVS_Settings::get('account_url');
    return ($u !== '' && wp_http_validate_url($u)) ? $u : wp_login_url();
  }
  public static function pay_url($charge) { return $charge ? add_query_arg('cvs_pay', $charge->token, home_url('/')) : ''; }

  public static function send($key, $sub, $plan, $charge = null) {
    if (!$sub || !is_email($sub->email) || !isset(CVS_Settings::TEMPLATES[$key])) return false;
    $v = ['{site}' => CVS_Util::one_line(get_bloginfo('name'), 100), '{name}' => CVS_Util::one_line($sub->name, 120) ?: 'Bonjour', '{plan}' => $plan ? $plan['title'] : '',
      '{amount}' => CVS_Util::money($charge ? $charge->amount_cents : ($plan ? $plan['price'] : 0)), '{due_date}' => $charge ? CVS_Util::date($charge->due_at) : '', '{period_end}' => CVS_Util::date($sub->period_end),
      '{pay_url}' => self::pay_url($charge), '{manage_url}' => self::manage_url()];
    return wp_mail($sub->email, CVS_Util::one_line(strtr((string) CVS_Settings::get("mail_{$key}_subject"), $v), 150), strtr((string) CVS_Settings::get("mail_{$key}_body"), $v));
  }
  private static function admin_to() { return get_option('admin_email'); }
  public static function admin_review($charge) {
    wp_mail(self::admin_to(), CVS_Util::one_line('[' . get_bloginfo('name') . '] Paiement d’abonnement à vérifier (échéance #' . (int) $charge->id . ')'),
      sprintf("Un paiement a été reçu pour l’échéance #%d mais ne peut pas être validé automatiquement (échéance annulée ou déjà payée, ou montant/référence différents).\n\nVérifiez-le dans votre tableau de bord Coinvera : %s", (int) $charge->id, admin_url('admin.php?page=cvs-charges')));
  }
}
