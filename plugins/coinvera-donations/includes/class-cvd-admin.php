<?php
if (!defined('ABSPATH')) exit;

/** Administration : liste des dons, réglages, licence, export CSV. Toutes les actions exigent une capacité et un nonce. */
final class CVD_Admin {
  const CAP = 'manage_options';
  const STATUS = ['pending' => 'En attente', 'confirmed' => 'Confirmé', 'test' => 'Test (non compté)', 'failed' => 'Échoué', 'expired' => 'Expiré', 'review' => 'À vérifier', 'refunded' => 'Remboursé / annulé'];
  const NOTICES = [
    'saved' => ['success', 'Réglages enregistrés.'], 'lic_ok' => ['success', 'Licence Coinvera activée pour ce site.'],
    'lic_bad' => ['error', 'Licence non valide, ou limite d’activations atteinte pour cette licence.'], 'lic_net' => ['warning', 'Impossible de joindre le serveur de licences. Réessayez.'],
    'hook_ok' => ['success', 'Webhook configuré. Les dons seront confirmés plus vite (la vérification périodique reste active).'],
    'hook_bad' => ['error', 'Webhook non configuré : vérifiez vos clés API (une clé de production activée est requise) et que le site est en HTTPS.'],
    'checked' => ['success', 'Don vérifié auprès de Coinvera.'],
  ];

  public static function init() {
    add_action('admin_menu', [__CLASS__, 'menu']);
    add_action('admin_notices', [__CLASS__, 'notices']);
    add_action('admin_post_cvd_save_settings', [__CLASS__, 'save_settings']);
    add_action('admin_post_cvd_register_webhook', [__CLASS__, 'register_webhook']);
    add_action('admin_post_cvd_check', [__CLASS__, 'check_one']);
    add_action('admin_post_cvd_export', [__CLASS__, 'export']);
    add_filter('plugin_action_links_' . CVD_SLUG, function ($l) { array_unshift($l, '<a href="' . esc_url(admin_url('admin.php?page=cvd-settings')) . '">Réglages</a>'); return $l; });
  }

  public static function menu() {
    $cap = apply_filters('cvd_capability', self::CAP);
    add_menu_page('Dons Coinvera', 'Dons Coinvera', $cap, 'cvd-donations', [__CLASS__, 'page_donations'], 'dashicons-heart', 58);
    add_submenu_page('cvd-donations', 'Dons', 'Dons', $cap, 'cvd-donations', [__CLASS__, 'page_donations']);
    add_submenu_page('cvd-donations', 'Réglages', 'Réglages', $cap, 'cvd-settings', [__CLASS__, 'page_settings']);
  }
  private static function guard() { if (!current_user_can(apply_filters('cvd_capability', self::CAP))) wp_die('Accès refusé.', 403); }
  private static function back($page, $code, $extra = []) { wp_safe_redirect(add_query_arg(array_merge(['page' => $page, 'cvd_n' => $code], $extra), admin_url('admin.php'))); exit; }

  public static function notices() {
    $screen = get_current_screen(); if (!$screen || strpos((string) $screen->id, 'cvd') === false) return;
    $n = isset($_GET['cvd_n']) ? sanitize_key(wp_unslash($_GET['cvd_n'])) : '';   // jamais de texte libre : code → message fixe
    if (isset(self::NOTICES[$n])) printf('<div class="notice notice-%s is-dismissible"><p>%s</p></div>', esc_attr(self::NOTICES[$n][0]), esc_html(self::NOTICES[$n][1]));
    if (!CVD_Settings::ready()) echo '<div class="notice notice-warning"><p>Renseignez votre licence et vos clés API dans <a href="' . esc_url(admin_url('admin.php?page=cvd-settings')) . '">Réglages</a> pour activer les dons.</p></div>';
    elseif (!CVD_API::licensed()) echo '<div class="notice notice-error"><p>La licence Coinvera n’est pas valide pour ce site : les formulaires de don sont désactivés.</p></div>';
  }

  // ---------- Réglages ----------
  public static function page_settings() {
    self::guard(); $o = CVD_Settings::all();
    $has = function ($k) { return $k !== '' ? ' <em>(enregistrée — laissez vide pour la conserver)</em>' : ''; };
    echo '<div class="wrap"><h1>Réglages — Dons Coinvera</h1><form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
    echo '<input type="hidden" name="action" value="cvd_save_settings">'; wp_nonce_field('cvd_settings');
    echo '<h2>Licence et API</h2><table class="form-table" role="presentation">';
    printf('<tr><th><label for="license_key">Clé de licence</label></th><td><input type="text" id="license_key" name="license_key" class="regular-text" value="%s" autocomplete="off"><p class="description">La même licence que le plugin WooCommerce (tableau de bord Coinvera → Plugins).</p></td></tr>', esc_attr($o['license_key']));
    printf('<tr><th><label for="public_key">Clé API publique</label></th><td><input type="text" id="public_key" name="public_key" class="regular-text" value="%s" autocomplete="off"></td></tr>', esc_attr($o['public_key']));
    printf('<tr><th><label for="secret">Clé API secrète</label></th><td><input type="password" id="secret" name="secret" class="regular-text" value="" autocomplete="new-password">%s<p class="description">Stockée chiffrée, jamais réaffichée.</p></td></tr>', $has($o['secret_enc']));
    printf('<tr><th><label for="api_base">URL de l’API</label></th><td><input type="url" id="api_base" name="api_base" class="regular-text" value="%s"></td></tr></table>', esc_attr($o['api_base']));
    echo '<h2>Dons</h2><table class="form-table" role="presentation">';
    if (CVD_Woo::present()) {
      $woo_ok = function_exists('get_woocommerce_currency') && get_woocommerce_currency() === 'USD';
      printf('<tr><th><label for="checkout_mode">Mode de paiement des dons</label></th><td><select id="checkout_mode" name="checkout_mode"><option value="coinvera"%s>Direct : carte via Coinvera</option><option value="woocommerce"%s>Via WooCommerce : panier et passerelles de la boutique</option></select><p class="description">En mode WooCommerce, le don passe par le panier et la passerelle de votre choix (y compris Coinvera) ; il est compté quand la commande est « en cours » ou « terminée », et retiré si elle est annulée, échouée ou remboursée. Les clés API ci-dessus ne sont alors pas nécessaires.</p>%s</td></tr>',
        selected($o['checkout_mode'], 'coinvera', false), selected($o['checkout_mode'], 'woocommerce', false), $woo_ok ? '' : '<p class="description" style="color:#b32d2e"><strong>Devise de la boutique : seule l’USD est prise en charge pour les dons.</strong> Tant qu’elle n’est pas en USD, le mode WooCommerce reste inactif.</p>');
    }
    printf('<tr><th><label for="min_amount">Don minimum (USD)</label></th><td><input type="text" id="min_amount" name="min_amount" class="small-text" value="%s"> <p class="description">1 USD minimum (limite de l’API).</p></td></tr>', esc_attr($o['min_amount']));
    printf('<tr><th><label for="suggested">Montants suggérés (USD)</label></th><td><input type="text" id="suggested" name="suggested" class="regular-text" value="%s"></td></tr>', esc_attr($o['suggested']));
    printf('<tr><th>Options</th><td><label><input type="checkbox" name="show_donors" value="1"%s> Afficher les derniers donateurs par défaut</label><br><label><input type="checkbox" name="receipt_donor" value="1"%s> Envoyer un e-mail de remerciement au donateur (s’il a laissé son e-mail)</label><br><label><input type="checkbox" name="notify_admin" value="1"%s> M’avertir par e-mail à chaque don confirmé</label></td></tr>', checked($o['show_donors'], 1, false), checked($o['receipt_donor'], 1, false), checked($o['notify_admin'], 1, false));
    printf('<tr><th><label for="notify_email">E-mail de notification</label></th><td><input type="email" id="notify_email" name="notify_email" class="regular-text" value="%s" placeholder="%s"></td></tr>', esc_attr($o['notify_email']), esc_attr(get_option('admin_email')));
    printf('<tr><th>Désinstallation</th><td><label><input type="checkbox" name="delete_on_uninstall" value="1"%s> Supprimer tous les dons et réglages à la suppression du plugin</label></td></tr></table>', checked($o['delete_on_uninstall'], 1, false));
    submit_button('Enregistrer'); echo '</form>';

    echo '<hr><h2>Webhook (facultatif)</h2><p>Sans webhook, les dons sont confirmés par une vérification automatique toutes les 5 minutes. Le webhook accélère la confirmation.</p>';
    echo '<p><strong>Attention :</strong> Coinvera n’enregistre qu’<u>une seule</u> URL de webhook par compte. L’activer ici remplace celle d’un autre site ou plugin (par ex. WooCommerce) ; dans ce cas, gardez la vérification automatique.</p>';
    echo '<p>URL : <code>' . esc_html(rest_url('coinvera-donations/v1/webhook')) . '</code> — état : ' . (CVD_Settings::webhook_secret() !== '' ? '<strong>configuré</strong>' : 'non configuré') . '</p>';
    echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '"><input type="hidden" name="action" value="cvd_register_webhook">'; wp_nonce_field('cvd_webhook');
    submit_button('Configurer le webhook sur ce site', 'secondary', 'submit', false); echo '</form>';

    echo '<hr><h2>Utilisation</h2><ul style="list-style:disc;margin-left:20px"><li><code>[coinvera_campaign id="12"]</code> — cagnotte complète : description, progression, formulaire et donateurs.</li><li><code>[coinvera_donate]</code> — formulaire de don libre (ajoutez <code>id="12"</code> pour une cagnotte).</li><li><code>[coinvera_progress id="12"]</code> et <code>[coinvera_donors id="12" limit="10"]</code> — barre de progression et liste des donateurs séparées.</li></ul></div>';
  }

  public static function save_settings() {
    self::guard(); check_admin_referer('cvd_settings');
    $p = wp_unslash($_POST); $t = function ($k, $max = 120) use ($p) { return isset($p[$k]) && is_scalar($p[$k]) ? mb_substr(trim(sanitize_text_field((string) $p[$k])), 0, $max) : ''; };
    $base = esc_url_raw($t('api_base', 200), ['https']); $new = [
      'api_base' => $base !== '' ? untrailingslashit($base) : CVD_Settings::defaults()['api_base'], 'public_key' => $t('public_key', 80), 'license_key' => $t('license_key', 80),
      'suggested' => implode(',', array_map(function ($c) { return $c / 100; }, CVD_Util::parse_amounts($t('suggested', 80)))) ?: '5,10,25,50',
      'min_amount' => (($c = CVD_Util::to_cents($t('min_amount', 10))) && $c >= 100) ? (string) ($c / 100) : '1',
      'show_donors' => empty($p['show_donors']) ? 0 : 1, 'receipt_donor' => empty($p['receipt_donor']) ? 0 : 1, 'notify_admin' => empty($p['notify_admin']) ? 0 : 1, 'delete_on_uninstall' => empty($p['delete_on_uninstall']) ? 0 : 1,
      'notify_email' => sanitize_email($t('notify_email', 190)),
      'checkout_mode' => (isset($p['checkout_mode']) && $p['checkout_mode'] === 'woocommerce' && CVD_Woo::present()) ? 'woocommerce' : 'coinvera',
    ];
    $secret = $t('secret', 120); if ($secret !== '') $new['secret_enc'] = CVD_Settings::encrypt($secret);
    CVD_Settings::update($new); delete_transient('cvd_license_ok');
    if ($new['checkout_mode'] === 'woocommerce') CVD_Woo::product_id();   // crée le produit « Don » masqué
    $code = 'saved';
    if (strlen($new['license_key']) >= 10) {
      $r = CVD_API::license('activate');
      $code = is_wp_error($r) ? 'lic_net' : (!empty($r['valid']) ? 'lic_ok' : 'lic_bad');
    }
    self::back('cvd-settings', $code);
  }

  public static function register_webhook() {
    self::guard(); check_admin_referer('cvd_webhook');
    $r = CVD_API::register_webhook(rest_url('coinvera-donations/v1/webhook'));
    if (!is_wp_error($r) && $r['code'] === 200 && !empty($r['data']['secret']) && is_string($r['data']['secret'])) { CVD_Settings::update(['webhook_secret_enc' => CVD_Settings::encrypt($r['data']['secret'])]); self::back('cvd-settings', 'hook_ok'); }
    self::back('cvd-settings', 'hook_bad');
  }

  // ---------- Liste des dons ----------
  public static function page_donations() {
    self::guard();
    $status = isset($_GET['status']) ? sanitize_key(wp_unslash($_GET['status'])) : ''; if (!isset(self::STATUS[$status])) $status = '';
    $camp = (isset($_GET['campaign']) && $_GET['campaign'] !== '') ? absint(wp_unslash($_GET['campaign'])) : -1;
    $paged = max(1, isset($_GET['paged']) ? absint(wp_unslash($_GET['paged'])) : 1); $per = 25;
    $res = CVD_DB::search($status, $camp, $paged, $per); $tot = CVD_DB::totals();
    $titles = [0 => 'Don libre']; foreach (get_posts(['post_type' => CVD_Campaigns::CPT, 'post_status' => 'any', 'numberposts' => 300, 'orderby' => 'title', 'order' => 'ASC']) as $p) $titles[$p->ID] = get_the_title($p) ?: ('Cagnotte #' . $p->ID);

    echo '<div class="wrap"><h1 class="wp-heading-inline">Dons</h1> <a class="page-title-action" href="' . esc_url(wp_nonce_url(add_query_arg(['action' => 'cvd_export', 'status' => $status], admin_url('admin-post.php')), 'cvd_export')) . '">Exporter en CSV</a><hr class="wp-header-end">';
    printf('<p><strong>%s</strong> collectés · %d don%s confirmé%s (mode réel uniquement)</p>', esc_html(CVD_Util::money($tot['raised'])), $tot['count'], $tot['count'] > 1 ? 's' : '', $tot['count'] > 1 ? 's' : '');
    echo '<form method="get"><input type="hidden" name="page" value="cvd-donations"><select name="status"><option value="">Tous les statuts</option>';
    foreach (self::STATUS as $k => $l) printf('<option value="%s"%s>%s</option>', esc_attr($k), selected($status, $k, false), esc_html($l));
    echo '</select> <select name="campaign"><option value="">Toutes les cagnottes</option>';
    foreach ($titles as $k => $l) printf('<option value="%d"%s>%s</option>', $k, $camp === $k ? ' selected' : '', esc_html($l));
    echo '</select> <button class="button">Filtrer</button></form><br>';
    echo '<table class="widefat striped"><thead><tr><th>#</th><th>Date</th><th>Cagnotte</th><th>Montant</th><th>Donateur</th><th>Message</th><th>Statut</th><th>Mode</th><th></th></tr></thead><tbody>';
    if (!$res['rows']) echo '<tr><td colspan="9">Aucun don.</td></tr>';
    foreach ($res['rows'] as $r) {
      $act = ($r->status === 'pending' && $r->cv_payment_id !== '') ? '<a class="button button-small" href="' . esc_url(wp_nonce_url(add_query_arg(['action' => 'cvd_check', 'id' => (int) $r->id], admin_url('admin-post.php')), 'cvd_check_' . (int) $r->id)) . '">Vérifier</a>' : '';
      printf('<tr><td>%d</td><td>%s</td><td>%s</td><td>%s</td><td>%s%s</td><td>%s</td><td>%s</td><td>%s</td><td>%s</td></tr>',
        $r->id, esc_html(get_date_from_gmt($r->created_at, 'd/m/Y H:i')), esc_html($titles[(int) $r->campaign_id] ?? 'Cagnotte supprimée'), esc_html(CVD_Util::money($r->amount_cents)),
        esc_html($r->donor_name !== '' ? $r->donor_name : '—'), $r->donor_email !== '' ? '<br><small>' . esc_html($r->donor_email) . '</small>' : '', esc_html(mb_substr($r->message, 0, 80)),
        esc_html(self::STATUS[$r->status] ?? $r->status), esc_html($r->order_id ? 'WooCommerce #' . (int) $r->order_id : ($r->mode !== '' ? $r->mode : '—')), $act);
    }
    echo '</tbody></table>';
    $pages = (int) ceil($res['total'] / $per);
    if ($pages > 1) echo '<div class="tablenav"><div class="tablenav-pages">' . wp_kses_post(paginate_links(['base' => add_query_arg('paged', '%#%'), 'format' => '', 'current' => $paged, 'total' => $pages])) . '</div></div>';
    echo '</div>';
  }

  public static function check_one() {
    self::guard(); $id = isset($_GET['id']) ? absint(wp_unslash($_GET['id'])) : 0; check_admin_referer('cvd_check_' . $id);
    CVD_Confirm::check(CVD_DB::get($id)); self::back('cvd-donations', 'checked');
  }

  public static function export() {
    self::guard(); check_admin_referer('cvd_export');
    $status = isset($_GET['status']) ? sanitize_key(wp_unslash($_GET['status'])) : ''; if (!isset(self::STATUS[$status])) $status = '';
    nocache_headers(); header('Content-Type: text/csv; charset=utf-8'); header('Content-Disposition: attachment; filename="dons-' . gmdate('Y-m-d') . '.csv"');
    $out = fopen('php://output', 'w'); fwrite($out, "\xEF\xBB\xBF");
    fputcsv($out, ['id', 'date', 'cagnotte', 'montant_usd', 'nom', 'email', 'message', 'anonyme', 'statut', 'mode']);
    for ($p = 1; $p <= 200; $p++) {   // 200 x 500 = 100 000 lignes maximum
      $res = CVD_DB::search($status, -1, $p, 500); if (!$res['rows']) break;
      foreach ($res['rows'] as $r) fputcsv($out, [$r->id, get_date_from_gmt($r->created_at, 'Y-m-d H:i:s'), $r->campaign_id ? CVD_Util::csv_cell(get_the_title((int) $r->campaign_id)) : 'Don libre', number_format($r->amount_cents / 100, 2, '.', ''),
        CVD_Util::csv_cell($r->donor_name), CVD_Util::csv_cell($r->donor_email), CVD_Util::csv_cell($r->message), $r->anonymous ? 'oui' : 'non', $r->status, $r->order_id ? 'woocommerce #' . (int) $r->order_id : $r->mode]);
    }
    fclose($out); exit;
  }
}
