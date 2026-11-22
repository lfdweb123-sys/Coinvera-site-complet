<?php
/**
 * Plugin Name: Coinvera Subscriptions
 * Description: Abonnements par lien de paiement : échéances envoyées par e-mail, accès aux contenus réservés tant que la période est payée, relances et expiration automatiques. Utilise la même licence que les autres plugins Coinvera.
 * Version: 1.0.0
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * Text Domain: coinvera-subscriptions
 * Domain Path: /languages
 */
if (!defined('ABSPATH')) exit;

define('CVS_VERSION', '1.0.0');
define('CVS_FILE', __FILE__);
define('CVS_DIR', plugin_dir_path(__FILE__));
define('CVS_URL', plugin_dir_url(__FILE__));
define('CVS_SLUG', 'coinvera-subscriptions/coinvera-subscriptions.php');

foreach (['util', 'settings', 'api', 'db', 'plans', 'access', 'mail', 'pay', 'confirm', 'cycle', 'front', 'admin', 'privacy'] as $f) require_once CVS_DIR . "includes/class-cvs-$f.php";

/** Vrai si l'utilisateur a un abonnement valide (actif, ou en retard dans le délai de grâce). $plan_ids vide = n'importe quel plan. */
function cvs_user_has_access($user_id, $plan_ids = []) { return CVS_Access::has($user_id, $plan_ids); }

add_filter('cron_schedules', function ($s) { $s['cvs_5min'] = ['interval' => 300, 'display' => 'Toutes les 5 minutes']; return $s; });

register_activation_hook(__FILE__, function () {
  CVS_DB::install();
  if (!wp_next_scheduled('cvs_check_payments')) wp_schedule_event(time() + 60, 'cvs_5min', 'cvs_check_payments');
  if (!wp_next_scheduled('cvs_cycle')) wp_schedule_event(time() + 300, 'hourly', 'cvs_cycle');
});
register_deactivation_hook(__FILE__, function () {
  wp_clear_scheduled_hook('cvs_check_payments'); wp_clear_scheduled_hook('cvs_cycle');
  CVS_API::license('deactivate');   // libère l'emplacement du site (côté serveur, seulement si plus aucun plugin Coinvera n'en a besoin)
  delete_transient('cvs_license_ok');
});

add_action('plugins_loaded', function () {
  load_plugin_textdomain('coinvera-subscriptions', false, dirname(plugin_basename(__FILE__)) . '/languages');
  CVS_DB::maybe_upgrade(); CVS_Plans::init(); CVS_Confirm::init(); CVS_Cycle::init(); CVS_Front::init(); CVS_Admin::init(); CVS_Privacy::init();
  if (!wp_next_scheduled('cvs_cycle')) wp_schedule_event(time() + 300, 'hourly', 'cvs_cycle');
});

add_filter('pre_set_site_transient_update_plugins', function ($t) {
  if (!is_object($t) || empty($t->checked)) return $t;
  $r = wp_remote_get(CVS_API::base() . '/license/update?plugin=subscriptions', ['timeout' => 10, 'redirection' => 0]);
  if (is_wp_error($r) || wp_remote_retrieve_response_code($r) !== 200) return $t;
  $d = json_decode(wp_remote_retrieve_body($r), true);
  if (!is_array($d) || empty($d['version']) || empty($d['download_url'])) return $t;
  $u = wp_parse_url((string) $d['download_url']); $h = strtolower($u['host'] ?? '');
  $ok = ($u['scheme'] ?? '') === 'https' && $h !== '' && ($h === 'coinvera.me' || substr($h, -12) === '.coinvera.me' || $h === wp_parse_url(CVS_API::base(), PHP_URL_HOST));
  if ($ok && version_compare((string) $d['version'], CVS_VERSION, '>'))
    $t->response[CVS_SLUG] = (object) ['slug' => 'coinvera-subscriptions', 'plugin' => CVS_SLUG, 'new_version' => (string) $d['version'], 'package' => esc_url_raw($d['download_url'])];
  return $t;
});
