<?php
if (!defined('ABSPATH')) exit;

final class CVX_Settings {
  const OPT = 'cvx_settings';
  const REASONS = ['taille' => 'Taille/pointure incorrecte', 'defaut' => 'Article défectueux ou endommagé', 'ne_convient_pas' => 'Ne convient pas / ne plaît pas', 'erreur_commande' => 'Erreur dans ma commande', 'autre' => 'Autre raison'];

  public static function defaults() {
    return [
      'api_base' => 'https://api.coinvera.me', 'license_key' => '', 'enabled' => 1,
      'return_window_days' => 30, 'allowed_statuses' => 'completed',
      'credit_bonus_pct' => 5, 'credit_expiry_days' => 180,
      'allow_refund' => 1, 'allow_exchange' => 1,
      'notify_admin' => 1, 'notify_email' => '', 'delete_on_uninstall' => 0,
    ];
  }
  public static function all() { $o = get_option(self::OPT, []); return wp_parse_args(is_array($o) ? $o : [], self::defaults()); }
  public static function get($k) { $a = self::all(); return $a[$k] ?? null; }
  public static function update(array $new) { update_option(self::OPT, array_merge(self::all(), $new), false); }

  public static function enabled() { return !empty(self::get('enabled')); }
  public static function license_set() { return strlen((string) self::get('license_key')) >= 10; }
  public static function notify_email() { $e = (string) self::get('notify_email'); return is_email($e) ? $e : get_option('admin_email'); }

  public static function window_seconds() { return max(1, (int) self::get('return_window_days')) * DAY_IN_SECONDS; }
  public static function allowed_statuses() { return array_filter(array_map('trim', explode(',', (string) self::get('allowed_statuses')))); }
  public static function bonus_pct() { return max(0, min(100, (float) self::get('credit_bonus_pct'))); }
  public static function credit_expiry_seconds() { return max(1, (int) self::get('credit_expiry_days')) * DAY_IN_SECONDS; }
  public static function allow_refund() { return !empty(self::get('allow_refund')); }
  public static function allow_exchange() { return !empty(self::get('allow_exchange')); }
}
