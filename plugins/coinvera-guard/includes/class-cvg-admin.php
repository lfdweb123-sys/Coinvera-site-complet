<?php
if (!defined('ABSPATH')) exit;

/** Administration : réglages, journal des tentatives bloquées/signalées, licence. Chaque action exige une capacité
 *  ET un nonce ; les opérations passent par POST. */
final class CVG_Admin {
  const CAP = 'manage_options';
  const PER = 30;
  const NOTICES = [
    'saved' => ['success', 'Réglages enregistrés.'], 'allowed' => ['success', 'Ajouté à la liste blanche.'], 'blocked' => ['success', 'Ajouté à la liste noire.'],
    'lic_ok' => ['success', 'Licence Coinvera activée pour ce site.'], 'lic_bad' => ['error', 'Licence non valide, ou limite d’activations atteinte pour cette licence.'],
    'lic_net' => ['warning', 'Impossible de joindre le serveur de licences. Réessayez.'],
  ];
  private static $reasons = [
    'ip_blocklisted' => 'IP sur liste noire', 'email_blocklisted' => 'E-mail sur liste noire', 'cooldown' => 'IP en refroidissement (blocage précédent)',
    'velocity_orders' => 'Trop de commandes (vélocité)', 'velocity_fail' => 'Trop d’échecs de paiement (vélocité)', 'disposable_email' => 'E-mail jetable/temporaire',
    'risky_ip' => 'IP signalée à risque (filtre externe)', 'payment_failed' => 'Paiement échoué',
  ];

  public static function init() {
    add_action('admin_menu', [__CLASS__, 'menu']);
    add_action('admin_notices', [__CLASS__, 'notices']);
    foreach (['save_settings', 'allow', 'block'] as $a) add_action('admin_post_cvg_' . $a, [__CLASS__, $a]);
    add_filter('plugin_action_links_' . CVG_SLUG, function ($l) { array_unshift($l, '<a href="' . esc_url(admin_url('admin.php?page=cvg-settings')) . '">Réglages</a>'); return $l; });
  }

  public static function menu() {
    $cap = apply_filters('cvg_capability', self::CAP);
    add_menu_page('Coinvera Guard', 'Coinvera Guard', $cap, 'cvg-events', [__CLASS__, 'page_events'], 'dashicons-shield', 58);
    add_submenu_page('cvg-events', 'Tentatives', 'Tentatives', $cap, 'cvg-events', [__CLASS__, 'page_events']);
    add_submenu_page('cvg-events', 'Réglages', 'Réglages', $cap, 'cvg-settings', [__CLASS__, 'page_settings']);
  }
  private static function guard() { if (!current_user_can(apply_filters('cvg_capability', self::CAP))) wp_die('Accès refusé.', 403); }
  private static function back($page, $codes) { wp_safe_redirect(add_query_arg(['page' => $page, 'cvg_n' => is_array($codes) ? implode(',', $codes) : $codes], admin_url('admin.php'))); exit; }

  public static function notices() {
    $screen = get_current_screen(); if (!$screen || strpos((string) $screen->id, 'cvg-') === false) return;
    $codes = isset($_GET['cvg_n']) ? explode(',', sanitize_text_field(wp_unslash($_GET['cvg_n']))) : [];
    foreach (array_slice($codes, 0, 3) as $n) { $n = sanitize_key($n); if (isset(self::NOTICES[$n])) printf('<div class="notice notice-%s is-dismissible"><p>%s</p></div>', esc_attr(self::NOTICES[$n][0]), esc_html(self::NOTICES[$n][1])); }
    if (!CVG_Settings::license_set()) echo '<div class="notice notice-warning"><p>Renseignez votre licence dans <a href="' . esc_url(admin_url('admin.php?page=cvg-settings')) . '">Réglages</a> pour activer Coinvera Guard.</p></div>';
    elseif (!CVG_Woo::present()) echo '<div class="notice notice-error"><p>WooCommerce n’est pas actif : Coinvera Guard ne protège aucun checkout pour le moment.</p></div>';
  }

  // ---------- Journal des tentatives ----------
  public static function page_events() {
    self::guard();
    $filter = isset($_GET['a']) ? sanitize_key(wp_unslash($_GET['a'])) : '';
    if (!in_array($filter, ['blocked', 'flagged'], true)) $filter = '';
    $page = max(1, isset($_GET['paged']) ? absint($_GET['paged']) : 1);
    $res = CVG_DB::recent($page, self::PER, $filter); $stats = CVG_DB::stats();

    echo '<div class="wrap"><h1>Coinvera Guard — Tentatives</h1>';
    printf('<p><strong>Bloquées aujourd’hui :</strong> %d &nbsp; <strong>Bloquées (7 j) :</strong> %d &nbsp; <strong>Signalées (7 j) :</strong> %d</p>', $stats['blocked_today'], $stats['blocked_7d'], $stats['flagged_7d']);
    echo '<ul class="subsubsub">'; $labels = ['' => 'Toutes', 'blocked' => 'Bloquées', 'flagged' => 'Signalées'];
    $i = 0; foreach ($labels as $k => $l) { printf('%s<li><a href="%s"%s>%s</a></li>', $i++ ? ' | ' : '', esc_url(add_query_arg(['page' => 'cvg-events', 'a' => $k], admin_url('admin.php'))), $k === $filter ? ' class="current"' : '', esc_html($l)); }
    echo '</ul>';
    echo '<table class="widefat striped" style="margin-top:12px"><thead><tr><th>Date</th><th>Contexte</th><th>Action</th><th>Motif</th><th>IP</th><th>E-mail</th><th>Commande</th><th>Ajouter aux listes</th></tr></thead><tbody>';
    if (!$res['rows']) echo '<tr><td colspan="8">Aucune tentative enregistrée.</td></tr>';
    foreach ($res['rows'] as $r) {
      $ctx = $r->context === 'checkout' ? 'Checkout' : 'Paiement'; $act = $r->action === 'blocked' ? '<strong style="color:#b32d2e">Bloquée</strong>' : 'Signalée';
      $order_link = $r->order_id ? '<a href="' . esc_url(admin_url('admin.php?page=wc-orders&action=edit&id=' . (int) $r->order_id)) . '">#' . (int) $r->order_id . '</a>' : '—';
      echo '<tr><td>' . esc_html(get_date_from_gmt($r->created_at, 'd/m/Y H:i')) . '</td><td>' . esc_html($ctx) . '</td><td>' . wp_kses_post($act) . '</td><td>' . esc_html(self::$reasons[$r->reason] ?? $r->reason) . '</td><td>' . esc_html($r->ip) . '</td><td>' . esc_html($r->email ?: '—') . '</td><td>' . wp_kses_post($order_link) . '</td><td>' . self::quick_forms($r->ip, $r->email) . '</td></tr>';
    }
    echo '</tbody></table>';
    $pages = (int) ceil($res['total'] / self::PER);
    if ($pages > 1) echo '<div class="tablenav"><div class="tablenav-pages">' . wp_kses_post(paginate_links(['base' => add_query_arg('paged', '%#%'), 'format' => '', 'current' => $page, 'total' => $pages])) . '</div></div>';
    echo '</div>';
  }
  private static function quick_forms($ip, $email) {
    $f = function ($action, $value, $kind, $label) {
      return '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '" style="display:inline-block;margin-right:6px">'
        . '<input type="hidden" name="action" value="' . esc_attr('cvg_' . $action) . '"><input type="hidden" name="value" value="' . esc_attr($value) . '"><input type="hidden" name="kind" value="' . esc_attr($kind) . '">'
        . wp_nonce_field('cvg_list_' . $action, '_wpnonce', false, false) . '<button type="submit" class="button button-small">' . esc_html($label) . '</button></form>';
    };
    $out = $f('allow', $ip, 'ip', 'Autoriser cette IP');
    if ($email) $out .= $f('allow', $email, 'email', 'Autoriser cet e-mail');
    $out .= $f('block', $ip, 'ip', 'Bloquer cette IP');
    return $out;
  }
  public static function allow() { self::list_op('whitelist'); }
  public static function block() { self::list_op('blocklist'); }
  private static function list_op($which) {
    self::guard();
    $action = $which === 'whitelist' ? 'allow' : 'block';
    check_admin_referer('cvg_' . $action, '_wpnonce');
    $kind = isset($_POST['kind']) && $_POST['kind'] === 'email' ? 'email' : 'ip';
    $value = isset($_POST['value']) ? sanitize_text_field(wp_unslash((string) $_POST['value'])) : '';
    if ($value === '') self::back('cvg-events', 'cvg_bad');
    $key = $which . '_' . ($kind === 'email' ? 'emails' : 'ips');
    $cur = trim((string) CVG_Settings::get($key));
    $lines = $cur === '' ? [] : preg_split('/[\r\n]+/', $cur);
    if (!in_array($value, $lines, true)) { $lines[] = $value; CVG_Settings::update([$key => implode("\n", array_slice($lines, -500))]); }
    self::back('cvg-events', $which === 'whitelist' ? 'allowed' : 'blocked');
  }

  // ---------- Réglages ----------
  public static function page_settings() {
    self::guard(); $s = CVG_Settings::all();
    echo '<div class="wrap"><h1>Coinvera Guard — Réglages</h1>';
    echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
    wp_nonce_field('cvg_save_settings'); echo '<input type="hidden" name="action" value="cvg_save_settings">';
    echo '<table class="form-table"><tbody>';
    self::row_check('enabled', 'Protection active', $s['enabled'], 'Désactive totalement Coinvera Guard si décoché (aucun blocage, aucune journalisation).');
    self::row_text('license_key', 'Clé de licence', $s['license_key'], 'Même licence que les autres plugins Coinvera.');
    echo '<tr><th colspan="2"><h2>Vélocité (card testing)</h2></th></tr>';
    self::row_num('order_limit', 'Commandes maximum', $s['order_limit'], 'Par IP, dans la fenêtre ci-dessous.');
    self::row_num('order_window', 'Fenêtre (secondes)', $s['order_window'], '');
    self::row_num('fail_limit', 'Paiements échoués maximum', $s['fail_limit'], 'Par IP, dans la fenêtre ci-dessous.');
    self::row_num('fail_window', 'Fenêtre (secondes)', $s['fail_window'], '');
    self::row_num('cooldown_minutes', 'Refroidissement (minutes)', $s['cooldown_minutes'], 'Durée du blocage une fois le seuil atteint.');
    echo '<tr><th colspan="2"><h2>Autres signaux</h2></th></tr>';
    self::row_select('disposable_action', 'E-mails jetables', $s['disposable_action'], 'Détecte les domaines de messagerie temporaire les plus connus.');
    self::row_select('risky_action', 'IP à risque (filtre externe)', $s['risky_action'], 'Actif seulement si un autre plugin/thème branche le filtre cvg_ip_is_risky (ex. un service de détection VPN/proxy).');
    echo '<tr><th colspan="2"><h2>Listes manuelles</h2></th></tr>';
    self::row_area('whitelist_ips', 'IP toujours autorisées', $s['whitelist_ips'], 'Une par ligne.');
    self::row_area('whitelist_emails', 'E-mails toujours autorisés', $s['whitelist_emails'], 'Une adresse par ligne, ou @domaine.tld pour tout un domaine.');
    self::row_area('blocklist_ips', 'IP toujours bloquées', $s['blocklist_ips'], 'Une par ligne.');
    self::row_area('blocklist_emails', 'E-mails toujours bloqués', $s['blocklist_emails'], 'Une adresse par ligne, ou @domaine.tld pour tout un domaine.');
    echo '<tr><th colspan="2"><h2>Notifications</h2></th></tr>';
    self::row_check('notify_admin', 'M’alerter par e-mail en cas de blocage', $s['notify_admin'], 'Au plus un e-mail toutes les 30 minutes, même en cas d’attaque prolongée.');
    self::row_text('notify_email', 'Adresse de notification', $s['notify_email'], 'Laisser vide pour utiliser l’adresse admin du site.');
    self::row_check('delete_on_uninstall', 'Supprimer le journal à la désinstallation', $s['delete_on_uninstall'], '');
    echo '</tbody></table>';
    submit_button('Enregistrer'); echo '</form></div>';
  }
  private static function row_check($k, $label, $v, $help) { printf('<tr><th>%s</th><td><label><input type="checkbox" name="%s" value="1"%s> %s</label></td></tr>', esc_html($label), esc_attr($k), $v ? ' checked' : '', esc_html($help)); }
  private static function row_text($k, $label, $v, $help) { printf('<tr><th>%s</th><td><input type="text" class="regular-text" name="%s" value="%s"><p class="description">%s</p></td></tr>', esc_html($label), esc_attr($k), esc_attr($v), esc_html($help)); }
  private static function row_num($k, $label, $v, $help) { printf('<tr><th>%s</th><td><input type="number" min="1" name="%s" value="%d"><p class="description">%s</p></td></tr>', esc_html($label), esc_attr($k), (int) $v, esc_html($help)); }
  private static function row_area($k, $label, $v, $help) { printf('<tr><th>%s</th><td><textarea name="%s" rows="4" class="large-text code">%s</textarea><p class="description">%s</p></td></tr>', esc_html($label), esc_attr($k), esc_textarea($v), esc_html($help)); }
  private static function row_select($k, $label, $v, $help) {
    $opts = ['block' => 'Bloquer', 'log' => 'Laisser passer mais signaler', 'off' => 'Désactivé'];
    printf('<tr><th>%s</th><td><select name="%s">', esc_html($label), esc_attr($k));
    foreach ($opts as $ov => $ol) printf('<option value="%s"%s>%s</option>', esc_attr($ov), $ov === $v ? ' selected' : '', esc_html($ol));
    printf('</select><p class="description">%s</p></td></tr>', esc_html($help));
  }

  public static function save_settings() {
    self::guard(); check_admin_referer('cvg_save_settings');
    $p = fn($k) => isset($_POST[$k]) && is_scalar($_POST[$k]) ? sanitize_text_field(wp_unslash((string) $_POST[$k])) : '';
    $area = fn($k) => isset($_POST[$k]) && is_scalar($_POST[$k]) ? sanitize_textarea_field(wp_unslash((string) $_POST[$k])) : '';
    CVG_Settings::update([
      'enabled' => isset($_POST['enabled']) ? 1 : 0, 'license_key' => mb_substr($p('license_key'), 0, 80),
      'order_limit' => max(1, (int) $p('order_limit')), 'order_window' => max(60, (int) $p('order_window')),
      'fail_limit' => max(1, (int) $p('fail_limit')), 'fail_window' => max(60, (int) $p('fail_window')), 'cooldown_minutes' => max(1, (int) $p('cooldown_minutes')),
      'disposable_action' => in_array($p('disposable_action'), ['block', 'log', 'off'], true) ? $p('disposable_action') : 'off',
      'risky_action' => in_array($p('risky_action'), ['block', 'log', 'off'], true) ? $p('risky_action') : 'off',
      'whitelist_ips' => $area('whitelist_ips'), 'whitelist_emails' => $area('whitelist_emails'), 'blocklist_ips' => $area('blocklist_ips'), 'blocklist_emails' => $area('blocklist_emails'),
      'notify_admin' => isset($_POST['notify_admin']) ? 1 : 0, 'notify_email' => mb_substr($p('notify_email'), 0, 190), 'delete_on_uninstall' => isset($_POST['delete_on_uninstall']) ? 1 : 0,
    ]);
    delete_transient('cvg_license_ok');
    $codes = [];
    if (strlen((string) CVG_Settings::get('license_key')) >= 10) { $r = CVG_API::license('activate'); $codes[] = is_wp_error($r) ? 'lic_net' : (!empty($r['valid']) ? 'lic_ok' : 'lic_bad'); }
    self::back('cvg-settings', $codes ?: ['saved']);
  }
}
