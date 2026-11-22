<?php
if (!defined('ABSPATH')) exit;

/** Journal des décisions (bloqué / signalé) uniquement : les commandes normalement acceptées n'y figurent pas,
 *  pour que la table reste petite et utile. Conservé 90 jours (nettoyage quotidien). */
final class CVG_DB {
  const VER = '1';
  const RETAIN_DAYS = 90;
  public static function table() { global $wpdb; return $wpdb->prefix . 'cvg_events'; }

  public static function install() {
    global $wpdb; require_once ABSPATH . 'wp-admin/includes/upgrade.php';
    $t = self::table(); $cs = $wpdb->get_charset_collate();
    dbDelta("CREATE TABLE $t (
      id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
      created_at datetime NOT NULL,
      context varchar(20) NOT NULL DEFAULT '',
      action varchar(10) NOT NULL DEFAULT '',
      reason varchar(30) NOT NULL DEFAULT '',
      ip varchar(45) NOT NULL DEFAULT '',
      email varchar(190) NOT NULL DEFAULT '',
      domain varchar(190) NOT NULL DEFAULT '',
      order_id bigint(20) unsigned NOT NULL DEFAULT 0,
      PRIMARY KEY  (id),
      KEY created_at (created_at),
      KEY ip (ip),
      KEY action (action)
    ) $cs;");
    update_option('cvg_db_version', self::VER, false);
  }
  public static function maybe_upgrade() { if (get_option('cvg_db_version') !== self::VER) self::install(); }

  public static function log($context, $action, $reason, $ip, $email = '', $order_id = 0) {
    global $wpdb;
    $wpdb->insert(self::table(), [
      'created_at' => CVG_Util::now(), 'context' => substr((string) $context, 0, 20), 'action' => substr((string) $action, 0, 10), 'reason' => substr((string) $reason, 0, 30),
      'ip' => substr((string) $ip, 0, 45), 'email' => substr(strtolower((string) $email), 0, 190), 'domain' => substr(CVG_Util::domain_of($email), 0, 190), 'order_id' => (int) $order_id,
    ], ['%s', '%s', '%s', '%s', '%s', '%s', '%d']);
    if ($action === 'blocked' && CVG_Settings::get('notify_admin')) self::maybe_notify($reason, $ip, $email);
  }

  /** Alerte e-mail groupée (au plus une toutes les 30 min) pour ne pas noyer l'administrateur en cas d'attaque. */
  private static function maybe_notify($reason, $ip, $email) {
    if (get_transient('cvg_notify_lock')) return;
    set_transient('cvg_notify_lock', 1, 30 * MINUTE_IN_SECONDS);
    $to = CVG_Settings::notify_email();
    wp_mail($to, '[' . CVG_Util::one_line(get_bloginfo('name'), 60) . '] Coinvera Guard a bloqué des tentatives suspectes',
      "Coinvera Guard vient de bloquer une tentative de commande suspecte sur votre boutique.\n\nMotif : $reason\nIP : $ip\n" . ($email !== '' ? "E-mail : $email\n" : '') .
      "\nVoir le détail : " . admin_url('admin.php?page=cvg-events') . "\n\nCe message n'est envoyé qu'une fois toutes les 30 minutes maximum, même en cas d'attaque prolongée.");
  }

  public static function recent($page = 1, $per = 30, $action = '') {
    global $wpdb; $t = self::table(); $where = '1=1'; $args = [];
    if (in_array($action, ['blocked', 'flagged'], true)) { $where = 'action = %s'; $args[] = $action; }
    $count = $args ? $wpdb->prepare("SELECT COUNT(*) FROM $t WHERE $where", $args) : "SELECT COUNT(*) FROM $t";
    $rows = $wpdb->get_results($wpdb->prepare("SELECT * FROM $t WHERE $where ORDER BY id DESC LIMIT %d OFFSET %d", array_merge($args, [(int) $per, max(0, ((int) $page - 1) * (int) $per)])));
    return ['rows' => $rows, 'total' => (int) $wpdb->get_var($count)];
  }

  /** @return array{blocked_today:int,blocked_7d:int,flagged_7d:int} */
  public static function stats() {
    global $wpdb; $t = self::table();
    $today = gmdate('Y-m-d 00:00:00'); $week = gmdate('Y-m-d H:i:s', time() - 7 * DAY_IN_SECONDS);
    $r = $wpdb->get_row($wpdb->prepare("SELECT
      COALESCE(SUM(CASE WHEN action='blocked' AND created_at >= %s THEN 1 END),0) blocked_today,
      COALESCE(SUM(CASE WHEN action='blocked' AND created_at >= %s THEN 1 END),0) blocked_7d,
      COALESCE(SUM(CASE WHEN action='flagged' AND created_at >= %s THEN 1 END),0) flagged_7d
      FROM $t", $today, $week, $week));
    return ['blocked_today' => (int) ($r->blocked_today ?? 0), 'blocked_7d' => (int) ($r->blocked_7d ?? 0), 'flagged_7d' => (int) ($r->flagged_7d ?? 0)];
  }

  public static function by_email($email, $page = 1, $per = 100) {
    global $wpdb;
    return $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . self::table() . ' WHERE email = %s ORDER BY id ASC LIMIT %d OFFSET %d', strtolower($email), (int) $per, max(0, ((int) $page - 1) * (int) $per)));
  }
  public static function erase_email($email) {
    global $wpdb; return (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::table() . " SET email = '', domain = '' WHERE email = %s", strtolower($email)));
  }

  public static function prune() {
    global $wpdb; $wpdb->query($wpdb->prepare('DELETE FROM ' . self::table() . ' WHERE created_at < %s', gmdate('Y-m-d H:i:s', time() - self::RETAIN_DAYS * DAY_IN_SECONDS)));
  }
}
