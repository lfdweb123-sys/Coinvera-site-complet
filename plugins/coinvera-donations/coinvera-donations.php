<?php
/**
 * Plugin Name: Coinvera Donations
 * Description: Dons et cagnottes par carte via Coinvera, avec confirmation vérifiée côté serveur. Fonctionne seul ou avec WooCommerce. Utilise la même licence que le plugin WooCommerce.
 * Version: 1.1.0
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * Text Domain: coinvera-donations
 * Domain Path: /languages
 */
if (!defined('ABSPATH')) exit;

define('CVD_VERSION', '1.1.0');
define('CVD_FILE', __FILE__);
define('CVD_DIR', plugin_dir_path(__FILE__));
define('CVD_URL', plugin_dir_url(__FILE__));
define('CVD_SLUG', 'coinvera-donations/coinvera-donations.php');

foreach (['util', 'settings', 'api', 'db', 'campaigns', 'confirm', 'woo', 'front', 'admin', 'privacy'] as $f) require_once CVD_DIR . "includes/class-cvd-$f.php";

// Doit être déclaré dès le chargement du fichier : l'activation du plugin a lieu avant "plugins_loaded".
add_filter('cron_schedules', function ($s) { $s['cvd_5min'] = ['interval' => 300, 'display' => 'Toutes les 5 minutes']; return $s; });

// Déclarations de compatibilité WooCommerce (commandes en tables dédiées, panier et paiement en blocs).
add_action('before_woocommerce_init', function () {
  if (class_exists('Automattic\\WooCommerce\\Utilities\\FeaturesUtil')) {
    \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('custom_order_tables', CVD_FILE, true);
    \Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility('cart_checkout_blocks', CVD_FILE, true);
  }
});

register_activation_hook(__FILE__, function () {
  CVD_DB::install();
  if (!wp_next_scheduled('cvd_check_donations')) wp_schedule_event(time() + 60, 'cvd_5min', 'cvd_check_donations');
});
register_deactivation_hook(__FILE__, function () {
  wp_clear_scheduled_hook('cvd_check_donations');
  CVD_API::license('deactivate');   // libère l'emplacement du site
  delete_transient('cvd_license_ok');
});

add_action('plugins_loaded', function () {
  load_plugin_textdomain('coinvera-donations', false, dirname(plugin_basename(__FILE__)) . '/languages');
  CVD_DB::maybe_upgrade();
  CVD_Campaigns::init();
  CVD_Confirm::init();
  CVD_Woo::init();
  CVD_Front::init();
  CVD_Admin::init();
  CVD_Privacy::init();
});

// Mises à jour : interroge l'API Coinvera pour la dernière version publiée (même canal que le plugin WooCommerce).
add_filter('pre_set_site_transient_update_plugins', function ($t) {
  if (!is_object($t) || empty($t->checked)) return $t;
  $r = wp_remote_get(CVD_API::base() . '/license/update?plugin=donations', ['timeout' => 10, 'redirection' => 0]);
  if (is_wp_error($r) || wp_remote_retrieve_response_code($r) !== 200) return $t;
  $d = json_decode(wp_remote_retrieve_body($r), true);
  if (!is_array($d) || empty($d['version']) || empty($d['download_url'])) return $t;
  // Le paquet doit venir d'un hôte Coinvera en HTTPS (protège contre une réponse d'API détournée).
  $u = wp_parse_url((string) $d['download_url']); $h = strtolower($u['host'] ?? '');
  $ok = ($u['scheme'] ?? '') === 'https' && $h !== '' && ($h === 'coinvera.me' || substr($h, -12) === '.coinvera.me' || $h === wp_parse_url(CVD_API::base(), PHP_URL_HOST));
  if ($ok && version_compare((string) $d['version'], CVD_VERSION, '>'))
    $t->response[CVD_SLUG] = (object) ['slug' => 'coinvera-donations', 'plugin' => CVD_SLUG, 'new_version' => (string) $d['version'], 'package' => esc_url_raw($d['download_url'])];
  return $t;
});
