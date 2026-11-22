<?php
if (!defined('WP_UNINSTALL_PLUGIN')) exit;

wp_clear_scheduled_hook('cvt_cycle');
delete_transient('cvt_license_ok');
delete_option('cvt_license_ok_at');

// Événements, commandes et billets ne sont supprimés que si l'administrateur l'a demandé dans les réglages.
$o = get_option('cvt_settings', []);
if (is_array($o) && !empty($o['delete_on_uninstall'])) {
  global $wpdb;
  foreach (get_posts(['post_type' => 'cvt_event', 'post_status' => 'any', 'numberposts' => -1, 'fields' => 'ids']) as $id) wp_delete_post($id, true);
  $wpdb->query('DROP TABLE IF EXISTS ' . $wpdb->prefix . 'cvt_tickets');
  $wpdb->query('DROP TABLE IF EXISTS ' . $wpdb->prefix . 'cvt_orders');
  delete_option('cvt_settings'); delete_option('cvt_db_version'); delete_option('cvt_hook_url'); delete_transient('cvt_hook_try');
}
