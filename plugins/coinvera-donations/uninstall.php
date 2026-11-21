<?php
if (!defined('WP_UNINSTALL_PLUGIN')) exit;

wp_clear_scheduled_hook('cvd_check_donations');
delete_transient('cvd_license_ok');
delete_option('cvd_license_ok_at');

// Les dons (données comptables) et les réglages ne sont supprimés que si l'administrateur l'a demandé dans les réglages.
$o = get_option('cvd_settings', []);
if (is_array($o) && !empty($o['delete_on_uninstall'])) {
  global $wpdb;
  $ids = get_posts(['post_type' => 'cvd_campaign', 'post_status' => 'any', 'numberposts' => -1, 'fields' => 'ids']);
  foreach ($ids as $id) wp_delete_post($id, true);
  $wpdb->query('DROP TABLE IF EXISTS ' . $wpdb->prefix . 'cvd_donations');
  delete_option('cvd_settings');
  delete_option('cvd_db_version');
  delete_option('cvd_hook_url');
  delete_transient('cvd_hook_try');
}
