<?php
/**
 * Plugin Name: Coinvera Installments
 * Description: Paiement en 2 ou 3 fois et acompte pour WooCommerce, gérés par le marchand : échéances automatiques avec lien de paiement envoyé au client. Utilise la même licence que les autres plugins Coinvera.
 * Version: 1.0.0
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * Requires Plugins: woocommerce
 * Text Domain: coinvera-installments
 * Domain Path: /languages
 */
if (!defined('ABSPATH')) exit;

define('CVP_VERSION', '1.0.0');
define('CVP_FILE', __FILE__);
define('CVP_DIR', plugin_dir_path(__FILE__));
define('CVP_URL', plugin_dir_url(__FILE__));
define('CVP_SLUG', 'coinvera-installments/coinvera-installments.php');

foreach (['settings', 'api', 'db', 'woo', 'admin', 'privacy'] as $f) require_once CVP_DIR . "includes/class-cvp-$f.php";

add_action('before_woocommerce_init', function () {
  if (class_exists('Automattic\\WooCommerce\\Utilities\\FeaturesUtil')) {
    \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('custom_order_tables', CVP_FILE, true);
    // Le choix du plan se fait sur le checkout classique ; on le déclare honnêtement incompatible avec le checkout en blocs.
    \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('cart_checkout_blocks', CVP_FILE, false);
  }
});

register_activation_hook(__FILE__, function () {
  CVP_DB::install();
  if (!wp_next_scheduled('cvp_run')) wp_schedule_event(time() + 300, 'hourly', 'cvp_run');
});
register_deactivation_hook(__FILE__, function () {
  wp_clear_scheduled_hook('cvp_run');
  CVP_API::license('deactivate');   // libère l'emplacement du site (côté serveur, seulement si plus aucun plugin Coinvera n'en a besoin)
  delete_transient('cvp_license_ok');
});

add_action('plugins_loaded', function () {
  load_plugin_textdomain('coinvera-installments', false, dirname(plugin_basename(__FILE__)) . '/languages');
  CVP_DB::maybe_upgrade();
  CVP_Woo::init();
  CVP_Admin::init();
  CVP_Privacy::init();
});

add_action('cvp_run', ['CVP_Woo', 'run']);

add_filter('pre_set_site_transient_update_plugins', function ($t) {
  if (!is_object($t) || empty($t->checked)) return $t;
  $r = wp_remote_get(CVP_API::base() . '/license/update?plugin=installments', ['timeout' => 10, 'redirection' => 0]);
  if (is_wp_error($r) || wp_remote_retrieve_response_code($r) !== 200) return $t;
  $d = json_decode(wp_remote_retrieve_body($r), true);
  if (!is_array($d) || empty($d['version']) || empty($d['download_url'])) return $t;
  $u = wp_parse_url((string) $d['download_url']); $h = strtolower($u['host'] ?? '');
  $ok = ($u['scheme'] ?? '') === 'https' && $h !== '' && ($h === 'coinvera.me' || substr($h, -12) === '.coinvera.me' || $h === wp_parse_url(CVP_API::base(), PHP_URL_HOST));
  if ($ok && version_compare((string) $d['version'], CVP_VERSION, '>'))
    $t->response[CVP_SLUG] = (object) ['slug' => 'coinvera-installments', 'plugin' => CVP_SLUG, 'new_version' => (string) $d['version'], 'package' => esc_url_raw($d['download_url'])];
  return $t;
});

add_action('admin_notices', function () {
  if (!current_user_can('activate_plugins') || class_exists('WooCommerce')) return;
  $screen = get_current_screen();
  if ($screen && strpos((string) $screen->id, 'plugins') !== false) echo '<div class="notice notice-warning"><p>Coinvera Installments nécessite WooCommerce pour proposer le paiement en plusieurs fois.</p></div>';
});
