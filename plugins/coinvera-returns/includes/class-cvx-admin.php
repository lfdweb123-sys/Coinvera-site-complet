<?php
if (!defined('ABSPATH')) exit;

final class CVX_Admin {
  const CAP = 'manage_options';
  const PER = 30;
  const TYPES = ['avoir' => 'Avoir', 'remboursement' => 'Remboursement', 'echange' => 'Échange'];
  const STATUSES = ['pending' => 'En attente', 'approved' => 'Approuvée', 'rejected' => 'Refusée', 'completed' => 'Traitée'];
  const NOTICES = ['saved' => ['success', 'Réglages enregistrés.'], 'approved' => ['success', 'Demande approuvée.'], 'rejected' => ['success', 'Demande refusée.'],
    'lic_ok' => ['success', 'Licence Coinvera activée pour ce site.'], 'lic_bad' => ['error', 'Licence non valide, ou limite d’activations atteinte pour cette licence.'], 'lic_net' => ['warning', 'Impossible de joindre le serveur de licences. Réessayez.']];

  public static function init() {
    add_action('admin_menu', [__CLASS__, 'menu']);
    add_action('admin_notices', [__CLASS__, 'notices']);
    add_action('admin_post_cvx_save_settings', [__CLASS__, 'save_settings']);
    foreach (['approve', 'reject'] as $a) add_action('admin_post_cvx_' . $a, [__CLASS__, $a]);
    add_filter('plugin_action_links_' . CVX_SLUG, function ($l) { array_unshift($l, '<a href="' . esc_url(admin_url('admin.php?page=cvx-settings')) . '">Réglages</a>'); return $l; });
  }

  public static function menu() {
    $cap = apply_filters('cvx_capability', self::CAP);
    add_menu_page('Coinvera Returns', 'Coinvera Returns', $cap, 'cvx-requests', [__CLASS__, 'page_requests'], 'dashicons-undo', 60);
    add_submenu_page('cvx-requests', 'Demandes', 'Demandes', $cap, 'cvx-requests', [__CLASS__, 'page_requests']);
    add_submenu_page('cvx-requests', 'Réglages', 'Réglages', $cap, 'cvx-settings', [__CLASS__, 'page_settings']);
  }
  private static function guard() { if (!current_user_can(apply_filters('cvx_capability', self::CAP))) wp_die('Accès refusé.', 403); }

  public static function notices() {
    $screen = get_current_screen(); if (!$screen || strpos((string) $screen->id, 'cvx-') === false) return;
    $codes = isset($_GET['cvx_n']) ? explode(',', sanitize_text_field(wp_unslash($_GET['cvx_n']))) : [];
    foreach (array_slice($codes, 0, 3) as $n) { $n = sanitize_key($n); if (isset(self::NOTICES[$n])) printf('<div class="notice notice-%s is-dismissible"><p>%s</p></div>', esc_attr(self::NOTICES[$n][0]), esc_html(self::NOTICES[$n][1])); }
    if (!CVX_Settings::license_set()) echo '<div class="notice notice-warning"><p>Renseignez votre licence dans <a href="' . esc_url(admin_url('admin.php?page=cvx-settings')) . '">Réglages</a> pour activer Coinvera Returns.</p></div>';
    elseif (!class_exists('WooCommerce')) echo '<div class="notice notice-error"><p>WooCommerce n’est pas actif : Coinvera Returns ne propose aucun retour pour le moment.</p></div>';
  }

  // ---------- Demandes ----------
  public static function page_requests() {
    self::guard();
    $status = isset($_GET['s']) ? sanitize_key(wp_unslash($_GET['s'])) : '';
    if (!isset(self::STATUSES[$status])) $status = '';
    $page = max(1, isset($_GET['paged']) ? absint($_GET['paged']) : 1);
    $res = CVX_DB::recent($page, self::PER, $status); $counts = CVX_DB::counts();
    echo '<div class="wrap"><h1>Coinvera Returns — Demandes</h1>';
    printf('<p>%s</p>', implode(' &nbsp; ', array_map(fn($k, $l) => '<strong>' . esc_html($l) . ' :</strong> ' . (int) ($counts[$k]->n ?? 0), array_keys(self::STATUSES), self::STATUSES)));
    echo '<ul class="subsubsub">'; $i = 0; foreach (['' => 'Toutes'] + self::STATUSES as $k => $l) { printf('%s<li><a href="%s"%s>%s</a></li>', $i++ ? ' | ' : '', esc_url(add_query_arg(['page' => 'cvx-requests', 's' => $k], admin_url('admin.php'))), $k === $status ? ' class="current"' : '', esc_html($l)); } echo '</ul>';
    echo '<table class="widefat striped" style="margin-top:12px"><thead><tr><th>Date</th><th>Commande</th><th>Type</th><th>Raison</th><th>Montant</th><th>Statut</th><th>Note client</th><th>Actions</th></tr></thead><tbody>';
    if (!$res['rows']) echo '<tr><td colspan="8">Aucune demande pour le moment.</td></tr>';
    foreach ($res['rows'] as $r) {
      $order_link = '<a href="' . esc_url(admin_url('admin.php?page=wc-orders&action=edit&id=' . (int) $r->order_id)) . '">#' . (int) $r->order_id . '</a>';
      $actions = '—';
      if ($r->status === 'pending') $actions = self::action_forms($r->id, $r->type === 'remboursement');
      echo '<tr><td>' . esc_html(get_date_from_gmt($r->created_at, 'd/m/Y H:i')) . '</td><td>' . wp_kses_post($order_link) . '</td><td>' . esc_html(self::TYPES[$r->type] ?? $r->type) . '</td><td>' . esc_html(CVX_Settings::REASONS[$r->reason] ?? $r->reason) . '</td><td>' . wp_kses_post(wc_price((float) $r->amount)) . '</td><td>' . esc_html(self::STATUSES[$r->status] ?? $r->status) . '</td><td>' . esc_html($r->note) . '</td><td>' . wp_kses_post($actions) . '</td></tr>';
    }
    echo '</tbody></table>';
    $pages = (int) ceil($res['total'] / self::PER);
    if ($pages > 1) echo '<div class="tablenav"><div class="tablenav-pages">' . wp_kses_post(paginate_links(['base' => add_query_arg('paged', '%#%'), 'format' => '', 'current' => $page, 'total' => $pages])) . '</div></div>';
    echo '</div>';
  }
  private static function action_forms($id, $is_refund) {
    $f = function ($action, $label, $class = 'button-small') use ($id) {
      return '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '" style="display:inline-block;margin-right:6px">'
        . '<input type="hidden" name="action" value="' . esc_attr('cvx_' . $action) . '"><input type="hidden" name="id" value="' . (int) $id . '">'
        . wp_nonce_field('cvx_' . $action . '_' . $id, '_wpnonce', false, false) . '<button type="submit" class="button ' . esc_attr($class) . '">' . esc_html($label) . '</button></form>';
    };
    return $f('approve', $is_refund ? 'Approuver le remboursement' : 'Marquer traité', 'button-primary button-small') . $f('reject', 'Refuser');
  }
  public static function approve() { self::decide('approved'); }
  public static function reject() { self::decide('rejected'); }
  private static function decide($new_status) {
    self::guard(); $id = isset($_POST['id']) ? absint($_POST['id']) : 0;
    check_admin_referer('cvx_' . ($new_status === 'approved' ? 'approve' : 'reject') . '_' . $id);
    $r = CVX_DB::get($id);
    if ($r && $r->status === 'pending') {
      if ($new_status === 'approved' && $r->type === 'remboursement') {
        $order = wc_get_order($r->order_id);
        if ($order) { $ref = CVX_Credit::record_refund($order, (float) $r->amount, 'Coinvera Returns #' . $id); if (!is_wp_error($ref)) $new_status = 'completed'; }
      } elseif ($new_status === 'approved') $new_status = 'completed';   // échange : traitement logistique hors plugin, simple suivi de statut
      CVX_DB::update($id, ['status' => $new_status]);
      if ($order = wc_get_order($r->order_id)) $order->add_order_note(sprintf('Coinvera Returns : demande #%d %s par %s.', $id, $new_status === 'rejected' ? 'refusée' : 'approuvée', wp_get_current_user()->display_name));
    }
    wp_safe_redirect(add_query_arg(['page' => 'cvx-requests', 'cvx_n' => $new_status === 'rejected' ? 'rejected' : 'approved'], admin_url('admin.php'))); exit;
  }

  // ---------- Réglages ----------
  public static function page_settings() {
    self::guard(); $s = CVX_Settings::all();
    echo '<div class="wrap"><h1>Coinvera Returns — Réglages</h1>';
    echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
    wp_nonce_field('cvx_save_settings'); echo '<input type="hidden" name="action" value="cvx_save_settings">';
    echo '<table class="form-table"><tbody>';
    self::row_check('enabled', 'Portail retours actif', $s['enabled'], '');
    self::row_text('license_key', 'Clé de licence', $s['license_key'], 'Même licence que les autres plugins Coinvera.');
    self::row_num('return_window_days', 'Délai de retour (jours)', $s['return_window_days'], 'À partir de la date de livraison connue (ou de paiement si inconnue).');
    echo '<tr><th colspan="2"><h2>Avoir (retour avec bonus)</h2></th></tr>';
    self::row_num('credit_bonus_pct', 'Bonus sur l’avoir (%)', $s['credit_bonus_pct'], 'Émis immédiatement, pour encourager l’avoir plutôt que le remboursement.');
    self::row_num('credit_expiry_days', 'Validité du bon d’achat (jours)', $s['credit_expiry_days'], '');
    echo '<tr><th colspan="2"><h2>Autres options proposées au client</h2></th></tr>';
    self::row_check('allow_refund', 'Autoriser la demande de remboursement', $s['allow_refund'], 'Soumis à votre validation manuelle.');
    self::row_check('allow_exchange', 'Autoriser la demande d’échange', $s['allow_exchange'], 'Traitement logistique hors plugin.');
    echo '<tr><th colspan="2"><h2>Notifications</h2></th></tr>';
    self::row_check('notify_admin', 'M’alerter par e-mail des nouvelles demandes (hors avoir)', $s['notify_admin'], '');
    self::row_text('notify_email', 'Adresse de notification', $s['notify_email'], 'Laisser vide pour utiliser l’adresse admin du site.');
    self::row_check('delete_on_uninstall', 'Supprimer les demandes à la désinstallation', $s['delete_on_uninstall'], '');
    echo '</tbody></table>';
    submit_button('Enregistrer'); echo '</form></div>';
  }
  private static function row_check($k, $label, $v, $help) { printf('<tr><th>%s</th><td><label><input type="checkbox" name="%s" value="1"%s> %s</label></td></tr>', esc_html($label), esc_attr($k), $v ? ' checked' : '', esc_html($help)); }
  private static function row_text($k, $label, $v, $help) { printf('<tr><th>%s</th><td><input type="text" class="regular-text" name="%s" value="%s"><p class="description">%s</p></td></tr>', esc_html($label), esc_attr($k), esc_attr($v), esc_html($help)); }
  private static function row_num($k, $label, $v, $help) { printf('<tr><th>%s</th><td><input type="number" min="0" name="%s" value="%s"><p class="description">%s</p></td></tr>', esc_html($label), esc_attr($k), esc_attr($v), esc_html($help)); }

  public static function save_settings() {
    self::guard(); check_admin_referer('cvx_save_settings');
    $p = fn($k) => isset($_POST[$k]) && is_scalar($_POST[$k]) ? sanitize_text_field(wp_unslash((string) $_POST[$k])) : '';
    CVX_Settings::update([
      'enabled' => isset($_POST['enabled']) ? 1 : 0, 'license_key' => mb_substr($p('license_key'), 0, 80), 'return_window_days' => max(1, (int) $p('return_window_days')),
      'credit_bonus_pct' => max(0, min(100, (float) $p('credit_bonus_pct'))), 'credit_expiry_days' => max(1, (int) $p('credit_expiry_days')),
      'allow_refund' => isset($_POST['allow_refund']) ? 1 : 0, 'allow_exchange' => isset($_POST['allow_exchange']) ? 1 : 0,
      'notify_admin' => isset($_POST['notify_admin']) ? 1 : 0, 'notify_email' => mb_substr($p('notify_email'), 0, 190), 'delete_on_uninstall' => isset($_POST['delete_on_uninstall']) ? 1 : 0,
    ]);
    delete_transient('cvx_license_ok');
    $codes = [];
    if (strlen((string) CVX_Settings::get('license_key')) >= 10) { $r = CVX_API::license('activate'); $codes[] = is_wp_error($r) ? 'lic_net' : (!empty($r['valid']) ? 'lic_ok' : 'lic_bad'); }
    wp_safe_redirect(add_query_arg(['page' => 'cvx-settings', 'cvx_n' => implode(',', $codes ?: ['saved'])], admin_url('admin.php'))); exit;
  }
}
