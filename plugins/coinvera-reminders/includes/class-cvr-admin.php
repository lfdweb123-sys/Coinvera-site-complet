<?php
if (!defined('ABSPATH')) exit;

final class CVR_Admin {
  const CAP = 'manage_options';
  const PER = 30;
  const NOTICES = ['saved' => ['success', 'Réglages enregistrés.'], 'lic_ok' => ['success', 'Licence Coinvera activée pour ce site.'],
    'lic_bad' => ['error', 'Licence non valide, ou limite d’activations atteinte pour cette licence.'], 'lic_net' => ['warning', 'Impossible de joindre le serveur de licences. Réessayez.']];
  const STATUSES = ['processing' => 'En cours de traitement', 'completed' => 'Terminée', 'cancelled' => 'Annulée', 'refunded' => 'Remboursée', 'failed' => 'Échouée', 'on-hold' => 'En attente'];

  public static function init() {
    add_action('admin_menu', [__CLASS__, 'menu']);
    add_action('admin_notices', [__CLASS__, 'notices']);
    add_action('admin_post_cvr_save_settings', [__CLASS__, 'save_settings']);
    add_filter('plugin_action_links_' . CVR_SLUG, function ($l) { array_unshift($l, '<a href="' . esc_url(admin_url('admin.php?page=cvr-settings')) . '">Réglages</a>'); return $l; });
  }

  public static function menu() {
    $cap = apply_filters('cvr_capability', self::CAP);
    add_menu_page('Coinvera Reminders', 'Coinvera Reminders', $cap, 'cvr-log', [__CLASS__, 'page_log'], 'dashicons-whatsapp', 59);
    add_submenu_page('cvr-log', 'Journal', 'Journal', $cap, 'cvr-log', [__CLASS__, 'page_log']);
    add_submenu_page('cvr-log', 'Réglages', 'Réglages', $cap, 'cvr-settings', [__CLASS__, 'page_settings']);
  }
  private static function guard() { if (!current_user_can(apply_filters('cvr_capability', self::CAP))) wp_die('Accès refusé.', 403); }

  public static function notices() {
    $screen = get_current_screen(); if (!$screen || strpos((string) $screen->id, 'cvr-') === false) return;
    $codes = isset($_GET['cvr_n']) ? explode(',', sanitize_text_field(wp_unslash($_GET['cvr_n']))) : [];
    foreach (array_slice($codes, 0, 3) as $n) { $n = sanitize_key($n); if (isset(self::NOTICES[$n])) printf('<div class="notice notice-%s is-dismissible"><p>%s</p></div>', esc_attr(self::NOTICES[$n][0]), esc_html(self::NOTICES[$n][1])); }
    if (!CVR_Settings::license_set()) echo '<div class="notice notice-warning"><p>Renseignez votre licence dans <a href="' . esc_url(admin_url('admin.php?page=cvr-settings')) . '">Réglages</a> pour activer Coinvera Reminders.</p></div>';
    elseif (!CVR_Woo::present()) echo '<div class="notice notice-error"><p>WooCommerce n’est pas actif : Coinvera Reminders ne relance aucune commande pour le moment.</p></div>';
  }

  // ---------- Journal ----------
  public static function page_log() {
    self::guard(); $page = max(1, isset($_GET['paged']) ? absint($_GET['paged']) : 1);
    $res = CVR_DB::recent($page, self::PER); $stats = CVR_DB::stats();
    echo '<div class="wrap"><h1>Coinvera Reminders — Journal</h1>';
    printf('<p><strong>Envoyées (7 j) :</strong> %d &nbsp; <strong>Non envoyées (7 j) :</strong> %d</p>', $stats['sent_7d'], $stats['skipped_7d']);
    echo '<table class="widefat striped"><thead><tr><th>Date</th><th>Commande</th><th>Type</th><th>Résultat</th><th>Détail</th></tr></thead><tbody>';
    if (!$res['rows']) echo '<tr><td colspan="5">Aucune relance pour le moment.</td></tr>';
    foreach ($res['rows'] as $r) {
      $kind = $r->kind === 'cart' ? 'Relance panier' : 'Statut : ' . esc_html(self::STATUSES[substr($r->kind, 7)] ?? substr($r->kind, 7));
      $res_label = ['sent' => '<strong style="color:#1a7f37">Envoyée</strong>', 'failed' => '<strong style="color:#b32d2e">Échec</strong>', 'skipped' => 'Ignorée'][$r->status] ?? esc_html($r->status);
      $order_link = '<a href="' . esc_url(admin_url('admin.php?page=wc-orders&action=edit&id=' . (int) $r->order_id)) . '">#' . (int) $r->order_id . '</a>';
      echo '<tr><td>' . esc_html(get_date_from_gmt($r->created_at, 'd/m/Y H:i')) . '</td><td>' . wp_kses_post($order_link) . '</td><td>' . $kind . '</td><td>' . wp_kses_post($res_label) . '</td><td>' . esc_html($r->reason) . '</td></tr>';
    }
    echo '</tbody></table>';
    $pages = (int) ceil($res['total'] / self::PER);
    if ($pages > 1) echo '<div class="tablenav"><div class="tablenav-pages">' . wp_kses_post(paginate_links(['base' => add_query_arg('paged', '%#%'), 'format' => '', 'current' => $page, 'total' => $pages])) . '</div></div>';
    echo '</div>';
  }

  // ---------- Réglages ----------
  public static function page_settings() {
    self::guard(); $s = CVR_Settings::all();
    echo '<div class="wrap"><h1>Coinvera Reminders — Réglages</h1>';
    echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
    wp_nonce_field('cvr_save_settings'); echo '<input type="hidden" name="action" value="cvr_save_settings">';
    echo '<table class="form-table"><tbody>';
    self::row_check('enabled', 'Relances actives', $s['enabled'], 'Désactive totalement Coinvera Reminders si décoché.');
    self::row_text('license_key', 'Clé de licence', $s['license_key'], 'Même licence que les autres plugins Coinvera.');
    self::row_text('public_key', 'Clé publique API', $s['public_key'], 'La même que pour vos autres plugins Coinvera (tableau de bord → Clés API).');
    self::row_text('api_secret', 'Secret API', '', 'Laisser vide pour conserver le secret déjà enregistré.');
    echo '<tr><th colspan="2"><h2>Relance panier (commandes en attente)</h2></th></tr>';
    self::row_check('cart_enabled', 'Relancer les commandes en attente de paiement', $s['cart_enabled'], '');
    self::row_num('cart_delay_min', 'Délai avant relance (minutes)', $s['cart_delay_min'], '');
    self::row_check('consent_required', 'Exiger le consentement explicite au checkout', $s['consent_required'], 'Recommandé : la relance panier est classée « marketing » par Meta et requiert normalement l’accord du client.');
    echo '<tr><th colspan="2"><h2>Notifications de statut</h2></th></tr>';
    self::row_check('status_enabled', 'Notifier les clients des changements de statut', $s['status_enabled'], '');
    $cur = CVR_Settings::status_list();
    echo '<tr><th>Statuts notifiés</th><td>'; foreach (self::STATUSES as $k => $l) printf('<label style="display:block"><input type="checkbox" name="status_list[]" value="%s"%s> %s</label>', esc_attr($k), in_array($k, $cur, true) ? ' checked' : '', esc_html($l)); echo '</td></tr>';
    echo '<tr><th colspan="2"><h2>Autres</h2></th></tr>';
    self::row_check('delete_on_uninstall', 'Supprimer le journal à la désinstallation', $s['delete_on_uninstall'], '');
    echo '</tbody></table>';
    submit_button('Enregistrer'); echo '</form></div>';
  }
  private static function row_check($k, $label, $v, $help) { printf('<tr><th>%s</th><td><label><input type="checkbox" name="%s" value="1"%s> %s</label></td></tr>', esc_html($label), esc_attr($k), $v ? ' checked' : '', esc_html($help)); }
  private static function row_text($k, $label, $v, $help) { printf('<tr><th>%s</th><td><input type="text" class="regular-text" name="%s" value="%s"><p class="description">%s</p></td></tr>', esc_html($label), esc_attr($k), esc_attr($v), esc_html($help)); }
  private static function row_num($k, $label, $v, $help) { printf('<tr><th>%s</th><td><input type="number" min="5" name="%s" value="%d"><p class="description">%s</p></td></tr>', esc_html($label), esc_attr($k), (int) $v, esc_html($help)); }

  public static function save_settings() {
    self::guard(); check_admin_referer('cvr_save_settings');
    $p = fn($k) => isset($_POST[$k]) && is_scalar($_POST[$k]) ? sanitize_text_field(wp_unslash((string) $_POST[$k])) : '';
    $new = [
      'enabled' => isset($_POST['enabled']) ? 1 : 0, 'license_key' => mb_substr($p('license_key'), 0, 80), 'public_key' => mb_substr($p('public_key'), 0, 80),
      'cart_enabled' => isset($_POST['cart_enabled']) ? 1 : 0, 'cart_delay_min' => max(5, (int) $p('cart_delay_min')), 'consent_required' => isset($_POST['consent_required']) ? 1 : 0,
      'status_enabled' => isset($_POST['status_enabled']) ? 1 : 0,
      'status_list' => implode(',', array_intersect(array_map('sanitize_key', wp_unslash($_POST['status_list'] ?? [])), array_keys(self::STATUSES))),
      'delete_on_uninstall' => isset($_POST['delete_on_uninstall']) ? 1 : 0,
    ];
    $secret = $p('api_secret'); if ($secret !== '') $new['secret_enc'] = CVR_Settings::encrypt($secret);   // champ laissé vide : on garde le secret déjà enregistré
    CVR_Settings::update($new);
    delete_transient('cvr_license_ok');
    $codes = [];
    if (strlen((string) CVR_Settings::get('license_key')) >= 10) { $r = CVR_API::license('activate'); $codes[] = is_wp_error($r) ? 'lic_net' : (!empty($r['valid']) ? 'lic_ok' : 'lic_bad'); }
    wp_safe_redirect(add_query_arg(['page' => 'cvr-settings', 'cvr_n' => implode(',', $codes ?: ['saved'])], admin_url('admin.php'))); exit;
  }
}
