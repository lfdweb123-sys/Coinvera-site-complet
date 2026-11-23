<?php
/**
 * Plugin Name: Coinvera Reminders
 * Description: Relance automatique des commandes WooCommerce en attente de paiement et notifications de statut, par WhatsApp. Utilise la même licence que les autres plugins Coinvera.
 * Version: 1.0.0
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * Requires Plugins: woocommerce
 * Text Domain: coinvera-reminders
 * Domain Path: /languages
 */
if (!defined('ABSPATH')) exit;

define('CVR_VERSION', '1.0.0');
define('CVR_FILE', __FILE__);
define('CVR_DIR', plugin_dir_path(__FILE__));
define('CVR_URL', plugin_dir_url(__FILE__));
define('CVR_SLUG', 'coinvera-reminders/coinvera-reminders.php');

foreach (['settings', 'api', 'db', 'woo', 'admin', 'privacy'] as $f) require_once CVR_DIR . "includes/class-cvr-$f.php";

add_filter('cron_schedules', function ($s) { $s['cvr_ten_min'] = ['interval' => 10 * MINUTE_IN_SECONDS, 'display' => 'Toutes les 10 minutes (Coinvera Reminders)']; return $s; });

add_action('before_woocommerce_init', function () {
  if (class_exists('Automattic\\WooCommerce\\Utilities\\FeaturesUtil')) {
    \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('custom_order_tables', CVR_FILE, true);
    \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('cart_checkout_blocks', CVR_FILE, true);
  }
});

register_activation_hook(__FILE__, function () {
  CVR_DB::install();
  if (!wp_next_scheduled('cvr_scan_pending')) wp_schedule_event(time() + 300, 'cvr_ten_min', 'cvr_scan_pending');
});
register_deactivation_hook(__FILE__, function () {
  wp_clear_scheduled_hook('cvr_scan_pending');
  CVR_API::license('deactivate');
  delete_transient('cvr_license_ok');
});

add_action('plugins_loaded', function () {
  load_plugin_textdomain('coinvera-reminders', false, dirname(plugin_basename(__FILE__)) . '/languages');
  CVR_DB::maybe_upgrade();
  CVR_Woo::init();
  CVR_Admin::init();
  CVR_Privacy::init();
});

add_action('cvr_scan_pending', ['CVR_Woo', 'scan_pending_orders']);

add_filter('pre_set_site_transient_update_plugins', function ($t) {
  if (!is_object($t) || empty($t->checked)) return $t;
  $r = wp_remote_get(CVR_API::base() . '/license/update?plugin=reminders', ['timeout' => 10, 'redirection' => 0]);
  if (is_wp_error($r) || wp_remote_retrieve_response_code($r) !== 200) return $t;
  $d = json_decode(wp_remote_retrieve_body($r), true);
  if (!is_array($d) || empty($d['version']) || empty($d['download_url'])) return $t;
  $u = wp_parse_url((string) $d['download_url']); $h = strtolower($u['host'] ?? '');
  $ok = ($u['scheme'] ?? '') === 'https' && $h !== '' && ($h === 'coinvera.me' || substr($h, -12) === '.coinvera.me' || $h === wp_parse_url(CVR_API::base(), PHP_URL_HOST));
  if ($ok && version_compare((string) $d['version'], CVR_VERSION, '>'))
    $t->response[CVR_SLUG] = (object) ['slug' => 'coinvera-reminders', 'plugin' => CVR_SLUG, 'new_version' => (string) $d['version'], 'package' => esc_url_raw($d['download_url'])];
  return $t;
});

add_action('admin_notices', function () {
  if (!current_user_can('activate_plugins') || class_exists('WooCommerce')) return;
  $screen = get_current_screen();
  if ($screen && strpos((string) $screen->id, 'plugins') !== false) echo '<div class="notice notice-warning"><p>Coinvera Reminders nécessite WooCommerce pour relancer vos commandes.</p></div>';
});
