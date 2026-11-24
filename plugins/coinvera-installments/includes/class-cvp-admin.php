<?php
if (!defined('ABSPATH')) exit;

final class CVP_Admin {
  const CAP = 'manage_options';
  const PER = 30;
  const NOTICES = ['saved' => ['success', 'Réglages enregistrés.'], 'lic_ok' => ['success', 'Licence Coinvera activée pour ce site.'],
    'lic_bad' => ['error', 'Licence non valide, ou limite d’activations atteinte pour cette licence.'], 'lic_net' => ['warning', 'Impossible de joindre le serveur de licences. Réessayez.']];
  const STATUS = ['scheduled' => 'Planifiée', 'requested' => 'Lien envoyé', 'paid' => 'Payée', 'cancelled' => 'Annulée'];

  public static function init() {
    add_action('admin_menu', [__CLASS__, 'menu']);
    add_action('admin_notices', [__CLASS__, 'notices']);
    add_action('admin_post_cvp_save_settings', [__CLASS__, 'save_settings']);
    add_filter('plugin_action_links_' . CVP_SLUG, function ($l) { array_unshift($l, '<a href="' . esc_url(admin_url('admin.php?page=cvp-settings')) . '">Réglages</a>'); return $l; });
  }

  public static function menu() {
    $cap = apply_filters('cvp_capability', self::CAP);
    add_menu_page('Coinvera Installments', 'Coinvera Installments', $cap, 'cvp-plans', [__CLASS__, 'page_plans'], 'dashicons-calendar-alt', 59);
    add_submenu_page('cvp-plans', 'Échéances', 'Échéances', $cap, 'cvp-plans', [__CLASS__, 'page_plans']);
    add_submenu_page('cvp-plans', 'Réglages', 'Réglages', $cap, 'cvp-settings', [__CLASS__, 'page_settings']);
  }
  private static function guard() { if (!current_user_can(apply_filters('cvp_capability', self::CAP))) wp_die('Accès refusé.', 403); }

  public static function notices() {
    $screen = get_current_screen(); if (!$screen || strpos((string) $screen->id, 'cvp-') === false) return;
    $codes = isset($_GET['cvp_n']) ? explode(',', sanitize_text_field(wp_unslash($_GET['cvp_n']))) : [];
    foreach (array_slice($codes, 0, 3) as $n) { $n = sanitize_key($n); if (isset(self::NOTICES[$n])) printf('<div class="notice notice-%s is-dismissible"><p>%s</p></div>', esc_attr(self::NOTICES[$n][0]), esc_html(self::NOTICES[$n][1])); }
    if (!CVP_Settings::license_set()) echo '<div class="notice notice-warning"><p>Renseignez votre licence dans <a href="' . esc_url(admin_url('admin.php?page=cvp-settings')) . '">Réglages</a> pour activer Coinvera Installments.</p></div>';
    elseif (!CVP_Woo::present()) echo '<div class="notice notice-error"><p>WooCommerce n’est pas actif : aucun plan de paiement n’est proposé pour le moment.</p></div>';
  }

  public static function page_plans() {
    self::guard(); $page = max(1, isset($_GET['paged']) ? absint($_GET['paged']) : 1);
    $res = CVP_DB::recent($page, self::PER);
    echo '<div class="wrap"><h1>Coinvera Installments — Échéances</h1>';
    echo '<p class="description">L’acompte (ou première échéance) est la commande d’origine ; seules les échéances restantes sont listées ici.</p>';
    echo '<table class="widefat striped"><thead><tr><th>Commande d’origine</th><th>Échéance</th><th>Montant</th><th>À régler le</th><th>Statut</th><th>Commande d’échéance</th></tr></thead><tbody>';
    if (!$res['rows']) echo '<tr><td colspan="6">Aucune échéance pour le moment.</td></tr>';
    foreach ($res['rows'] as $r) {
      $link = fn($id) => '<a href="' . esc_url(admin_url('admin.php?page=wc-orders&action=edit&id=' . (int) $id)) . '">#' . (int) $id . '</a>';
      $order = wc_get_order($r->order_id); $cur = $order ? $order->get_currency() : '';
      $st = self::STATUS[$r->status] ?? $r->status;
      if ($r->status === 'requested' && $r->requested_at && strtotime($r->requested_at . ' UTC') < time() - CVP_Settings::int('overdue_days', 1, 60) * DAY_IN_SECONDS) $st = '<strong style="color:#b32d2e">' . esc_html($st) . ' — en retard</strong>'; else $st = esc_html($st);
      echo '<tr><td>' . wp_kses_post($link($r->order_id)) . '</td><td>' . ((int) $r->seq + 1) . '</td><td>' . wp_kses_post(CVP_Woo::price($r->amount_minor, $cur)) . '</td><td>'
        . ($r->due_at ? esc_html(get_date_from_gmt($r->due_at, 'd/m/Y')) : 'À demander manuellement') . '</td><td>' . wp_kses_post($st) . '</td><td>' . ((int) $r->child_order_id ? wp_kses_post($link($r->child_order_id)) : '—') . '</td></tr>';
    }
    echo '</tbody></table>';
    $pages = (int) ceil($res['total'] / self::PER);
    if ($pages > 1) echo '<div class="tablenav"><div class="tablenav-pages">' . wp_kses_post(paginate_links(['base' => add_query_arg('paged', '%#%'), 'format' => '', 'current' => $page, 'total' => $pages])) . '</div></div>';
    echo '</div>';
  }

  public static function page_settings() {
    self::guard(); $s = CVP_Settings::all();
    echo '<div class="wrap"><h1>Coinvera Installments — Réglages</h1>';
    echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
    wp_nonce_field('cvp_save_settings'); echo '<input type="hidden" name="action" value="cvp_save_settings">';
    echo '<table class="form-table"><tbody>';
    self::row_check('enabled', 'Paiement fractionné actif', $s['enabled'], 'Désactive totalement le plugin si décoché.');
    self::row_text('license_key', 'Clé de licence', $s['license_key'], 'Même licence que les autres plugins Coinvera.');
    self::row_text('public_key', 'Clé publique API', $s['public_key'], 'Nécessaire uniquement pour les liens de paiement envoyés par WhatsApp (tableau de bord → Clés API).');
    self::row_text('api_secret', 'Secret API', '', 'Laisser vide pour conserver le secret déjà enregistré.');
    echo '<tr><th colspan="2"><h2>Formules proposées au checkout</h2></th></tr>';
    self::row_check('plan_deposit', 'Acompte', $s['plan_deposit'], 'Une part à la commande, le solde plus tard.');
    self::row_num('deposit_pct', 'Part de l’acompte (%)', $s['deposit_pct'], 1, 99, '');
    self::row_check('plan_split2', 'Paiement en 2 fois', $s['plan_split2'], '');
    self::row_check('plan_split3', 'Paiement en 3 fois', $s['plan_split3'], '');
    self::row_num('min_total', 'Montant minimum de la commande', $s['min_total'], 0, 100000000, 'Dans la devise de la boutique. Sous ce montant, seul le paiement intégral est proposé.');
    echo '<tr><th colspan="2"><h2>Échéances</h2></th></tr>';
    self::row_num('interval_days', 'Jours entre deux échéances (2 ou 3 fois)', $s['interval_days'], 1, 90, '');
    self::row_num('balance_days', 'Jours avant la demande du solde (acompte)', $s['balance_days'], 0, 90, '0 = jamais automatique : vous demandez le solde vous-même depuis l’écran de commande, par exemple avant l’expédition.');
    self::row_num('overdue_days', 'Rappel si impayé depuis (jours)', $s['overdue_days'], 1, 60, 'Un seul rappel au client, et vous recevez un e-mail d’alerte.');
    self::row_check('block_complete', 'Bloquer « Terminée » tant que tout n’est pas payé', $s['block_complete'], 'Évite d’expédier une commande dont le solde n’est pas réglé.');
    self::row_check('notify_whatsapp', 'Envoyer aussi le lien par WhatsApp', $s['notify_whatsapp'], 'En plus de l’e-mail, toujours envoyé. Nécessite la clé publique et le secret API.');
    echo '<tr><th colspan="2"><h2>Autres</h2></th></tr>';
    self::row_check('delete_on_uninstall', 'Supprimer la liste des échéances à la désinstallation', $s['delete_on_uninstall'], '');
    echo '</tbody></table>';
    submit_button('Enregistrer'); echo '</form></div>';
  }
  private static function row_check($k, $label, $v, $help) { printf('<tr><th>%s</th><td><label><input type="checkbox" name="%s" value="1"%s> %s</label></td></tr>', esc_html($label), esc_attr($k), $v ? ' checked' : '', esc_html($help)); }
  private static function row_text($k, $label, $v, $help) { printf('<tr><th>%s</th><td><input type="text" class="regular-text" name="%s" value="%s"><p class="description">%s</p></td></tr>', esc_html($label), esc_attr($k), esc_attr($v), esc_html($help)); }
  private static function row_num($k, $label, $v, $min, $max, $help) { printf('<tr><th>%s</th><td><input type="number" min="%d" max="%d" name="%s" value="%d"><p class="description">%s</p></td></tr>', esc_html($label), (int) $min, (int) $max, esc_attr($k), (int) $v, esc_html($help)); }

  public static function save_settings() {
    self::guard(); check_admin_referer('cvp_save_settings');
    $p = fn($k) => isset($_POST[$k]) && is_scalar($_POST[$k]) ? sanitize_text_field(wp_unslash((string) $_POST[$k])) : '';
    $c = fn($k) => isset($_POST[$k]) ? 1 : 0; $n = fn($k, $a, $b) => max($a, min($b, (int) $p($k)));
    $new = [
      'enabled' => $c('enabled'), 'license_key' => mb_substr($p('license_key'), 0, 80), 'public_key' => mb_substr($p('public_key'), 0, 80),
      'plan_deposit' => $c('plan_deposit'), 'deposit_pct' => $n('deposit_pct', 1, 99), 'plan_split2' => $c('plan_split2'), 'plan_split3' => $c('plan_split3'), 'min_total' => $n('min_total', 0, 100000000),
      'interval_days' => $n('interval_days', 1, 90), 'balance_days' => $n('balance_days', 0, 90), 'overdue_days' => $n('overdue_days', 1, 60),
      'block_complete' => $c('block_complete'), 'notify_whatsapp' => $c('notify_whatsapp'), 'delete_on_uninstall' => $c('delete_on_uninstall'),
    ];
    $secret = $p('api_secret'); if ($secret !== '') $new['secret_enc'] = CVP_Settings::encrypt($secret);   // champ vide : on garde le secret enregistré
    CVP_Settings::update($new);
    delete_transient('cvp_license_ok');
    $codes = [];
    if (strlen((string) CVP_Settings::get('license_key')) >= 10) { $r = CVP_API::license('activate'); $codes[] = is_wp_error($r) ? 'lic_net' : (!empty($r['valid']) ? 'lic_ok' : 'lic_bad'); }
    wp_safe_redirect(add_query_arg(['page' => 'cvp-settings', 'cvp_n' => implode(',', $codes ?: ['saved'])], admin_url('admin.php'))); exit;
  }
}
