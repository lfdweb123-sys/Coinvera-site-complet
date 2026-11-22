<?php
if (!defined('ABSPATH')) exit;

/** Tables : factures et compteurs de numérotation. Les changements de statut sont atomiques (UPDATE … WHERE status IN (…)). */
final class CVI_DB {
  const VER = '1';
  public static function table() { global $wpdb; return $wpdb->prefix . 'cvi_invoices'; }
  public static function counters() { global $wpdb; return $wpdb->prefix . 'cvi_counters'; }

  public static function install() {
    global $wpdb; require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    $t = self::table(); $c = self::counters(); $cs = $wpdb->get_charset_collate();
    dbDelta("CREATE TABLE $t (
      id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
      number varchar(40) NOT NULL,
      status varchar(16) NOT NULL DEFAULT 'draft',
      customer_name varchar(120) NOT NULL DEFAULT '',
      customer_email varchar(190) NOT NULL DEFAULT '',
      customer_address text NOT NULL,
      issue_date date NOT NULL,
      due_date date NOT NULL,
      items longtext NOT NULL,
      discount_cents bigint(20) unsigned NOT NULL DEFAULT 0,
      tax_bp int(10) unsigned NOT NULL DEFAULT 0,
      subtotal_cents bigint(20) unsigned NOT NULL DEFAULT 0,
      tax_cents bigint(20) unsigned NOT NULL DEFAULT 0,
      total_cents bigint(20) unsigned NOT NULL DEFAULT 0,
      notes text NOT NULL,
      token char(32) NOT NULL,
      cv_payment_id varchar(64) NOT NULL DEFAULT '',
      checkout_url varchar(500) NOT NULL DEFAULT '',
      pay_mode varchar(8) NOT NULL DEFAULT '',
      pay_state varchar(12) NOT NULL DEFAULT '',
      paid_at datetime DEFAULT NULL,
      paid_via varchar(8) NOT NULL DEFAULT '',
      reminders_sent int(10) unsigned NOT NULL DEFAULT 0,
      last_reminder_at datetime DEFAULT NULL,
      created_at datetime NOT NULL,
      updated_at datetime NOT NULL,
      PRIMARY KEY  (id),
      UNIQUE KEY number (number),
      UNIQUE KEY token (token),
      KEY status_due (status,due_date),
      KEY pay_state (pay_state),
      KEY customer_email (customer_email)
    ) $cs;");
    dbDelta("CREATE TABLE $c (
      year smallint(5) unsigned NOT NULL,
      last int(10) unsigned NOT NULL DEFAULT 0,
      PRIMARY KEY  (year)
    ) $cs;");
    update_option('cvi_db_version', self::VER, false);
  }
  public static function maybe_upgrade() { if (get_option('cvi_db_version') !== self::VER) self::install(); }

  /** Numéro suivant, atomique même avec des créations simultanées (LAST_INSERT_ID(expr) est propre à la connexion). */
  public static function next_number($year) {
    global $wpdb; $year = (int) $year;
    $wpdb->query($wpdb->prepare('INSERT INTO ' . self::counters() . ' (year, last) VALUES (%d, LAST_INSERT_ID(1)) ON DUPLICATE KEY UPDATE last = LAST_INSERT_ID(last + 1)', $year));
    $n = (int) $wpdb->get_var('SELECT LAST_INSERT_ID()');
    return sprintf('%s-%d-%04d', CVI_Settings::prefix(), $year, $n);
  }

  /** Crée une facture (brouillon). $d : champs déjà validés par CVI_Admin. Retourne l'id ou 0. */
  public static function insert(array $d) {
    global $wpdb; $now = CVI_Util::now();
    for ($try = 0; $try < 3; $try++) {   // un numéro déjà pris (préfixe changé à la main, restauration…) fait passer au suivant
      $number = self::next_number((int) gmdate('Y'));
      $ok = $wpdb->insert(self::table(), [
        'number' => $number, 'status' => 'draft', 'customer_name' => $d['customer_name'], 'customer_email' => $d['customer_email'], 'customer_address' => $d['customer_address'],
        'issue_date' => $d['issue_date'], 'due_date' => $d['due_date'], 'items' => $d['items'], 'discount_cents' => (int) $d['discount_cents'], 'tax_bp' => (int) $d['tax_bp'],
        'subtotal_cents' => (int) $d['subtotal_cents'], 'tax_cents' => (int) $d['tax_cents'], 'total_cents' => (int) $d['total_cents'], 'notes' => $d['notes'],
        'token' => bin2hex(random_bytes(16)), 'created_at' => $now, 'updated_at' => $now,
      ], ['%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%d', '%d', '%d', '%d', '%d', '%s', '%s', '%s', '%s']);
      if ($ok) return (int) $wpdb->insert_id;
    }
    return 0;
  }

  public static function get($id) { global $wpdb; return $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . self::table() . ' WHERE id = %d', (int) $id)); }
  public static function get_by_token($t) { global $wpdb; return CVI_Util::valid_token($t) ? $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . self::table() . ' WHERE token = %s', $t)) : null; }

  /** Met à jour le contenu d'une facture encore modifiable (brouillon ou envoyée). 1 si modifiée. */
  public static function update_content($id, array $d, $reset_payment) {
    global $wpdb;
    $set = ['customer_name' => '%s', 'customer_email' => '%s', 'customer_address' => '%s', 'issue_date' => '%s', 'due_date' => '%s', 'items' => '%s', 'discount_cents' => '%d', 'tax_bp' => '%d',
      'subtotal_cents' => '%d', 'tax_cents' => '%d', 'total_cents' => '%d', 'notes' => '%s'];
    $sql = []; $args = [];
    foreach ($set as $col => $fmt) { $sql[] = "$col = $fmt"; $args[] = $d[$col]; }
    $sql[] = 'updated_at = %s'; $args[] = CVI_Util::now();
    if ($reset_payment) $sql[] = "pay_state = '', checkout_url = ''";   // le montant a changé : l'ancien lien de paiement n'est plus réutilisé
    $args[] = (int) $id;
    return (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::table() . ' SET ' . implode(', ', $sql) . " WHERE id = %d AND status IN ('draft','sent')", $args));
  }

  /** brouillon -> envoyée. 1 si le changement a eu lieu. */
  public static function mark_sent($id) {
    global $wpdb;
    return (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::table() . " SET status = 'sent', updated_at = %s WHERE id = %d AND status = 'draft'", CVI_Util::now(), (int) $id));
  }
  /** Marque payée. $via = 'card' (envoyée uniquement) ou 'manual' (brouillon ou envoyée). 1 si le changement a eu lieu : c'est lui qui déclenche les effets (e-mails). */
  public static function mark_paid($id, $via) {
    global $wpdb; $from = $via === 'card' ? "('sent')" : "('draft','sent')";
    return (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::table() . " SET status = 'paid', paid_at = %s, paid_via = %s, pay_state = '', updated_at = %s WHERE id = %d AND status IN $from", CVI_Util::now(), $via === 'card' ? 'card' : 'manual', CVI_Util::now(), (int) $id));
  }
  public static function cancel($id) {
    global $wpdb;
    return (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::table() . " SET status = 'cancelled', updated_at = %s WHERE id = %d AND status IN ('draft','sent')", CVI_Util::now(), (int) $id));
  }
  public static function delete_draft($id) {
    global $wpdb;
    return (int) $wpdb->query($wpdb->prepare('DELETE FROM ' . self::table() . " WHERE id = %d AND status = 'draft' AND cv_payment_id = ''", (int) $id));
  }

  // --- Paiement en cours ---
  public static function attach_payment($id, $pid, $url, $mode) {
    global $wpdb;
    return (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::table() . " SET cv_payment_id = %s, checkout_url = %s, pay_mode = %s, pay_state = 'pending', updated_at = %s WHERE id = %d AND status = 'sent'", $pid, $url, $mode, CVI_Util::now(), (int) $id));
  }
  /** pending -> '' / test / review, uniquement pour le paiement vérifié. */
  public static function settle_payment($id, $pid, $to) {
    global $wpdb; $url = $to === '' ? ", checkout_url = ''" : '';
    return (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::table() . " SET pay_state = %s$url, updated_at = %s WHERE id = %d AND cv_payment_id = %s AND pay_state = 'pending'", $to, CVI_Util::now(), (int) $id, $pid));
  }
  /** À examiner à la main (paiement reçu sur une facture annulée/déjà payée, montant ou référence incohérents). */
  public static function flag_review($id) {
    global $wpdb;
    return (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::table() . " SET pay_state = 'review', updated_at = %s WHERE id = %d AND pay_state <> 'review'", CVI_Util::now(), (int) $id));
  }
  public static function pending_to_check() {
    global $wpdb;
    return $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . self::table() . " WHERE pay_state = 'pending' AND cv_payment_id <> '' AND status IN ('sent','cancelled') AND updated_at > %s ORDER BY id ASC LIMIT 50", gmdate('Y-m-d H:i:s', time() - 3 * DAY_IN_SECONDS)));
  }

  // --- Relances ---
  public static function overdue_for_reminders($today) {
    global $wpdb;
    return $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . self::table() . " WHERE status = 'sent' AND due_date < %s AND customer_email <> '' ORDER BY due_date ASC LIMIT 300", $today));
  }
  /** Réserve la relance (compare-et-échange sur reminders_sent) : un seul exécutant l'envoie, même si deux crons se chevauchent. */
  public static function claim_reminder($id, $old, $new) {
    global $wpdb;
    return (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::table() . " SET reminders_sent = %d, last_reminder_at = %s WHERE id = %d AND status = 'sent' AND reminders_sent = %d", (int) $new, CVI_Util::now(), (int) $id, (int) $old));
  }

  // --- Liste et totaux ---
  private static function where($status, $q, $today) {
    global $wpdb; $w = ['1=1']; $a = [];
    if ($status === 'overdue') { $w[] = "status = 'sent' AND due_date < %s"; $a[] = $today; }
    elseif ($status === 'sent') { $w[] = "status = 'sent' AND due_date >= %s"; $a[] = $today; }
    elseif (in_array($status, ['draft', 'paid', 'cancelled'], true)) { $w[] = 'status = %s'; $a[] = $status; }
    if ($q !== '') { $like = '%' . $wpdb->esc_like($q) . '%'; $w[] = '(number LIKE %s OR customer_name LIKE %s OR customer_email LIKE %s)'; array_push($a, $like, $like, $like); }
    return [implode(' AND ', $w), $a];
  }
  public static function search($status, $q, $page, $per, $today) {
    global $wpdb; $t = self::table(); list($w, $a) = self::where($status, $q, $today);
    $count = $a ? $wpdb->prepare("SELECT COUNT(*) FROM $t WHERE $w", $a) : "SELECT COUNT(*) FROM $t";
    $rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM $t WHERE $w ORDER BY id DESC LIMIT %d OFFSET %d", array_merge($a, [(int) $per, max(0, ($page - 1) * $per)])));
    return ['rows' => $rows, 'total' => (int) $wpdb->get_var($count)];
  }
  /** @return array{paid:int,pending:int,overdue:int} */
  public static function sums($today) {
    global $wpdb; $t = self::table();
    $r = $wpdb->get_row($wpdb->prepare("SELECT COALESCE(SUM(CASE WHEN status='paid' THEN total_cents END),0) paid, COALESCE(SUM(CASE WHEN status='sent' AND due_date >= %s THEN total_cents END),0) pending, COALESCE(SUM(CASE WHEN status='sent' AND due_date < %s THEN total_cents END),0) overdue FROM $t", $today, $today));
    return ['paid' => (int) ($r->paid ?? 0), 'pending' => (int) ($r->pending ?? 0), 'overdue' => (int) ($r->overdue ?? 0)];
  }
  public static function by_email($email, $page = 1, $per = 100) {
    global $wpdb;
    return $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . self::table() . ' WHERE customer_email = %s ORDER BY id ASC LIMIT %d OFFSET %d', $email, (int) $per, max(0, ($page - 1) * $per)));
  }
}
