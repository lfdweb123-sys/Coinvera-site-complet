<?php
/**
 * Plugin Name: Coinvera Returns
 * Description: Portail client en libre-service pour les retours et échanges WooCommerce, avec avoir immédiat (bonus inclus) ou remboursement soumis à validation. Utilise la même licence que les autres plugins Coinvera.
 * Version: 1.0.0
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * Requires Plugins: woocommerce
 * Text Domain: coinvera-returns
 * Domain Path: /languages
 */
if (!defined('ABSPATH')) exit;

define('CVX_VERSION', '1.0.0');
define('CVX_FILE', __FILE__);
define('CVX_DIR', plugin_dir_path(__FILE__));
define('CVX_URL', plugin_dir_url(__FILE__));
define('CVX_SLUG', 'coinvera-returns/coinvera-returns.php');

foreach (['util', 'settings', 'api', 'db', 'credit', 'account', 'admin', 'privacy'] as $f) require_once CVX_DIR . "includes/class-cvx-$f.php";

add_action('before_woocommerce_init', function () {
  if (class_exists('Automattic\\WooCommerce\\Utilities\\FeaturesUtil')) \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('custom_order_tables', CVX_FILE, true);
});

register_activation_hook(__FILE__, function () {
  CVX_DB::install();
  CVX_Account::add_endpoint();
  flush_rewrite_rules();   // l'onglet « Retours » n'apparaît qu'après le rafraîchissement des permaliens
});
register_deactivation_hook(__FILE__, function () {
  CVX_API::license('deactivate');
  delete_transient('cvx_license_ok');
  flush_rewrite_rules();
});

add_action('plugins_loaded', function () {
  load_plugin_textdomain('coinvera-returns', false, dirname(plugin_basename(__FILE__)) . '/languages');
  CVX_DB::maybe_upgrade();
  CVX_Account::init();
  CVX_Admin::init();
  CVX_Privacy::init();
});

add_filter('pre_set_site_transient_update_plugins', function ($t) {
  if (!is_object($t) || empty($t->checked)) return $t;
  $r = wp_remote_get(CVX_API::base() . '/license/update?plugin=returns', ['timeout' => 10, 'redirection' => 0]);
  if (is_wp_error($r) || wp_remote_retrieve_response_code($r) !== 200) return $t;
  $d = json_decode(wp_remote_retrieve_body($r), true);
  if (!is_array($d) || empty($d['version']) || empty($d['download_url'])) return $t;
  $u = wp_parse_url((string) $d['download_url']); $h = strtolower($u['host'] ?? '');
  $ok = ($u['scheme'] ?? '') === 'https' && $h !== '' && ($h === 'coinvera.me' || substr($h, -12) === '.coinvera.me' || $h === wp_parse_url(CVX_API::base(), PHP_URL_HOST));
  if ($ok && version_compare((string) $d['version'], CVX_VERSION, '>'))
    $t->response[CVX_SLUG] = (object) ['slug' => 'coinvera-returns', 'plugin' => CVX_SLUG, 'new_version' => (string) $d['version'], 'package' => esc_url_raw($d['download_url'])];
  return $t;
});

add_action('admin_notices', function () {
  if (!current_user_can('activate_plugins') || class_exists('WooCommerce')) return;
  $screen = get_current_screen();
  if ($screen && strpos((string) $screen->id, 'plugins') !== false) echo '<div class="notice notice-warning"><p>Coinvera Returns nécessite WooCommerce pour proposer des retours à vos clients.</p></div>';
});
