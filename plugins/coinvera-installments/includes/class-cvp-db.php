<?php
if (!defined('ABSPATH')) exit;

/** Une ligne par échéance restante d'un plan (l'acompte / première échéance est la commande d'origine elle-même).
 *  Aucune donnée personnelle : seulement des identifiants de commande et des montants (en plus petite unité monétaire). */
final class CVP_DB {
  const VER = '1';
  public static function table() { global $wpdb; return $wpdb->prefix . 'cvp_items'; }

  public static function install() {
    global $wpdb; require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    $t = self::table(); $cs = $wpdb->get_charset_collate();
    dbDelta("CREATE TABLE $t (
      id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
      order_id bigint(20) unsigned NOT NULL,
      seq tinyint(3) unsigned NOT NULL DEFAULT 1,
      amount_minor bigint(20) unsigned NOT NULL DEFAULT 0,
      due_at datetime NULL,
      status varchar(12) NOT NULL DEFAULT 'scheduled',
      child_order_id bigint(20) unsigned NOT NULL DEFAULT 0,
      requested_at datetime NULL,
      reminded tinyint(1) unsigned NOT NULL DEFAULT 0,
      PRIMARY KEY  (id),
      UNIQUE KEY plan_seq (order_id, seq),
      KEY due (status, due_at),
      KEY child (child_order_id)
    ) $cs;");
    update_option('cvp_db_version', self::VER, false);
  }
  public static function maybe_upgrade() { if (get_option('cvp_db_version') !== self::VER) self::install(); }

  /** La contrainte UNIQUE (order_id, seq) garantit qu'un plan n'est jamais créé deux fois pour la même commande. */
  public static function add($order_id, $seq, $amount_minor, $due_ts) {
    global $wpdb;
    return $wpdb->query($wpdb->prepare('INSERT IGNORE INTO ' . self::table() . ' (order_id, seq, amount_minor, due_at, status) VALUES (%d, %d, %d, ' . ($due_ts ? '%s' : 'NULL') . ", 'scheduled')",
      ...($due_ts ? [(int) $order_id, (int) $seq, (int) $amount_minor, gmdate('Y-m-d H:i:s', $due_ts)] : [(int) $order_id, (int) $seq, (int) $amount_minor]))) === 1;
  }
  public static function for_order($order_id) {
    global $wpdb; return $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . self::table() . ' WHERE order_id=%d ORDER BY seq ASC', (int) $order_id));
  }
  public static function by_child($child_id) {
    global $wpdb; return $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . self::table() . ' WHERE child_order_id=%d', (int) $child_id));
  }
  public static function due_now($limit = 25) {
    global $wpdb; return $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . self::table() . " WHERE status='scheduled' AND due_at IS NOT NULL AND due_at <= %s ORDER BY due_at ASC LIMIT %d", gmdate('Y-m-d H:i:s'), (int) $limit));
  }
  public static function overdue_unreminded($days, $limit = 25) {
    global $wpdb; return $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . self::table() . " WHERE status='requested' AND reminded=0 AND requested_at <= %s ORDER BY requested_at ASC LIMIT %d", gmdate('Y-m-d H:i:s', time() - max(1, (int) $days) * DAY_IN_SECONDS), (int) $limit));
  }
  /** Prochaine échéance non payée d'un plan (pour la demande manuelle du solde). */
  public static function next_open($order_id) {
    global $wpdb; return $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . self::table() . " WHERE order_id=%d AND status IN ('scheduled','cancelled') ORDER BY seq ASC LIMIT 1", (int) $order_id));
  }
  public static function set_requested($id, $child_id) {
    global $wpdb; $wpdb->update(self::table(), ['status' => 'requested', 'child_order_id' => (int) $child_id, 'requested_at' => gmdate('Y-m-d H:i:s'), 'reminded' => 0], ['id' => (int) $id], ['%s', '%d', '%s', '%d'], ['%d']);
  }
  public static function mark_reminded($id) { global $wpdb; $wpdb->update(self::table(), ['reminded' => 1], ['id' => (int) $id], ['%d'], ['%d']); }
  /** Retourne true seulement la première fois (idempotent si deux changements de statut se suivent). */
  public static function mark_paid($id) {
    global $wpdb; return (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::table() . " SET status='paid' WHERE id=%d AND status!='paid'", (int) $id)) === 1;
  }
  public static function set_status($id, $status) { global $wpdb; $wpdb->update(self::table(), ['status' => substr($status, 0, 12)], ['id' => (int) $id], ['%s'], ['%d']); }
  public static function cancel_open($order_id) {
    global $wpdb; $wpdb->query($wpdb->prepare('UPDATE ' . self::table() . " SET status='cancelled' WHERE order_id=%d AND status IN ('scheduled','requested')", (int) $order_id));
  }
  public static function unpaid_count($order_id) {
    global $wpdb; return (int) $wpdb->get_var($wpdb->prepare('SELECT COUNT(*) FROM ' . self::table() . " WHERE order_id=%d AND status!='paid'", (int) $order_id));
  }
  public static function recent($page = 1, $per = 30) {
    global $wpdb; $t = self::table();
    $rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM $t ORDER BY (status='requested') DESC, id DESC LIMIT %d OFFSET %d", (int) $per, max(0, ((int) $page - 1) * (int) $per)));
    return ['rows' => $rows, 'total' => (int) $wpdb->get_var("SELECT COUNT(*) FROM $t")];
  }
}
