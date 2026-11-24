<?php
if (!defined('WP_UNINSTALL_PLUGIN')) exit;

delete_transient('cvx_license_ok');
delete_option('cvx_license_ok_at');

$o = get_option('cvx_settings', []);
if (is_array($o) && !empty($o['delete_on_uninstall'])) {
  global $wpdb;
  $wpdb->query('DROP TABLE IF EXISTS ' . $wpdb->prefix . 'cvx_requests');
  delete_option('cvx_settings');
  delete_option('cvx_db_version');
}
