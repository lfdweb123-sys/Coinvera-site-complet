<?php
/**
 * Plugin Name: Coinvera E-Invoice
 * Description: Factures électroniques conformes (Factur-X, norme européenne EN 16931) et TVA calculée en temps réel selon l'adresse et l'IP du client, pour WooCommerce. Utilise la même licence que les autres plugins Coinvera.
 * Version: 1.0.0
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * Requires Plugins: woocommerce
 * Text Domain: coinvera-einvoice
 * Domain Path: /languages
 */
if (!defined('ABSPATH')) exit;

define('CVE_VERSION', '1.0.0');
define('CVE_FILE', __FILE__);
define('CVE_DIR', plugin_dir_path(__FILE__));
define('CVE_SLUG', 'coinvera-einvoice/coinvera-einvoice.php');

foreach (['util', 'tax', 'calc', 'cii', 'font', 'pdf', 'render', 'settings', 'api', 'db', 'woo', 'admin', 'privacy'] as $f) require_once CVE_DIR . "includes/class-cve-$f.php";

add_action('before_woocommerce_init', function () {
  if (class_exists('Automattic\\WooCommerce\\Utilities\\FeaturesUtil')) {
    \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('custom_order_tables', CVE_FILE, true);
    \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('cart_checkout_blocks', CVE_FILE, true);
  }
});

register_activation_hook(__FILE__, function () { CVE_DB::install(); CVE_DB::dir(); });
register_deactivation_hook(__FILE__, function () { CVE_API::license('deactivate'); delete_transient('cve_license_ok'); });

add_action('plugins_loaded', function () {
  load_plugin_textdomain('coinvera-einvoice', false, dirname(plugin_basename(__FILE__)) . '/languages');
  CVE_DB::maybe_upgrade();
  CVE_Woo::init();
  CVE_Admin::init();
  CVE_Privacy::init();
});

add_filter('pre_set_site_transient_update_plugins', function ($t) {
  if (!is_object($t) || empty($t->checked)) return $t;
  $r = wp_remote_get(CVE_API::base() . '/license/update?plugin=einvoice', ['timeout' => 10, 'redirection' => 0]);
  if (is_wp_error($r) || wp_remote_retrieve_response_code($r) !== 200) return $t;
  $d = json_decode(wp_remote_retrieve_body($r), true);
  if (!is_array($d) || empty($d['version']) || empty($d['download_url'])) return $t;
  $u = wp_parse_url((string) $d['download_url']); $h = strtolower($u['host'] ?? '');
  $ok = ($u['scheme'] ?? '') === 'https' && $h !== '' && ($h === 'coinvera.me' || substr($h, -12) === '.coinvera.me' || $h === wp_parse_url(CVE_API::base(), PHP_URL_HOST));
  if ($ok && version_compare((string) $d['version'], CVE_VERSION, '>'))
    $t->response[CVE_SLUG] = (object) ['slug' => 'coinvera-einvoice', 'plugin' => CVE_SLUG, 'new_version' => (string) $d['version'], 'package' => esc_url_raw($d['download_url'])];
  return $t;
});

add_action('admin_notices', function () {
  if (!current_user_can('activate_plugins') || class_exists('WooCommerce')) return;
  $screen = get_current_screen();
  if ($screen && strpos((string) $screen->id, 'plugins') !== false) echo '<div class="notice notice-warning"><p>Coinvera E-Invoice nécessite WooCommerce pour émettre vos factures.</p></div>';
});
