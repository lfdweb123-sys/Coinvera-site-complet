<?php
if (!defined('ABSPATH')) exit;

/**
 * Commandes et billets. La jauge est GARANTIE : toute réservation et toute confirmation se font sous un verrou nommé par événement (GET_LOCK),
 * avec un recomptage dans le verrou. Les transitions sont des UPDATE conditionnels.
 */
final class CVT_DB {
  const VER = '1';
  public static function orders() { global $wpdb; return $wpdb->prefix . 'cvt_orders'; }
  public static function tickets() { global $wpdb; return $wpdb->prefix . 'cvt_tickets'; }

  public static function install() {
    global $wpdb; require_once ABSPATH . 'wp-admin/includes/upgrade.php'; $cc = $wpdb->get_charset_collate();
    dbDelta('CREATE TABLE ' . self::orders() . " (
      id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
      event_id bigint(20) unsigned NOT NULL,
      buyer_name varchar(120) NOT NULL DEFAULT '',
      buyer_email varchar(190) NOT NULL DEFAULT '',
      status varchar(10) NOT NULL DEFAULT 'pending',
      pay_state varchar(8) NOT NULL DEFAULT '',
      total_cents bigint(20) unsigned NOT NULL DEFAULT 0,
      token char(32) NOT NULL,
      cv_payment_id varchar(64) NOT NULL DEFAULT '',
      checkout_url varchar(500) NOT NULL DEFAULT '',
      pay_mode varchar(8) NOT NULL DEFAULT '',
      hold_until datetime NOT NULL,
      manual tinyint(1) unsigned NOT NULL DEFAULT 0,
      created_at datetime NOT NULL,
      paid_at datetime DEFAULT NULL,
      updated_at datetime NOT NULL,
      PRIMARY KEY  (id),
      UNIQUE KEY token (token),
      KEY event_status (event_id,status),
      KEY buyer_email (buyer_email),
      KEY pay_check (pay_state,status),
      KEY hold (status,hold_until)
    ) $cc;");
    dbDelta('CREATE TABLE ' . self::tickets() . " (
      id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
      order_id bigint(20) unsigned NOT NULL,
      event_id bigint(20) unsigned NOT NULL,
      type_id varchar(12) NOT NULL,
      type_name varchar(80) NOT NULL DEFAULT '',
      price_cents bigint(20) unsigned NOT NULL DEFAULT 0,
      holder_name varchar(120) NOT NULL DEFAULT '',
      code varchar(32) NOT NULL,
      status varchar(8) NOT NULL DEFAULT 'held',
      used_at datetime DEFAULT NULL,
      used_by bigint(20) unsigned DEFAULT NULL,
      created_at datetime NOT NULL,
      PRIMARY KEY  (id),
      UNIQUE KEY code (code),
      KEY order_id (order_id),
      KEY event_status (event_id,status)
    ) $cc;");
    update_option('cvt_db_version', self::VER, false);
  }
  public static function maybe_upgrade() { if (get_option('cvt_db_version') !== self::VER) self::install(); }

  public static function lock($name, $wait = 5) { global $wpdb; return (int) $wpdb->get_var($wpdb->prepare('SELECT GET_LOCK(%s, %d)', 'cvt_' . $name, (int) $wait)) === 1; }
  public static function unlock($name) { global $wpdb; $wpdb->query($wpdb->prepare('SELECT RELEASE_LOCK(%s)', 'cvt_' . $name)); }

  public static function order($id) { global $wpdb; return $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . self::orders() . ' WHERE id = %d', (int) $id)); }
  public static function order_by_token($t) { global $wpdb; return CVT_Util::is_token($t) ? $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . self::orders() . ' WHERE token = %s', $t)) : null; }
  public static function tickets_of($order_id) { global $wpdb; return $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . self::tickets() . ' WHERE order_id = %d ORDER BY id ASC LIMIT 100', (int) $order_id)); }

  /** Billets qui occupent une place : valides/utilisés, et réservés dont la réservation court encore. $except exclut une commande (recomptage lors d'une confirmation tardive). */
  public static function taken($event_id, $type_id, $now, $except = 0) {
    global $wpdb; $sql = 'SELECT COUNT(*) FROM ' . self::tickets() . ' t JOIN ' . self::orders() . " o ON o.id = t.order_id WHERE t.event_id = %d AND o.id <> %d AND (t.status IN ('valid','used') OR (t.status = 'held' AND o.hold_until >= %s))";
    $a = [(int) $event_id, (int) $except, $now]; if ($type_id !== null) { $sql .= ' AND t.type_id = %s'; $a[] = $type_id; }
    return (int) $wpdb->get_var($wpdb->prepare($sql, $a));
  }

  /**
   * Crée commande + billets réservés. $qty : [type_id => quantité]. Les prix viennent TOUJOURS des types de l'événement (serveur).
   * Retourne ['order' => id] ou ['err' => code, 'left' => N].
   */
  public static function create_order($ev, array $qty, $name, $email, $hold_min, $manual = false) {
    global $wpdb; $now = CVT_Util::now(); $lines = []; $count = 0; $total = 0;
    foreach ($qty as $tid => $n) {
      $n = (int) $n; if ($n < 1) continue;
      if (!isset($ev['types'][$tid]) || $n > $ev['max']) return ['err' => 'bad', 'left' => 0];
      $count += $n; $lines[$tid] = $n; $total += $n * $ev['types'][$tid]['price'];
    }
    if ($count < 1 || $count > $ev['max']) return ['err' => 'bad', 'left' => 0];
    if (!$manual && ($total < 100 || $total > CVT_Util::MAX_CENTS)) return ['err' => 'bad', 'left' => 0];
    if (!self::lock('ev_' . (int) $ev['id'])) return ['err' => 'busy', 'left' => 0];
    try {
      $left = $ev['capacity'] - self::taken($ev['id'], null, $now);
      if ($count > $left) return ['err' => 'full', 'left' => max(0, $left)];
      foreach ($lines as $tid => $n) {
        $q = $ev['types'][$tid]['quota']; if ($q < 1) continue;
        $tl = $q - self::taken($ev['id'], $tid, $now); if ($n > $tl) return ['err' => 'quota', 'left' => max(0, min($left, $tl))];
      }
      $hold = $manual ? $now : gmdate('Y-m-d H:i:s', time() + max(5, min(240, (int) $hold_min)) * 60);
      $ok = $wpdb->insert(self::orders(), ['event_id' => (int) $ev['id'], 'buyer_name' => $name, 'buyer_email' => $email, 'status' => $manual ? 'paid' : 'pending', 'total_cents' => $manual ? 0 : $total, 'token' => CVT_Util::token(),
        'hold_until' => $hold, 'manual' => $manual ? 1 : 0, 'created_at' => $now, 'paid_at' => $manual ? $now : null, 'updated_at' => $now], ['%d', '%s', '%s', '%s', '%d', '%s', '%s', '%d', '%s', '%s', '%s']);
      if (!$ok) return ['err' => 'db', 'left' => 0];
      $oid = (int) $wpdb->insert_id;
      foreach ($lines as $tid => $n) for ($i = 0; $i < $n; $i++) if (!self::add_ticket($oid, $ev, $tid, $name, $manual)) { self::drop_order($oid); return ['err' => 'db', 'left' => 0]; }
      return ['order' => $oid];
    } finally { self::unlock('ev_' . (int) $ev['id']); }
  }
  private static function add_ticket($oid, $ev, $tid, $name, $manual) {
    global $wpdb; $t = $ev['types'][$tid];
    for ($try = 0; $try < 5; $try++) {   // collision de code (quasi impossible) : on régénère
      $ok = $wpdb->insert(self::tickets(), ['order_id' => (int) $oid, 'event_id' => (int) $ev['id'], 'type_id' => $tid, 'type_name' => $t['name'], 'price_cents' => $manual ? 0 : $t['price'], 'holder_name' => $name,
        'code' => CVT_Codes::generate(), 'status' => $manual ? 'valid' : 'held', 'created_at' => CVT_Util::now()], ['%d', '%d', '%s', '%s', '%d', '%s', '%s', '%s', '%s']);
      if ($ok) return true;
    }
    return false;
  }
  private static function drop_order($oid) { global $wpdb; $wpdb->delete(self::tickets(), ['order_id' => (int) $oid], ['%d']); $wpdb->delete(self::orders(), ['id' => (int) $oid], ['%d']); }

  /** Abandon immédiat (paiement impossible à créer) : la place est libérée tout de suite. */
  public static function release($oid) {
    global $wpdb; $n = (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::orders() . " SET status = 'expired', updated_at = %s WHERE id = %d AND status = 'pending'", CVT_Util::now(), (int) $oid));
    if ($n) $wpdb->query($wpdb->prepare('UPDATE ' . self::tickets() . " SET status = 'void' WHERE order_id = %d AND status = 'held'", (int) $oid));
    return $n;
  }
  /** Réservations dépassées : commande « expired », billets « void ». */
  public static function expire_due() {
    global $wpdb; $now = CVT_Util::now(); $n = 0;
    foreach ($wpdb->get_col($wpdb->prepare('SELECT id FROM ' . self::orders() . " WHERE status = 'pending' AND hold_until < %s LIMIT 200", $now)) as $id) $n += self::release($id);
    return $n;
  }

  /**
   * Confirmation d'une commande payée (déjà vérifiée auprès de l'API). Sous le verrou de l'événement :
   *  - réservation encore valide : billets « held » → « valid » ;
   *  - réservation expirée (billets libérés) : on re-réserve SI la jauge et les quotas le permettent, sinon « review » (remboursement manuel).
   * Retourne 'paid' | 'already' | 'review'.
   */
  public static function confirm_order($order, $ev) {
    global $wpdb; $oid = (int) $order->id; $eid = (int) $order->event_id;
    if (!self::lock('ev_' . $eid)) return 'retry';
    try {
      $o = self::order($oid); if (!$o) return 'review'; if ($o->status === 'paid') return 'already'; if (!in_array($o->status, ['pending', 'expired'], true)) return 'review';
      $now = CVT_Util::now(); $tk = self::tickets_of($oid); if (!$tk) return 'review';
      if (!($o->status === 'pending' && $o->hold_until >= $now)) {   // hold perdu : recomptage de la jauge et des quotas
        if (!$ev) return 'review'; $by = [];
        foreach ($tk as $t) { if (!in_array($t->status, ['held', 'void'], true)) return 'review'; $by[$t->type_id] = ($by[$t->type_id] ?? 0) + 1; }
        if (count($tk) > $ev['capacity'] - self::taken($eid, null, $now, $oid)) return 'review';
        foreach ($by as $tid => $n) { $q = $ev['types'][$tid]['quota'] ?? 0; if ($q > 0 && $n > $q - self::taken($eid, $tid, $now, $oid)) return 'review'; }
      }
      $won = (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::orders() . " SET status = 'paid', paid_at = %s, pay_state = '', updated_at = %s WHERE id = %d AND status IN ('pending','expired')", $now, $now, $oid));
      if (!$won) return 'already';
      $wpdb->query($wpdb->prepare('UPDATE ' . self::tickets() . " SET status = 'valid' WHERE order_id = %d AND status IN ('held','void')", $oid));
      return 'paid';
    } finally { self::unlock('ev_' . $eid); }
  }

  public static function attach_payment($id, $pid, $url, $mode) {
    global $wpdb;
    return (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::orders() . " SET cv_payment_id = %s, checkout_url = %s, pay_mode = %s, pay_state = 'pending', updated_at = %s WHERE id = %d AND status IN ('pending','expired')", $pid, $url, $mode, CVT_Util::now(), (int) $id));
  }
  public static function settle_payment($id, $pid, $to) {
    global $wpdb; $url = $to === '' ? ", checkout_url = ''" : '';
    return (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::orders() . " SET pay_state = %s$url, updated_at = %s WHERE id = %d AND cv_payment_id = %s AND pay_state = 'pending'", $to, CVT_Util::now(), (int) $id, $pid));
  }
  public static function flag_review($id) {
    global $wpdb;
    return (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::orders() . " SET pay_state = 'review', updated_at = %s WHERE id = %d AND pay_state <> 'review'", CVT_Util::now(), (int) $id));
  }
  public static function pending_to_check() {
    global $wpdb;
    return $wpdb->get_results('SELECT * FROM ' . self::orders() . " WHERE pay_state = 'pending' AND cv_payment_id <> '' AND updated_at > DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY) ORDER BY id ASC LIMIT 50");
  }
  /** Remboursement manuel : commande « refunded », billets non utilisés « void » (la place est libérée). */
  public static function refund($id) {
    global $wpdb; $n = (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::orders() . " SET status = 'refunded', updated_at = %s WHERE id = %d AND status = 'paid'", CVT_Util::now(), (int) $id));
    if ($n) $wpdb->query($wpdb->prepare('UPDATE ' . self::tickets() . " SET status = 'void' WHERE order_id = %d AND status = 'valid'", (int) $id));
    return $n;
  }
  public static function void_ticket($id) { global $wpdb; return (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::tickets() . " SET status = 'void' WHERE id = %d AND status = 'valid'", (int) $id)); }

  // ---------- Contrôle d'entrée ----------
  public static function ticket_by_code($code) { global $wpdb; return $wpdb->get_row($wpdb->prepare('SELECT * FROM ' . self::tickets() . ' WHERE code = %s', $code)); }
  /** Validation atomique : une seule ligne modifiée = une seule entrée, même avec deux scans simultanés. */
  public static function mark_used($code, $event_id, $uid) {
    global $wpdb;
    return (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::tickets() . " SET status = 'used', used_at = %s, used_by = %d WHERE code = %s AND status = 'valid' AND event_id = %d", CVT_Util::now(), (int) $uid, $code, (int) $event_id));
  }
  public static function stats($event_id) {
    global $wpdb; $now = CVT_Util::now();
    $r = $wpdb->get_row($wpdb->prepare('SELECT SUM(t.status IN (\'valid\',\'used\')) sold, SUM(t.status = \'used\') used, SUM(t.status = \'held\' AND o.hold_until >= %s) held FROM ' . self::tickets() . ' t JOIN ' . self::orders() . ' o ON o.id = t.order_id WHERE t.event_id = %d', $now, (int) $event_id));
    return ['sold' => (int) ($r->sold ?? 0), 'used' => (int) ($r->used ?? 0), 'held' => (int) ($r->held ?? 0)];
  }

  // ---------- Listes ----------
  public static function search_orders($event, $status, $q, $page, $per) {
    global $wpdb; $t = self::orders(); $w = ['1=1']; $a = [];
    if ($event > 0) { $w[] = 'event_id = %d'; $a[] = (int) $event; }
    if (in_array($status, ['pending', 'paid', 'expired', 'refunded'], true)) { $w[] = 'status = %s'; $a[] = $status; }
    if ($status === 'review') $w[] = "pay_state = 'review'";
    if ($q !== '') { $like = '%' . $wpdb->esc_like($q) . '%'; $w[] = '(buyer_email LIKE %s OR buyer_name LIKE %s)'; array_push($a, $like, $like); }
    $where = implode(' AND ', $w); $count = $a ? $wpdb->prepare("SELECT COUNT(*) FROM $t WHERE $where", $a) : "SELECT COUNT(*) FROM $t";
    return ['rows' => $wpdb->get_results($wpdb->prepare("SELECT * FROM $t WHERE $where ORDER BY id DESC LIMIT %d OFFSET %d", array_merge($a, [(int) $per, max(0, ($page - 1) * $per)]))), 'total' => (int) $wpdb->get_var($count)];
  }
  public static function attendees($event, $q, $page, $per) {
    global $wpdb; $t = self::tickets(); $w = ['t.event_id = %d', "t.status <> 'held'"]; $a = [(int) $event];
    if ($q !== '') { $like = '%' . $wpdb->esc_like($q) . '%'; $w[] = '(t.holder_name LIKE %s OR o.buyer_email LIKE %s)'; array_push($a, $like, $like); }
    $where = implode(' AND ', $w); $from = "$t t JOIN " . self::orders() . ' o ON o.id = t.order_id';
    return ['rows' => $wpdb->get_results($wpdb->prepare("SELECT t.*, o.buyer_email FROM $from WHERE $where ORDER BY t.id ASC LIMIT %d OFFSET %d", array_merge($a, [(int) $per, max(0, ($page - 1) * $per)]))), 'total' => (int) $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM $from WHERE $where", $a))];
  }
  public static function orders_by_email($email, $page = 1, $per = 100) { global $wpdb; return $wpdb->get_results($wpdb->prepare('SELECT * FROM ' . self::orders() . ' WHERE buyer_email = %s ORDER BY id ASC LIMIT %d OFFSET %d', $email, (int) $per, max(0, ($page - 1) * $per))); }
  public static function anonymize_email($email) {
    global $wpdb; $n = 0;
    foreach ($wpdb->get_col($wpdb->prepare('SELECT id FROM ' . self::orders() . ' WHERE buyer_email = %s', $email)) as $id) {
      $n += (int) $wpdb->query($wpdb->prepare('UPDATE ' . self::orders() . " SET buyer_email = %s, buyer_name = '' WHERE id = %d", 'erased-' . (int) $id . '@invalid', (int) $id));
      $wpdb->query($wpdb->prepare('UPDATE ' . self::tickets() . " SET holder_name = '' WHERE order_id = %d", (int) $id));   // montants, dates et validité des codes conservés
    }
    return $n;
  }
}
