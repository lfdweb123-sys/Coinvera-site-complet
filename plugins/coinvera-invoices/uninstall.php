<?php
if (!defined('WP_UNINSTALL_PLUGIN')) exit;

wp_clear_scheduled_hook('cvi_check_payments');
wp_clear_scheduled_hook('cvi_reminders');
delete_transient('cvi_license_ok');
delete_option('cvi_license_ok_at');

// Les factures (pièces comptables) et les réglages ne sont supprimés que si l'administrateur l'a demandé dans les réglages.
$o = get_option('cvi_settings', []);
if (is_array($o) && !empty($o['delete_on_uninstall'])) {
  global $wpdb;
  $wpdb->query('DROP TABLE IF EXISTS ' . $wpdb->prefix . 'cvi_invoices');
  $wpdb->query('DROP TABLE IF EXISTS ' . $wpdb->prefix . 'cvi_counters');
  delete_option('cvi_settings');
  delete_option('cvi_db_version');
  delete_option('cvi_hook_url');
  delete_transient('cvi_hook_try');
}
