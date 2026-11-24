<?php
if (!defined('WP_UNINSTALL_PLUGIN')) exit;

wp_clear_scheduled_hook('cvp_run');
delete_transient('cvp_license_ok');
delete_option('cvp_license_ok_at');

$o = get_option('cvp_settings', []);
if (is_array($o) && !empty($o['delete_on_uninstall'])) {
  global $wpdb;
  $wpdb->query('DROP TABLE IF EXISTS ' . $wpdb->prefix . 'cvp_items');
  delete_option('cvp_settings');
  delete_option('cvp_db_version');
}
