<?php
if (!defined('ABSPATH')) exit;

/** Tables des abonnements et des échéances. Toutes les transitions sont des UPDATE conditionnels : les effets (e-mails, accès) ne partent que si 1 ligne a changé. */
final class CVS_DB {
  const VER = '1';
  public static function subs() { global $wpdb; return $wpdb->prefix . 'cvs_subs'; }
  public static function charges() { global $wpdb; return $wpdb->prefix . 'cvs_charges'; }

  public static function install() {
    global $wpdb; require_once ABSPATH . 'wp-admin/includes/upgrade.php'; $cc = $wpdb->get_charset_collate();
    dbDelta('CREATE TABLE ' . self::subs() . " (
      id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
      plan_id bigint(20) unsigned NOT NULL,
      user_id bigint(20) unsigned DEFAULT NULL,
      email varchar(190) NOT NULL,
      name varchar(120) NOT NULL DEFAULT '',
      status varchar(12) NOT NULL DEFAULT 'pending',
      period_end datetime DEFAULT NULL,
      started_at datetime DEFAULT NULL,
      cancelled_at datetime DEFAULT NULL,
      token char(32) NOT NULL,
      created_at datetime NOT NULL,
      PRIMARY KEY  (id),
      UNIQUE KEY token (token),
      KEY email_plan (email,plan_id),
      KEY status_end (status,period_end),
      KEY user_id (user_id)
    ) $cc;");
    dbDelta('CREATE TABLE ' . self::charges() . " (
      id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
      sub_id bigint(20) unsigned NOT NULL,
      kind varchar(8) NOT NULL DEFAULT 'renewal',
      amount_cents bigint(20) unsigned NOT NULL,
      period_end datetime DEFAULT NULL,
      due_at datetime NOT NULL,
      status varchar(8) NOT NULL DEFAULT 'pending',
      pay_state varchar(8) NOT NULL DEFAULT '',
      cv_payment_id varchar(64) NOT NULL DEFAULT '',
      checkout_url varchar(500) NOT NULL DEFAULT '',
      pay_mode varchar(8) NOT NULL DEFAULT '',
      token char(32) NOT NULL,
      reminders_sent int(10) unsigned NOT NULL DEFAULT 0,
      paid_at datetime DEFAULT NULL,
      created_at datetime NOT NULL,
      updated_at datetime NOT NULL,
      PRIMARY KEY  (id),
      UNIQUE KEY token (token),
      KEY sub_status (sub_id,status),
      KEY pay_check (status,pay_state)
    ) $cc;");
    update_option('cvs_db_version', self::VER, false);
  }
  public static function maybe_upgrade() { if (get_option('cvs_db_version') !== self::VER) self::install(); }

  /** Verrou applicatif (MySQL) : sérialise les opérations sur un même abonnement entre requêtes simultanées. */
  public static function lock($name, $wait = 5) { global $wpdb; return (int) $wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s, %d)', 'cvs_' . $name, (int) $wait)) === 1; }
  public static function unlock($name) { global $wpdb; $wpdb->query($wpdb->prepare('SELECT RELEASE_LOCK(%s)', 'cvs_' . $name)); }

  // ---------- Abonnements ----------
  public static function sub($id) { global $wpdb; return $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . self::subs() . ' WHERE id = %d', (int) $id)); }
  public static function add_sub($plan_id, $email, $name, $status = 'pending', $period_end = null) {
    global $wpdb; $now = CVS_Util::now();
    $ok = $wpdb->insert(self::subs(), ['plan_id' => (int) $plan_id, 'email' => $email, 'name' => $name, 'status' => $status, 'period_end' => $period_end, 'started_at' => $status === 'active' ? $now : null, 'token' => CVS_Util::token(), 'created_at' => $now],
      ['%d', '%s', '%s', '%s', '%s', '%s', '%s', '%s']);
    return $ok ? (int) $wpdb->insert_id : 0;
  }
  /** Abonnement ouvert (actif ou en retard) pour cet e-mail et ce plan. */
  public static function open_sub($email, $plan_id, $except = 0) {
    global $wpdb;
    return $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . self::subs() . " WHERE email = %s AND plan_id = %d AND status IN ('active','past_due') AND id <> %d ORDER BY id ASC LIMIT 1", $email, (int) $plan_id, (int) $except));
  }
  public static function set_user($id, $uid) { global $wpdb; return (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::subs() . ' SET user_id = %d WHERE id = %d', (int) $uid, (int) $id)); }
  public static function delete_pending_sub($id) {
    global $wpdb; $id = (int) $id;
    $wpdb->query($wpdb->prepare('DELETE FROM ' . self::charges() . " WHERE sub_id = %d AND status <> 'paid'", $id));
    return (int) $wpdb->query($wpdb->prepare('DELETE FROM ' . self::subs() . " WHERE id = %d AND status = 'pending'", $id));
  }
  /** Prolonge la fin de période de N jours (administration). */
  public static function extend($id, $days, $now) {
    global $wpdb; $s = self::sub($id); if (!$s || $s->status === 'pending') return 0;
    $base = ($s->period_end && $s->period_end > $now) ? $s->period_end : $now; $end = CVS_Util::add_days($base, (int) $days);
    return (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::subs() . " SET period_end = %s, status = CASE WHEN status IN ('expired','past_due') THEN 'active' ELSE status END WHERE id = %d AND status <> 'pending'", $end, (int) $id));
  }
  public static function cancel($id) {
    global $wpdb; $id = (int) $id;
    $n = (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::subs() . " SET status = 'cancelled', cancelled_at = %s WHERE id = %d AND status IN ('active','past_due','expired')", CVS_Util::now(), $id));
    if ($n) $wpdb->query($wpdb->prepare('UPDATE ' . self::charges() . " SET status = 'void', updated_at = %s WHERE sub_id = %d AND status = 'pending' AND kind = 'renewal' AND pay_state NOT IN ('pending')", CVS_Util::now(), $id));
    return $n;
  }
  public static function reactivate($id, $now) {
    global $wpdb;
    return (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::subs() . " SET status = CASE WHEN period_end IS NOT NULL AND period_end > %s THEN 'active' ELSE 'expired' END, cancelled_at = NULL WHERE id = %d AND status = 'cancelled'", $now, (int) $id));
  }

  // ---------- Échéances ----------
  public static function charge($id) { global $wpdb; return $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . self::charges() . ' WHERE id = %d', (int) $id)); }
  public static function charge_by_token($t) { global $wpdb; return CVS_Util::is_token($t) ? $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . self::charges() . ' WHERE token = %s', $t)) : null; }
  public static function add_charge($sub_id, $kind, $cents, $due_at) {
    global $wpdb; $now = CVS_Util::now();
    $ok = $wpdb->insert(self::charges(), ['sub_id' => (int) $sub_id, 'kind' => $kind === 'first' ? 'first' : 'renewal', 'amount_cents' => (int) $cents, 'due_at' => $due_at, 'token' => CVS_Util::token(), 'created_at' => $now, 'updated_at' => $now], ['%d', '%s', '%d', '%s', '%s', '%s', '%s']);
    return $ok ? (int) $wpdb->insert_id : 0;
  }
  public static function pending_renewal($sub_id) {
    global $wpdb;
    return $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . self::charges() . " WHERE sub_id = %d AND kind = 'renewal' AND status = 'pending' ORDER BY id DESC LIMIT 1", (int) $sub_id));
  }
  /** Crée l'échéance de renouvellement si aucune n'est en attente (verrou : jamais deux). Retourne la ligne (existante ou nouvelle) ou null. */
  public static function ensure_renewal($sub, $cents, $due_at, &$created = false) {
    $created = false; if (!self::lock('sub_' . (int) $sub->id)) return null;
    try {
      $c = self::pending_renewal($sub->id);
      if (!$c) { $id = self::add_charge($sub->id, 'renewal', $cents, $due_at); $c = $id ? self::charge($id) : null; $created = (bool) $c; }
    } finally { self::unlock('sub_' . (int) $sub->id); }
    return $c;
  }
  public static function attach_payment($id, $pid, $url, $mode) {
    global $wpdb;
    return (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::charges() . " SET cv_payment_id = %s, checkout_url = %s, pay_mode = %s, pay_state = 'pending', updated_at = %s WHERE id = %d AND status = 'pending'", $pid, $url, $mode, CVS_Util::now(), (int) $id));
  }
  public static function settle_payment($id, $pid, $to) {
    global $wpdb; $url = $to === '' ? ", checkout_url = ''" : '';
    return (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::charges() . " SET pay_state = %s$url, updated_at = %s WHERE id = %d AND cv_payment_id = %s AND pay_state = 'pending'", $to, CVS_Util::now(), (int) $id, $pid));
  }
  public static function flag_review($id) {
    global $wpdb;
    return (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::charges() . " SET pay_state = 'review', updated_at = %s WHERE id = %d AND pay_state <> 'review'", CVS_Util::now(), (int) $id));
  }
  public static function pending_to_check() {
    global $wpdb;
    return $wpdb->get_results('SELECT * FROM ' . self::charges() . " WHERE pay_state = 'pending' AND cv_payment_id <> '' AND updated_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY) ORDER BY id ASC LIMIT 50");
  }
  public static function claim_reminder($id, $old, $new) {
    global $wpdb;
    return (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::charges() . " SET reminders_sent = %d, updated_at = %s WHERE id = %d AND status = 'pending' AND reminders_sent = %d", (int) $new, CVS_Util::now(), (int) $id, (int) $old));
  }

  /**
   * Règle de paiement confirmé et vérifié. Atomique : l'échéance passe de « pending » à « paid » une seule fois, et seul ce passage prolonge l'abonnement.
   * Retourne la nouvelle fin de période si l'échéance vient d'être validée, ou null (déjà payée, annulée…).
   */
  public static function apply_paid($charge, $plan_unit, $now) {
    global $wpdb; $cid = (int) $charge->id; $sid = (int) $charge->sub_id;
    if (!self::lock('sub_' . $sid)) return null;
    try {
      $sub = self::sub($sid); if (!$sub) return null;
      $won = (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::charges() . " SET status = 'paid', paid_at = %s, pay_state = '', updated_at = %s WHERE id = %d AND status = 'pending'", $now, $now, $cid));
      if (!$won) return null;
      // Payer en avance ne fait perdre aucun jour ; payer après expiration repart de maintenant.
      $base = ($sub->period_end && $sub->period_end > $now) ? $sub->period_end : $now; $end = CVS_Util::add_period($base, $plan_unit);
      $wpdb->query($wpdb->prepare('UPDATE ' . self::subs() . " SET period_end = %s, started_at = COALESCE(started_at, %s), status = CASE WHEN status = 'cancelled' THEN 'cancelled' ELSE 'active' END WHERE id = %d", $end, $now, $sid));
      $wpdb->query($wpdb->prepare('UPDATE ' . self::charges() . ' SET period_end = %s WHERE id = %d', $end, $cid));
      return $end;
    } finally { self::unlock('sub_' . $sid); }
  }
  /** Un « first » payé alors que l'e-mail a déjà un abonnement ouvert : rattache l'échéance à cet abonnement (pas de doublon). */
  public static function move_charge($cid, $to_sub) { global $wpdb; return (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::charges() . ' SET sub_id = %d WHERE id = %d', (int) $to_sub, (int) $cid)); }

  // ---------- Cycle de vie ----------
  public static function renewal_candidates($now, $horizon_days = 31) {
    global $wpdb; $limit = CVS_Util::add_days($now, $horizon_days);
    return $wpdb->get_results($wpdb->prepare('SELECT s.* FROM ' . self::subs() . ' s WHERE s.status IN (\'active\',\'past_due\') AND s.period_end IS NOT NULL AND s.period_end <= %s AND NOT EXISTS (SELECT 1 FROM ' . self::charges() . ' c WHERE c.sub_id = s.id AND c.kind = \'renewal\' AND c.status = \'pending\') ORDER BY s.period_end ASC LIMIT 200', $limit));
  }
  public static function pending_renewals_for_reminders() {
    global $wpdb;
    return $wpdb->get_results('SELECT c.* FROM ' . self::charges() . ' c JOIN ' . self::subs() . " s ON s.id = c.sub_id WHERE c.kind = 'renewal' AND c.status = 'pending' AND c.reminders_sent < 2 AND s.status IN ('active','past_due') ORDER BY c.due_at ASC LIMIT 200");
  }
  public static function to_past_due($now) {
    global $wpdb; return (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::subs() . " SET status = 'past_due' WHERE status = 'active' AND period_end IS NOT NULL AND period_end < %s", $now));
  }
  public static function past_due_subs($now) {
    global $wpdb; return $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . self::subs() . " WHERE status = 'past_due' AND period_end < %s ORDER BY period_end ASC LIMIT 200", $now));
  }
  public static function expire($id) { global $wpdb; return (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::subs() . " SET status = 'expired' WHERE id = %d AND status = 'past_due'", (int) $id)); }
  /** Inscriptions jamais payées abandonnées depuis plus de 7 jours. */
  public static function purge_abandoned() {
    global $wpdb; $old = CVS_Util::add_days(CVS_Util::now(), -7); $c = self::charges(); $s = self::subs();
    $ids = $wpdb->get_col($wpdb->prepare("SELECT id FROM $s WHERE status = 'pending' AND created_at < %s LIMIT 200", $old));
    foreach ($ids as $id) self::delete_pending_sub($id);
  }

  // ---------- Accès, listes ----------
  public static function subs_of_user($uid) { global $wpdb; return $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . self::subs() . ' WHERE user_id = %d ORDER BY id DESC LIMIT 100', (int) $uid)); }
  public static function subs_by_email($email, $page = 1, $per = 100) { global $wpdb; return $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . self::subs() . ' WHERE email = %s ORDER BY id ASC LIMIT %d OFFSET %d', $email, (int) $per, max(0, ($page - 1) * $per))); }
  public static function charges_of($sub_id) { global $wpdb; return $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . self::charges() . ' WHERE sub_id = %d ORDER BY id ASC LIMIT 200', (int) $sub_id)); }
  public static function anonymize_email($email) {
    global $wpdb; $n = 0;
    foreach ($wpdb->get_col($wpdb->prepare('SELECT id FROM ' . self::subs() . ' WHERE email = %s', $email)) as $id)
      $n += (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::subs() . " SET email = %s, name = '', user_id = NULL, status = CASE WHEN status IN ('active','past_due','pending') THEN 'cancelled' ELSE status END WHERE id = %d", 'erased-' . (int) $id . '@invalid', (int) $id));
    return $n;
  }
  public static function search_subs($status, $plan, $q, $page, $per) {
    global $wpdb; $t = self::subs(); $w = ['1=1']; $a = [];
    if (in_array($status, ['pending', 'active', 'past_due', 'expired', 'cancelled'], true)) { $w[] = 'status = %s'; $a[] = $status; }
    if ($plan > 0) { $w[] = 'plan_id = %d'; $a[] = (int) $plan; }
    if ($q !== '') { $like = '%' . $wpdb->esc_like($q) . '%'; $w[] = '(email LIKE %s OR name LIKE %s)'; array_push($a, $like, $like); }
    $where = implode(' AND ', $w);
    $count = $a ? $wpdb->prepare("SELECT COUNT(*) FROM $t WHERE $where", $a) : "SELECT COUNT(*) FROM $t";
    $rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM $t WHERE $where ORDER BY id DESC LIMIT %d OFFSET %d", array_merge($a, [(int) $per, max(0, ($page - 1) * $per)])));
    return ['rows' => $rows, 'total' => (int) $wpdb->get_var($count)];
  }
  public static function recent_charges($page, $per) {
    global $wpdb; $t = self::charges();
    return ['rows' => $wpdb->get_results($wpdb->prepare("SELECT c.*, s.email, s.name, s.plan_id FROM $t c JOIN " . self::subs() . " s ON s.id = c.sub_id ORDER BY c.id DESC LIMIT %d OFFSET %d", (int) $per, max(0, ($page - 1) * $per))), 'total' => (int) $wpdb->get_var("SELECT COUNT(*) FROM $t")];
  }
}
