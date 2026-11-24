<?php
if (!defined('WP_UNINSTALL_PLUGIN')) exit;

delete_transient('cve_license_ok');
delete_option('cve_license_ok_at');

$o = get_option('cve_settings', []);
if (is_array($o) && !empty($o['delete_on_uninstall'])) {
  global $wpdb;
  $name = (string) get_option('cve_dir', '');
  if ($name !== '' && preg_match('/^coinvera-einvoice-[a-f0-9]{16}$/', $name)) {
    $u = wp_upload_dir(); $d = trailingslashit($u['basedir']) . $name;
    if (is_dir($d)) { foreach ((array) glob($d . '/{,.}*', GLOB_BRACE) as $f) if (is_file($f)) @unlink($f); @rmdir($d); }
  }
  $wpdb->query('DROP TABLE IF EXISTS ' . $wpdb->prefix . 'cve_invoices');
  $wpdb->query('DROP TABLE IF EXISTS ' . $wpdb->prefix . 'cve_seq');
  delete_option('cve_settings'); delete_option('cve_db_version'); delete_option('cve_dir');
}
