<?php
/**
 * Plugin Name: Coinvera Guard
 * Description: Protection invisible du checkout WooCommerce contre le card testing, les adresses jetables et les tentatives répétées, sans CAPTCHA. Utilise la même licence que les autres plugins Coinvera.
 * Version: 1.0.0
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * Requires Plugins: woocommerce
 * Text Domain: coinvera-guard
 * Domain Path: /languages
 */
if (!defined('ABSPATH')) exit;

define('CVG_VERSION', '1.0.0');
define('CVG_FILE', __FILE__);
define('CVG_DIR', plugin_dir_path(__FILE__));
define('CVG_URL', plugin_dir_url(__FILE__));
define('CVG_SLUG', 'coinvera-guard/coinvera-guard.php');

foreach (['util', 'settings', 'api', 'db', 'rules', 'woo', 'admin', 'privacy'] as $f) require_once CVG_DIR . "includes/class-cvg-$f.php";

// Doit être déclaré dès le chargement du fichier : l'activation du plugin a lieu avant "plugins_loaded".
add_filter('cron_schedules', function ($s) { $s['cvg_daily_cleanup'] = ['interval' => DAY_IN_SECONDS, 'display' => 'Une fois par jour (Coinvera Guard)']; return $s; });

// Déclarations de compatibilité WooCommerce (commandes en tables dédiées, panier et paiement en blocs) : nécessaire dès ce point,
// l'extension lit et écrit uniquement via l'API objet WC_Order, jamais get_post_meta / update_post_meta.
add_action('before_woocommerce_init', function () {
  if (class_exists('Automattic\\WooCommerce\\Utilities\\FeaturesUtil')) {
    \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('custom_order_tables', CVG_FILE, true);
    \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('cart_checkout_blocks', CVG_FILE, true);
  }
});

register_activation_hook(__FILE__, function () {
  CVG_DB::install();
  if (!wp_next_scheduled('cvg_cleanup')) wp_schedule_event(time() + 300, 'cvg_daily_cleanup', 'cvg_cleanup');
});
register_deactivation_hook(__FILE__, function () {
  wp_clear_scheduled_hook('cvg_cleanup');
  CVG_API::license('deactivate');   // libère l'emplacement du site (côté serveur, seulement si plus aucun plugin Coinvera n'en a besoin)
  delete_transient('cvg_license_ok');
});

add_action('plugins_loaded', function () {
  load_plugin_textdomain('coinvera-guard', false, dirname(plugin_basename(__FILE__)) . '/languages');
  CVG_DB::maybe_upgrade();
  CVG_Woo::init();
  CVG_Admin::init();
  CVG_Privacy::init();
});

add_action('cvg_cleanup', ['CVG_DB', 'prune']);

// Mises à jour : interroge l'API Coinvera pour la dernière version publiée (même canal que les autres plugins).
add_filter('pre_set_site_transient_update_plugins', function ($t) {
  if (!is_object($t) || empty($t->checked)) return $t;
  $r = wp_remote_get(CVG_API::base() . '/license/update?plugin=guard', ['timeout' => 10, 'redirection' => 0]);
  if (is_wp_error($r) || wp_remote_retrieve_response_code($r) !== 200) return $t;
  $d = json_decode(wp_remote_retrieve_body($r), true);
  if (!is_array($d) || empty($d['version']) || empty($d['download_url'])) return $t;
  // Le paquet doit venir d'un hôte Coinvera en HTTPS (protège contre une réponse d'API détournée).
  $u = wp_parse_url((string) $d['download_url']); $h = strtolower($u['host'] ?? '');
  $ok = ($u['scheme'] ?? '') === 'https' && $h !== '' && ($h === 'coinvera.me' || substr($h, -12) === '.coinvera.me' || $h === wp_parse_url(CVG_API::base(), PHP_URL_HOST));
  if ($ok && version_compare((string) $d['version'], CVG_VERSION, '>'))
    $t->response[CVG_SLUG] = (object) ['slug' => 'coinvera-guard', 'plugin' => CVG_SLUG, 'new_version' => (string) $d['version'], 'package' => esc_url_raw($d['download_url'])];
  return $t;
});

add_action('admin_notices', function () {
  if (!current_user_can('activate_plugins') || class_exists('WooCommerce')) return;
  $screen = get_current_screen();
  if ($screen && strpos((string) $screen->id, 'plugins') !== false) echo '<div class="notice notice-warning"><p>Coinvera Guard nécessite WooCommerce pour protéger votre checkout : installez-le et activez-le.</p></div>';
});
