<?php
if (!defined('WP_UNINSTALL_PLUGIN')) exit;

wp_clear_scheduled_hook('cvs_check_payments');
wp_clear_scheduled_hook('cvs_cycle');
delete_transient('cvs_license_ok');
delete_option('cvs_license_ok_at');

// Plans, abonnements et paiements ne sont supprimés que si l'administrateur l'a demandé dans les réglages.
$o = get_option('cvs_settings', []);
if (is_array($o) && !empty($o['delete_on_uninstall'])) {
  global $wpdb;
  foreach (get_posts(['post_type' => 'cvs_plan', 'post_status' => 'any', 'numberposts' => -1, 'fields' => 'ids']) as $id) wp_delete_post($id, true);
  $wpdb->query('DROP TABLE IF EXISTS ' . $wpdb->prefix . 'cvs_charges');
  $wpdb->query('DROP TABLE IF EXISTS ' . $wpdb->prefix . 'cvs_subs');
  $wpdb->query("DELETE FROM {$wpdb->postmeta} WHERE meta_key IN ('_cvs_restricted','_cvs_plans')");
  delete_option('cvs_settings'); delete_option('cvs_db_version'); delete_option('cvs_hook_url'); delete_transient('cvs_hook_try');
}
