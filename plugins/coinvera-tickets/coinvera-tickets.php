<?php
/**
 * Plugin Name: Coinvera Tickets
 * Description: Billetterie d'événements : vente par carte via Coinvera, jauge garantie sans surbooking, billets avec QR code et contrôle d'entrée sur téléphone. Utilise la même licence que les autres plugins Coinvera.
 * Version: 1.0.0
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * Text Domain: coinvera-tickets
 * Domain Path: /languages
 */
if (!defined('ABSPATH')) exit;

define('CVT_VERSION', '1.0.0');
define('CVT_FILE', __FILE__);
define('CVT_DIR', plugin_dir_path(__FILE__));
define('CVT_URL', plugin_dir_url(__FILE__));
define('CVT_SLUG', 'coinvera-tickets/coinvera-tickets.php');

foreach (['util', 'settings', 'api', 'codes', 'db', 'events', 'mail', 'confirm', 'checkin', 'front', 'admin', 'privacy'] as $f) require_once CVT_DIR . "includes/class-cvt-$f.php";

add_filter('cron_schedules', function ($s) { $s['cvt_5min'] = ['interval' => 300, 'display' => 'Toutes les 5 minutes']; return $s; });

register_activation_hook(__FILE__, function () {
  CVT_DB::install();
  if (!wp_next_scheduled('cvt_cycle')) wp_schedule_event(time() + 60, 'cvt_5min', 'cvt_cycle');
});
register_deactivation_hook(__FILE__, function () {
  wp_clear_scheduled_hook('cvt_cycle');
  CVT_API::license('deactivate');   // libère l'emplacement du site (côté serveur, seulement si plus aucun plugin Coinvera n'en a besoin)
  delete_transient('cvt_license_ok');
});

add_action('plugins_loaded', function () {
  load_plugin_textdomain('coinvera-tickets', false, dirname(plugin_basename(__FILE__)) . '/languages');
  CVT_DB::maybe_upgrade(); CVT_Events::init(); CVT_Confirm::init(); CVT_Checkin::init(); CVT_Front::init(); CVT_Admin::init(); CVT_Privacy::init();
});

add_filter('pre_set_site_transient_update_plugins', function ($t) {
  if (!is_object($t) || empty($t->checked)) return $t;
  $r = wp_remote_get(CVT_API::base() . '/license/update?plugin=tickets', ['timeout' => 10, 'redirection' => 0]);
  if (is_wp_error($r) || wp_remote_retrieve_response_code($r) !== 200) return $t;
  $d = json_decode(wp_remote_retrieve_body($r), true);
  if (!is_array($d) || empty($d['version']) || empty($d['download_url'])) return $t;
  $u = wp_parse_url((string) $d['download_url']); $h = strtolower($u['host'] ?? '');
  $ok = ($u['scheme'] ?? '') === 'https' && $h !== '' && ($h === 'coinvera.me' || substr($h, -12) === '.coinvera.me' || $h === wp_parse_url(CVT_API::base(), PHP_URL_HOST));
  if ($ok && version_compare((string) $d['version'], CVT_VERSION, '>'))
    $t->response[CVT_SLUG] = (object) ['slug' => 'coinvera-tickets', 'plugin' => CVT_SLUG, 'new_version' => (string) $d['version'], 'package' => esc_url_raw($d['download_url'])];
  return $t;
});
