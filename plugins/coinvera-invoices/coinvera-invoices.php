<?php
/**
 * Plugin Name: Coinvera Invoices
 * Description: Factures numérotées avec lien de paiement par carte via Coinvera, statut « payée » automatique et relances automatiques. Utilise la même licence que les autres plugins Coinvera.
 * Version: 1.0.0
 * Requires at least: 5.8
 * Requires PHP: 7.4
 * Text Domain: coinvera-invoices
 * Domain Path: /languages
 */
if (!defined('ABSPATH')) exit;

define('CVI_VERSION', '1.0.0');
define('CVI_FILE', __FILE__);
define('CVI_DIR', plugin_dir_path(__FILE__));
define('CVI_URL', plugin_dir_url(__FILE__));
define('CVI_SLUG', 'coinvera-invoices/coinvera-invoices.php');

foreach (['util', 'settings', 'api', 'calc', 'db', 'mail', 'confirm', 'public', 'admin', 'privacy'] as $f) require_once CVI_DIR . "includes/class-cvi-$f.php";

// Doit être déclaré dès le chargement du fichier : l'activation du plugin a lieu avant "plugins_loaded".
add_filter('cron_schedules', function ($s) { $s['cvi_5min'] = ['interval' => 300, 'display' => 'Toutes les 5 minutes']; return $s; });

register_activation_hook(__FILE__, function () {
  CVI_DB::install();
  if (!wp_next_scheduled('cvi_check_payments')) wp_schedule_event(time() + 60, 'cvi_5min', 'cvi_check_payments');
  if (!wp_next_scheduled('cvi_reminders')) wp_schedule_event(time() + 300, 'daily', 'cvi_reminders');
});
register_deactivation_hook(__FILE__, function () {
  wp_clear_scheduled_hook('cvi_check_payments');
  wp_clear_scheduled_hook('cvi_reminders');
  CVI_API::license('deactivate');   // libère l'emplacement du site (côté serveur, seulement si plus aucun plugin Coinvera n'en a besoin)
  delete_transient('cvi_license_ok');
});

add_action('plugins_loaded', function () {
  load_plugin_textdomain('coinvera-invoices', false, dirname(plugin_basename(__FILE__)) . '/languages');
  CVI_DB::maybe_upgrade();
  CVI_Confirm::init();
  CVI_Mail::init();
  CVI_Public::init();
  CVI_Admin::init();
  CVI_Privacy::init();
});

// Mises à jour : interroge l'API Coinvera pour la dernière version publiée (même canal que les autres plugins).
add_filter('pre_set_site_transient_update_plugins', function ($t) {
  if (!is_object($t) || empty($t->checked)) return $t;
  $r = wp_remote_get(CVI_API::base() . '/license/update?plugin=invoices', ['timeout' => 10, 'redirection' => 0]);
  if (is_wp_error($r) || wp_remote_retrieve_response_code($r) !== 200) return $t;
  $d = json_decode(wp_remote_retrieve_body($r), true);
  if (!is_array($d) || empty($d['version']) || empty($d['download_url'])) return $t;
  // Le paquet doit venir d'un hôte Coinvera en HTTPS (protège contre une réponse d'API détournée).
  $u = wp_parse_url((string) $d['download_url']); $h = strtolower($u['host'] ?? '');
  $ok = ($u['scheme'] ?? '') === 'https' && $h !== '' && ($h === 'coinvera.me' || substr($h, -12) === '.coinvera.me' || $h === wp_parse_url(CVI_API::base(), PHP_URL_HOST));
  if ($ok && version_compare((string) $d['version'], CVI_VERSION, '>'))
    $t->response[CVI_SLUG] = (object) ['slug' => 'coinvera-invoices', 'plugin' => CVI_SLUG, 'new_version' => (string) $d['version'], 'package' => esc_url_raw($d['download_url'])];
  return $t;
});
