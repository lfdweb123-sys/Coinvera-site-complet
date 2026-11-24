<?php
if (!defined('WP_UNINSTALL_PLUGIN')) exit;

wp_clear_scheduled_hook('cvc_scan');
wp_clear_scheduled_hook('cvc_cleanup');
delete_transient('cvc_license_ok');
delete_option('cvc_license_ok_at');

$o = get_option('cvc_settings', []);
if (is_array($o) && !empty($o['delete_on_uninstall'])) {
  global $wpdb;
  $wpdb->query('DROP TABLE IF EXISTS ' . $wpdb->prefix . 'cvc_log');
  $wpdb->query('DROP TABLE IF EXISTS ' . $wpdb->prefix . 'cvc_customers');
  delete_option('cvc_settings');
  delete_option('cvc_db_version');
}
