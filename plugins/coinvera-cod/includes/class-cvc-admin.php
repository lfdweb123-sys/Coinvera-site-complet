<?php
if (!defined('ABSPATH')) exit;

final class CVC_Admin {
  const CAP = 'manage_options';
  const PER = 30;
  const NOTICES = ['saved' => ['success', 'Réglages enregistrés.'], 'lic_ok' => ['success', 'Licence Coinvera activée pour ce site.'],
    'lic_bad' => ['error', 'Licence non valide, ou limite d’activations atteinte pour cette licence.'], 'lic_net' => ['warning', 'Impossible de joindre le serveur de licences. Réessayez.']];
  const EVENTS = ['sent' => 'Demande envoyée', 'confirmed' => 'Confirmée', 'declined' => 'Refusée par le client', 'expired' => 'Sans réponse', 'delivered' => 'Livrée', 'refused' => 'Colis refusé', 'score_block' => 'COD refusé (score)'];

  public static function init() {
    add_action('admin_menu', [__CLASS__, 'menu']);
    add_action('admin_notices', [__CLASS__, 'notices']);
    add_action('admin_post_cvc_save_settings', [__CLASS__, 'save_settings']);
    add_filter('plugin_action_links_' . CVC_SLUG, function ($l) { array_unshift($l, '<a href="' . esc_url(admin_url('admin.php?page=cvc-settings')) . '">Réglages</a>'); return $l; });
  }

  public static function menu() {
    $cap = apply_filters('cvc_capability', self::CAP);
    add_menu_page('Coinvera COD', 'Coinvera COD', $cap, 'cvc-log', [__CLASS__, 'page_log'], 'dashicons-yes-alt', 59);
    add_submenu_page('cvc-log', 'Journal', 'Journal', $cap, 'cvc-log', [__CLASS__, 'page_log']);
    add_submenu_page('cvc-log', 'Réglages', 'Réglages', $cap, 'cvc-settings', [__CLASS__, 'page_settings']);
  }
  private static function guard() { if (!current_user_can(apply_filters('cvc_capability', self::CAP))) wp_die('Accès refusé.', 403); }

  public static function notices() {
    $screen = get_current_screen(); if (!$screen || strpos((string) $screen->id, 'cvc-') === false) return;
    $codes = isset($_GET['cvc_n']) ? explode(',', sanitize_text_field(wp_unslash($_GET['cvc_n']))) : [];
    foreach (array_slice($codes, 0, 3) as $n) { $n = sanitize_key($n); if (isset(self::NOTICES[$n])) printf('<div class="notice notice-%s is-dismissible"><p>%s</p></div>', esc_attr(self::NOTICES[$n][0]), esc_html(self::NOTICES[$n][1])); }
    if (!CVC_Settings::license_set()) echo '<div class="notice notice-warning"><p>Renseignez votre licence dans <a href="' . esc_url(admin_url('admin.php?page=cvc-settings')) . '">Réglages</a> pour activer Coinvera COD.</p></div>';
    elseif (!CVC_Woo::present()) echo '<div class="notice notice-error"><p>WooCommerce n’est pas actif : Coinvera COD ne confirme aucune commande pour le moment.</p></div>';
    elseif (!CVC_Settings::configured()) echo '<div class="notice notice-warning"><p>Clé publique et secret API manquants : les demandes de confirmation WhatsApp ne peuvent pas partir.</p></div>';
  }

  public static function page_log() {
    self::guard(); $page = max(1, isset($_GET['paged']) ? absint($_GET['paged']) : 1);
    $res = CVC_DB::recent($page, self::PER); $st = CVC_DB::stats();
    echo '<div class="wrap"><h1>Coinvera COD — Journal</h1>';
    printf('<p><strong>Confirmées (7 j) :</strong> %d &nbsp; <strong>Refusées ou sans réponse (7 j) :</strong> %d &nbsp; <strong>COD refusé par le score (7 j) :</strong> %d</p>', $st['confirmed'], $st['lost'], $st['blocked']);
    echo '<table class="widefat striped"><thead><tr><th>Date</th><th>Commande</th><th>Événement</th><th>Résultat</th><th>Détail</th></tr></thead><tbody>';
    if (!$res['rows']) echo '<tr><td colspan="5">Aucun événement pour le moment.</td></tr>';
    foreach ($res['rows'] as $r) {
      $label = ['sent' => '<strong style="color:#1a7f37">OK</strong>', 'ok' => '<strong style="color:#1a7f37">OK</strong>', 'failed' => '<strong style="color:#b32d2e">Échec</strong>', 'skipped' => 'Ignoré', 'blocked' => '<strong style="color:#b32d2e">Bloqué</strong>'][$r->status] ?? esc_html($r->status);
      $order = (int) $r->order_id ? '<a href="' . esc_url(admin_url('admin.php?page=wc-orders&action=edit&id=' . (int) $r->order_id)) . '">#' . (int) $r->order_id . '</a>' : '—';
      echo '<tr><td>' . esc_html(get_date_from_gmt($r->created_at, 'd/m/Y H:i')) . '</td><td>' . wp_kses_post($order) . '</td><td>' . esc_html(self::EVENTS[$r->event] ?? $r->event) . '</td><td>' . wp_kses_post($label) . '</td><td>' . esc_html($r->reason) . '</td></tr>';
    }
    echo '</tbody></table>';
    $pages = (int) ceil($res['total'] / self::PER);
    if ($pages > 1) echo '<div class="tablenav"><div class="tablenav-pages">' . wp_kses_post(paginate_links(['base' => add_query_arg('paged', '%#%'), 'format' => '', 'current' => $page, 'total' => $pages])) . '</div></div>';
    echo '</div>';
  }

  public static function page_settings() {
    self::guard(); $s = CVC_Settings::all();
    echo '<div class="wrap"><h1>Coinvera COD — Réglages</h1>';
    echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
    wp_nonce_field('cvc_save_settings'); echo '<input type="hidden" name="action" value="cvc_save_settings">';
    echo '<table class="form-table"><tbody>';
    self::row_check('enabled', 'Coinvera COD actif', $s['enabled'], 'Désactive totalement le plugin si décoché.');
    self::row_text('license_key', 'Clé de licence', $s['license_key'], 'Même licence que les autres plugins Coinvera.');
    self::row_text('public_key', 'Clé publique API', $s['public_key'], 'La même que pour vos autres plugins Coinvera (tableau de bord → Clés API).');
    self::row_text('api_secret', 'Secret API', '', 'Laisser vide pour conserver le secret déjà enregistré.');
    self::row_text('gateways', 'Modes de paiement concernés', $s['gateways'], 'Identifiants des passerelles « paiement à la livraison », séparés par des virgules (par défaut : cod).');
    echo '<tr><th colspan="2"><h2>Confirmation par WhatsApp</h2></th></tr>';
    self::row_check('confirm_enabled', 'Exiger la confirmation du client', $s['confirm_enabled'], 'La commande reste en attente jusqu’à ce que le client confirme via le lien reçu par WhatsApp.');
    self::row_num('confirm_expiry_h', 'Délai de confirmation (heures)', $s['confirm_expiry_h'], 1, '');
    echo '<tr><th>Sans réponse dans le délai</th><td><select name="on_expire"><option value="cancel"' . selected($s['on_expire'], 'cancel', false) . '>Annuler la commande</option><option value="keep"' . selected($s['on_expire'], 'keep', false) . '>La laisser en attente (je décide)</option></select></td></tr>';
    echo '<tr><th colspan="2"><h2>Score de fiabilité</h2></th></tr>';
    self::row_check('score_enabled', 'Retirer le COD aux clients peu fiables', $s['score_enabled'], 'Un client connu sous le seuil ne voit plus le paiement à la livraison et doit payer en ligne.');
    self::row_num('min_score', 'Score minimum (0 à 100)', $s['min_score'], 0, 'Un nouveau client vaut environ 67. Avec 40, un seul colis refusé suffit à retirer le COD ; trois livraisons réussies le rétablissent.');
    echo '<tr><th colspan="2"><h2>Autres</h2></th></tr>';
    self::row_check('delete_on_uninstall', 'Supprimer le journal et les scores à la désinstallation', $s['delete_on_uninstall'], '');
    echo '</tbody></table>';
    submit_button('Enregistrer'); echo '</form></div>';
  }
  private static function row_check($k, $label, $v, $help) { printf('<tr><th>%s</th><td><label><input type="checkbox" name="%s" value="1"%s> %s</label></td></tr>', esc_html($label), esc_attr($k), $v ? ' checked' : '', esc_html($help)); }
  private static function row_text($k, $label, $v, $help) { printf('<tr><th>%s</th><td><input type="text" class="regular-text" name="%s" value="%s"><p class="description">%s</p></td></tr>', esc_html($label), esc_attr($k), esc_attr($v), esc_html($help)); }
  private static function row_num($k, $label, $v, $min, $help) { printf('<tr><th>%s</th><td><input type="number" min="%d" max="%d" name="%s" value="%d"><p class="description">%s</p></td></tr>', esc_html($label), (int) $min, $k === 'min_score' ? 100 : 720, esc_attr($k), (int) $v, esc_html($help)); }

  public static function save_settings() {
    self::guard(); check_admin_referer('cvc_save_settings');
    $p = fn($k) => isset($_POST[$k]) && is_scalar($_POST[$k]) ? sanitize_text_field(wp_unslash((string) $_POST[$k])) : '';
    $new = [
      'enabled' => isset($_POST['enabled']) ? 1 : 0, 'license_key' => mb_substr($p('license_key'), 0, 80), 'public_key' => mb_substr($p('public_key'), 0, 80),
      'gateways' => mb_substr(implode(',', array_filter(array_map('sanitize_key', explode(',', $p('gateways'))))) ?: 'cod', 0, 200),
      'confirm_enabled' => isset($_POST['confirm_enabled']) ? 1 : 0, 'confirm_expiry_h' => max(1, min(720, (int) $p('confirm_expiry_h'))),
      'on_expire' => $p('on_expire') === 'keep' ? 'keep' : 'cancel',
      'score_enabled' => isset($_POST['score_enabled']) ? 1 : 0, 'min_score' => max(0, min(100, (int) $p('min_score'))),
      'delete_on_uninstall' => isset($_POST['delete_on_uninstall']) ? 1 : 0,
    ];
    $secret = $p('api_secret'); if ($secret !== '') $new['secret_enc'] = CVC_Settings::encrypt($secret);   // champ vide : on garde le secret enregistré
    CVC_Settings::update($new);
    delete_transient('cvc_license_ok');
    $codes = [];
    if (strlen((string) CVC_Settings::get('license_key')) >= 10) { $r = CVC_API::license('activate'); $codes[] = is_wp_error($r) ? 'lic_net' : (!empty($r['valid']) ? 'lic_ok' : 'lic_bad'); }
    wp_safe_redirect(add_query_arg(['page' => 'cvc-settings', 'cvc_n' => implode(',', $codes ?: ['saved'])], admin_url('admin.php'))); exit;
  }
}
