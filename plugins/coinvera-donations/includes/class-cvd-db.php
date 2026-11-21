<?php
if (!defined('ABSPATH')) exit;

/**
 * Table des dons. Statuts : pending, confirmed (live), test (confirmé en mode test, non compté),
 * failed, expired, review (montant ou référence incohérents : à vérifier à la main, non compté).
 */
final class CVD_DB {
  const VER = '2';

  public static function table() { global $wpdb; return $wpdb->prefix . 'cvd_donations'; }

  public static function install() {
    global $wpdb; require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    $t = self::table(); $cs = $wpdb->get_charset_collate();
    dbDelta("CREATE TABLE $t (
      id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
      campaign_id bigint(20) unsigned NOT NULL DEFAULT 0,
      amount_cents int(10) unsigned NOT NULL,
      donor_name varchar(120) NOT NULL DEFAULT '',
      donor_email varchar(190) NOT NULL DEFAULT '',
      message varchar(500) NOT NULL DEFAULT '',
      anonymous tinyint(1) unsigned NOT NULL DEFAULT 0,
      status varchar(20) NOT NULL DEFAULT 'pending',
      cv_payment_id varchar(64) NOT NULL DEFAULT '',
      mode varchar(8) NOT NULL DEFAULT '',
      created_at datetime NOT NULL,
      confirmed_at datetime DEFAULT NULL,
      order_id bigint(20) unsigned DEFAULT NULL,
      PRIMARY KEY  (id),
      UNIQUE KEY order_id (order_id),
      KEY campaign_status (campaign_id,status),
      KEY status_created (status,created_at),
      KEY donor_email (donor_email)
    ) $cs;");
    update_option('cvd_db_version', self::VER, false);
  }
  public static function maybe_upgrade() { if (get_option('cvd_db_version') !== self::VER) self::install(); }

  public static function insert(array $d) {
    global $wpdb;
    $ok = $wpdb->insert(self::table(), [
      'campaign_id' => (int) $d['campaign_id'], 'amount_cents' => (int) $d['amount_cents'], 'donor_name' => (string) $d['donor_name'], 'donor_email' => (string) $d['donor_email'],
      'message' => (string) $d['message'], 'anonymous' => empty($d['anonymous']) ? 0 : 1, 'status' => 'pending', 'created_at' => CVD_Util::now(),
    ], ['%d', '%d', '%s', '%s', '%s', '%d', '%s', '%s']);
    return $ok ? (int) $wpdb->insert_id : 0;
  }
  /** Don issu d'une commande WooCommerce payée. INSERT IGNORE + clé unique sur order_id : une commande ne crée jamais deux dons. Retourne l'id du don, ou 0 s'il existait déjà. */
  public static function insert_order($order_id, array $d) {
    global $wpdb; $now = CVD_Util::now();
    $n = $wpdb->query($wpdb->prepare('INSERT IGNORE INTO ' . self::table() . " (campaign_id, amount_cents, donor_name, donor_email, message, anonymous, status, mode, order_id, created_at, confirmed_at) VALUES (%d, %d, %s, %s, %s, %d, 'confirmed', 'woo', %d, %s, %s)",
      (int) $d['campaign_id'], (int) $d['amount_cents'], (string) $d['donor_name'], (string) $d['donor_email'], (string) $d['message'], empty($d['anonymous']) ? 0 : 1, (int) $order_id, $now, $now));
    return ((int) $n === 1) ? (int) $wpdb->insert_id : 0;
  }
  /** Commande annulée, échouée ou remboursée : le don n'est plus compté. */
  public static function mark_refunded($order_id) {
    global $wpdb;
    return (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::table() . " SET status = 'refunded' WHERE order_id = %d AND status = 'confirmed'", (int) $order_id));
  }
  public static function get($id) { global $wpdb; return $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . self::table() . ' WHERE id = %d', (int) $id)); }

  public static function attach_payment($id, $pid, $mode) {
    global $wpdb;
    return (bool) $wpdb->update(self::table(), ['cv_payment_id' => $pid, 'mode' => $mode], ['id' => (int) $id, 'status' => 'pending'], ['%s', '%s'], ['%d', '%s']);
  }
  /** Change le statut uniquement si le don est encore "pending" (atomique : évite tout double comptage). */
  public static function transition($id, $to, $confirmed = false) {
    global $wpdb; $t = self::table();
    $sql = $confirmed ? $wpdb->prepare("UPDATE $t SET status = %s, confirmed_at = %s WHERE id = %d AND status = 'pending'", $to, CVD_Util::now(), (int) $id)
                      : $wpdb->prepare("UPDATE $t SET status = %s WHERE id = %d AND status = 'pending'", $to, (int) $id);
    return (int) $wpdb->query($sql) === 1;
  }

  /** @return array{raised:int,count:int} dons confirmés en mode réel uniquement */
  public static function totals($campaign_id = null) {
    global $wpdb; $t = self::table();
    $row = $campaign_id === null
      ? $wpdb->get_row("SELECT COALESCE(SUM(amount_cents),0) s, COUNT(*) n FROM $t WHERE status = 'confirmed'")
      : $wpdb->get_row($wpdb->prepare("SELECT COALESCE(SUM(amount_cents),0) s, COUNT(*) n FROM $t WHERE status = 'confirmed' AND campaign_id = %d", (int) $campaign_id));
    return ['raised' => (int) ($row->s ?? 0), 'count' => (int) ($row->n ?? 0)];
  }
  public static function donors($campaign_id, $limit = 10) {
    global $wpdb;
    return $wpdb->get_results($wpdb->prepare('SELECT donor_name, amount_cents, message, confirmed_at FROM ' . self::table() . " WHERE status = 'confirmed' AND campaign_id = %d AND anonymous = 0 AND donor_name <> '' ORDER BY confirmed_at DESC, id DESC LIMIT %d", (int) $campaign_id, max(1, min(100, (int) $limit))));
  }

  /** Liste filtrée et paginée pour l'administration. */
  public static function search($status = '', $campaign = -1, $page = 1, $per = 25) {
    global $wpdb; $t = self::table(); $w = ['1=1']; $a = [];
    if ($status !== '') { $w[] = 'status = %s'; $a[] = $status; }
    if ($campaign >= 0) { $w[] = 'campaign_id = %d'; $a[] = (int) $campaign; }
    $where = implode(' AND ', $w); $off = max(0, ($page - 1) * $per);
    $count = $a ? $wpdb->prepare("SELECT COUNT(*) FROM $t WHERE $where", $a) : "SELECT COUNT(*) FROM $t";
    $q = $wpdb->prepare("SELECT * FROM $t WHERE $where ORDER BY id DESC LIMIT %d OFFSET %d", array_merge($a, [(int) $per, (int) $off]));
    return ['rows' => $wpdb->get_results($q), 'total' => (int) $wpdb->get_var($count)];
  }
  public static function pending_to_check() {
    global $wpdb; $t = self::table();
    return $wpdb->get_results($wpdb->prepare("SELECT * FROM $t WHERE status = 'pending' AND cv_payment_id <> '' AND created_at > %s ORDER BY id ASC LIMIT 50", gmdate('Y-m-d H:i:s', time() - 3 * DAY_IN_SECONDS)));
  }
  /** Dons restés sans paiement créé depuis plus d'1 h -> échoués ; en attente depuis plus de 3 jours -> expirés. */
  public static function expire_stale() {
    global $wpdb; $t = self::table();
    $wpdb->query($wpdb->prepare("UPDATE $t SET status = 'failed' WHERE status = 'pending' AND cv_payment_id = '' AND created_at < %s", gmdate('Y-m-d H:i:s', time() - HOUR_IN_SECONDS)));
    $wpdb->query($wpdb->prepare("UPDATE $t SET status = 'expired' WHERE status = 'pending' AND created_at < %s", gmdate('Y-m-d H:i:s', time() - 3 * DAY_IN_SECONDS)));
  }
  public static function by_email($email, $page = 1, $per = 100) {
    global $wpdb;
    return $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . self::table() . ' WHERE donor_email = %s ORDER BY id ASC LIMIT %d OFFSET %d', $email, (int) $per, max(0, ($page - 1) * $per)));
  }
  public static function anonymize_email($email) {
    global $wpdb;
    return (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::table() . " SET donor_name = '', donor_email = '', message = '', anonymous = 1 WHERE donor_email = %s", $email));
  }
}
