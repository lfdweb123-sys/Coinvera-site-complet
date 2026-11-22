<?php
if (!defined('ABSPATH')) exit;

final class CVG_Settings {
  const OPT = 'cvg_settings';

  public static function defaults() {
    return [
      'api_base' => 'https://api.coinvera.me', 'license_key' => '', 'enabled' => 1,
      // Vélocité : nouvelles commandes et paiements échoués, par IP.
      'order_limit' => 8, 'order_window' => 300,     // 8 commandes / 5 min
      'fail_limit' => 5, 'fail_window' => 900,        // 5 échecs / 15 min
      'cooldown_minutes' => 30,
      // E-mails jetables et signal externe (VPN/proxy via le filtre cvg_ip_is_risky) : 'block', 'log' ou 'off'.
      'disposable_action' => 'block', 'risky_action' => 'log',
      'whitelist_ips' => '', 'whitelist_emails' => '', 'blocklist_ips' => '', 'blocklist_emails' => '',
      'notify_admin' => 1, 'notify_email' => '', 'delete_on_uninstall' => 0,
    ];
  }
  public static function all() { $o = get_option(self::OPT, []); return wp_parse_args(is_array($o) ? $o : [], self::defaults()); }
  public static function get($k) { $a = self::all(); return $a[$k] ?? null; }
  public static function update(array $new) { update_option(self::OPT, array_merge(self::all(), $new), false); }

  public static function enabled() { return !empty(self::get('enabled')); }
  public static function license_set() { return strlen((string) self::get('license_key')) >= 10; }
  public static function notify_email() { $e = (string) self::get('notify_email'); return is_email($e) ? $e : get_option('admin_email'); }

  public static function order_limit() { return max(1, (int) self::get('order_limit')); }
  public static function order_window() { return max(60, (int) self::get('order_window')); }
  public static function fail_limit() { return max(1, (int) self::get('fail_limit')); }
  public static function fail_window() { return max(60, (int) self::get('fail_window')); }
  public static function cooldown() { return max(1, (int) self::get('cooldown_minutes')) * MINUTE_IN_SECONDS; }

  private static function action_of($v) { return in_array($v, ['block', 'log', 'off'], true) ? $v : 'off'; }
  public static function disposable_action() { return self::action_of(self::get('disposable_action')); }
  public static function risky_action() { return self::action_of(self::get('risky_action')); }
}
