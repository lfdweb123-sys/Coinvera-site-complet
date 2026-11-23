<?php
if (!defined('WP_UNINSTALL_PLUGIN')) exit;

wp_clear_scheduled_hook('cvr_scan_pending');
delete_transient('cvr_license_ok');
delete_option('cvr_license_ok_at');

$o = get_option('cvr_settings', []);
if (is_array($o) && !empty($o['delete_on_uninstall'])) {
  global $wpdb;
  $wpdb->query('DROP TABLE IF EXISTS ' . $wpdb->prefix . 'cvr_sent');
  delete_option('cvr_settings');
  delete_option('cvr_db_version');
}
