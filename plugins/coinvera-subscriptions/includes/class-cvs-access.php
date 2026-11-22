<?php
if (!defined('ABSPATH')) exit;

/** Droits d'accès, création de compte et libellés. */
final class CVS_Access {
  const LABELS = ['pending' => 'En attente de paiement', 'active' => 'Actif', 'past_due' => 'En retard (délai de grâce)', 'expired' => 'Expiré', 'cancelled' => 'Annulé (accès jusqu’à la fin de période)'];
  public static function label($s) { return self::LABELS[$s] ?? $s; }

  /** Vrai si l'abonnement donne accès maintenant : actif ou en retard dans le délai de grâce du plan ; annulé jusqu'à la fin de période payée. */
  public static function sub_grants($sub, $now = null) {
    $now = $now ?? time(); if (!$sub->period_end) return false;
    $end = strtotime($sub->period_end . ' UTC'); if ($end === false) return false;
    if ($sub->status === 'cancelled') return $now <= $end;
    if (!in_array($sub->status, ['active', 'past_due'], true)) return false;
    $plan = CVS_Plans::get($sub->plan_id);
    return $now <= $end + ($plan ? $plan['grace'] : 0) * DAY_IN_SECONDS;
  }
  public static function has($user_id, $plan_ids = []) {
    $user_id = (int) $user_id; $plan_ids = array_map('intval', (array) $plan_ids); $ok = false;
    if ($user_id > 0) foreach (CVS_DB::subs_of_user($user_id) as $s) {
      if ($plan_ids && !in_array((int) $s->plan_id, $plan_ids, true)) continue;
      if (self::sub_grants($s)) { $ok = true; break; }
    }
    return (bool) apply_filters('cvs_user_has_access', $ok, $user_id, $plan_ids);
  }

  /**
   * Compte WordPress du membre, créé SEULEMENT après un paiement réel confirmé (pas de comptes fantômes).
   * Un utilisateur existant (même e-mail) est réutilisé sans que son rôle soit modifié : aucune élévation de privilège possible.
   */
  public static function ensure_user($sub) {
    if (!$sub || !is_email($sub->email)) return 0;
    if ((int) $sub->user_id > 0 && get_userdata((int) $sub->user_id)) return (int) $sub->user_id;
    $u = get_user_by('email', $sub->email);
    if ($u) { CVS_DB::set_user($sub->id, $u->ID); return (int) $u->ID; }
    $base = sanitize_user(strstr($sub->email, '@', true), true); if ($base === '' || strlen($base) < 3) $base = 'membre';
    $login = $base; for ($i = 0; username_exists($login) && $i < 20; $i++) $login = $base . random_int(100, 99999);
    if (username_exists($login)) return 0;
    $id = wp_insert_user(['user_login' => $login, 'user_email' => $sub->email, 'user_pass' => wp_generate_password(32, true, true), 'role' => 'subscriber', 'display_name' => $sub->name !== '' ? $sub->name : $login]);
    if (is_wp_error($id)) return 0;
    CVS_DB::set_user($sub->id, (int) $id);
    wp_new_user_notification((int) $id, null, 'user');   // e-mail de définition du mot de passe
    return (int) $id;
  }
}
