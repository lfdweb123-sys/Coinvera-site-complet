<?php
/**
 * Plugin Name: Coinvera COD
 * Description: Paiement à la livraison sécurisé pour WooCommerce : confirmation de chaque commande par WhatsApp avant expédition et score de fiabilité des clients. Utilise la même licence que les autres plugins Coinvera.
 * Version: 1.0.0
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * Requires Plugins: woocommerce
 * Text Domain: coinvera-cod
 * Domain Path: /languages
 */
if (!defined('ABSPATH')) exit;

define('CVC_VERSION', '1.0.0');
define('CVC_FILE', __FILE__);
define('CVC_DIR', plugin_dir_path(__FILE__));
define('CVC_URL', plugin_dir_url(__FILE__));
define('CVC_SLUG', 'coinvera-cod/coinvera-cod.php');

foreach (['settings', 'api', 'db', 'score', 'woo', 'admin', 'privacy'] as $f) require_once CVC_DIR . "includes/class-cvc-$f.php";

// Doit être déclaré dès le chargement du fichier : l'activation du plugin a lieu avant "plugins_loaded".
add_filter('cron_schedules', function ($s) {
  $s['cvc_half_hour'] = ['interval' => 30 * MINUTE_IN_SECONDS, 'display' => 'Toutes les 30 minutes (Coinvera COD)'];
  $s['cvc_daily'] = ['interval' => DAY_IN_SECONDS, 'display' => 'Une fois par jour (Coinvera COD)'];
  return $s;
});

add_action('before_woocommerce_init', function () {
  if (class_exists('Automattic\\WooCommerce\\Utilities\\FeaturesUtil')) {
    \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('custom_order_tables', CVC_FILE, true);
    \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('cart_checkout_blocks', CVC_FILE, true);
  }
});

register_activation_hook(__FILE__, function () {
  CVC_DB::install();
  if (!wp_next_scheduled('cvc_scan')) wp_schedule_event(time() + 300, 'cvc_half_hour', 'cvc_scan');
  if (!wp_next_scheduled('cvc_cleanup')) wp_schedule_event(time() + 600, 'cvc_daily', 'cvc_cleanup');
});
register_deactivation_hook(__FILE__, function () {
  wp_clear_scheduled_hook('cvc_scan');
  wp_clear_scheduled_hook('cvc_cleanup');
  CVC_API::license('deactivate');   // libère l'emplacement du site (côté serveur, seulement si plus aucun plugin Coinvera n'en a besoin)
  delete_transient('cvc_license_ok');
});

add_action('plugins_loaded', function () {
  load_plugin_textdomain('coinvera-cod', false, dirname(plugin_basename(__FILE__)) . '/languages');
  CVC_DB::maybe_upgrade();
  CVC_Woo::init();
  CVC_Admin::init();
  CVC_Privacy::init();
});

add_action('cvc_scan', ['CVC_Woo', 'scan_expired']);
add_action('cvc_cleanup', ['CVC_DB', 'prune']);

add_filter('pre_set_site_transient_update_plugins', function ($t) {
  if (!is_object($t) || empty($t->checked)) return $t;
  $r = wp_remote_get(CVC_API::base() . '/license/update?plugin=cod', ['timeout' => 10, 'redirection' => 0]);
  if (is_wp_error($r) || wp_remote_retrieve_response_code($r) !== 200) return $t;
  $d = json_decode(wp_remote_retrieve_body($r), true);
  if (!is_array($d) || empty($d['version']) || empty($d['download_url'])) return $t;
  $u = wp_parse_url((string) $d['download_url']); $h = strtolower($u['host'] ?? '');
  $ok = ($u['scheme'] ?? '') === 'https' && $h !== '' && ($h === 'coinvera.me' || substr($h, -12) === '.coinvera.me' || $h === wp_parse_url(CVC_API::base(), PHP_URL_HOST));
  if ($ok && version_compare((string) $d['version'], CVC_VERSION, '>'))
    $t->response[CVC_SLUG] = (object) ['slug' => 'coinvera-cod', 'plugin' => CVC_SLUG, 'new_version' => (string) $d['version'], 'package' => esc_url_raw($d['download_url'])];
  return $t;
});

add_action('admin_notices', function () {
  if (!current_user_can('activate_plugins') || class_exists('WooCommerce')) return;
  $screen = get_current_screen();
  if ($screen && strpos((string) $screen->id, 'plugins') !== false) echo '<div class="notice notice-warning"><p>Coinvera COD nécessite WooCommerce pour confirmer vos commandes.</p></div>';
});
