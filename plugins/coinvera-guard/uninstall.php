<?php
if (!defined('WP_UNINSTALL_PLUGIN')) exit;

wp_clear_scheduled_hook('cvg_cleanup');
delete_transient('cvg_license_ok');
delete_option('cvg_license_ok_at');
delete_transient('cvg_notify_lock');

// Le journal et les réglages ne sont supprimés que si l'administrateur l'a demandé dans les réglages.
$o = get_option('cvg_settings', []);
if (is_array($o) && !empty($o['delete_on_uninstall'])) {
  global $wpdb;
  $wpdb->query('DROP TABLE IF EXISTS ' . $wpdb->prefix . 'cvg_events');
  delete_option('cvg_settings');
  delete_option('cvg_db_version');
}
