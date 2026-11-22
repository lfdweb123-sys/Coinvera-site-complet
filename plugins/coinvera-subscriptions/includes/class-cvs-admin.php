<?php
if (!defined('ABSPATH')) exit;

/** Administration : abonnés, paiements, réglages, licence, webhook automatique, export. Toute action exige capacité + nonce, en POST. */
final class CVS_Admin {
  const CAP = 'manage_options';
  const PER = 20;
  const NOTICES = [
    'saved' => ['success', 'Réglages enregistrés.'], 'extended' => ['success', 'Période prolongée.'], 'cancelled' => ['success', 'Abonnement annulé.'], 'reactivated' => ['success', 'Abonnement réactivé.'],
    'resent' => ['success', 'Lien de paiement renvoyé.'], 'created' => ['success', 'Abonnement manuel créé.'], 'bad' => ['error', 'Requête invalide : vérifiez les champs.'], 'locked' => ['error', 'Action impossible dans l’état actuel.'],
    'lic_ok' => ['success', 'Licence Coinvera activée pour ce site.'], 'lic_bad' => ['error', 'Licence non valide, ou limite d’activations atteinte pour cette licence.'], 'lic_net' => ['warning', 'Impossible de joindre le serveur de licences. Réessayez.'],
    'hook_ok' => ['success', 'Webhook configuré automatiquement : les paiements seront confirmés immédiatement (la vérification périodique reste active en secours).'],
    'hook_full' => ['warning', 'Webhook non configuré : la limite de 5 URL du compte Coinvera est atteinte. Retirez-en une dans Coinvera → Webhooks. En attendant, les paiements sont vérifiés toutes les 5 minutes.'],
    'hook_bad' => ['warning', 'Webhook non configuré : vérifiez vos clés API (une clé de production activée est requise) et que le site est en HTTPS. En attendant, les paiements sont vérifiés toutes les 5 minutes.'],
  ];

  public static function init() {
    add_action('admin_menu', [__CLASS__, 'menu']);
    add_action('admin_notices', [__CLASS__, 'notices']);
    foreach (['op', 'manual', 'save_settings', 'register_webhook', 'export'] as $a) add_action('admin_post_cvs_' . $a, [__CLASS__, $a]);
    add_action('admin_init', [__CLASS__, 'maybe_auto_webhook']);
    add_filter('plugin_action_links_' . CVS_SLUG, function ($l) { array_unshift($l, '<a href="' . esc_url(admin_url('admin.php?page=cvs-settings')) . '">Réglages</a>'); return $l; });
  }
  public static function menu() {
    $cap = apply_filters('cvs_capability', self::CAP);
    add_menu_page('Abonnements Coinvera', 'Abonnements Coinvera', $cap, 'cvs-subscribers', [__CLASS__, 'page_subs'], 'dashicons-groups', 59);
    add_submenu_page('cvs-subscribers', 'Abonnés', 'Abonnés', $cap, 'cvs-subscribers', [__CLASS__, 'page_subs']);
    add_submenu_page('cvs-subscribers', 'Paiements', 'Paiements', $cap, 'cvs-charges', [__CLASS__, 'page_charges']);
    add_submenu_page('cvs-subscribers', 'Réglages', 'Réglages', $cap, 'cvs-settings', [__CLASS__, 'page_settings']);
  }
  private static function guard() { if (!current_user_can(apply_filters('cvs_capability', self::CAP))) wp_die('Accès refusé.', 403); }
  private static function back($page, $code) { wp_safe_redirect(add_query_arg(['page' => $page, 'cvs_n' => $code], admin_url('admin.php'))); exit; }
  private static function post($k, $max = 200) { return isset($_POST[$k]) && is_scalar($_POST[$k]) ? mb_substr(trim(sanitize_text_field(wp_unslash((string) $_POST[$k]))), 0, $max) : ''; }
  private static function area($k, $max) { return isset($_POST[$k]) && is_scalar($_POST[$k]) ? mb_substr(trim(sanitize_textarea_field(wp_unslash((string) $_POST[$k]))), 0, $max) : ''; }

  public static function notices() {
    $screen = get_current_screen(); if (!$screen || (strpos((string) $screen->id, 'cvs-') === false && strpos((string) $screen->id, 'cvs_plan') === false)) return;
    $codes = isset($_GET['cvs_n']) ? explode(',', sanitize_text_field(wp_unslash($_GET['cvs_n']))) : [];   // jamais de texte libre : codes → messages fixes
    foreach (array_slice($codes, 0, 3) as $n) { $n = sanitize_key($n); if (isset(self::NOTICES[$n])) printf('<div class="notice notice-%s is-dismissible"><p>%s</p></div>', esc_attr(self::NOTICES[$n][0]), esc_html(self::NOTICES[$n][1])); }
    if (!CVS_Settings::configured()) echo '<div class="notice notice-warning"><p>Renseignez votre licence et vos clés API dans <a href="' . esc_url(admin_url('admin.php?page=cvs-settings')) . '">Réglages</a> pour activer les paiements.</p></div>';
    elseif (!CVS_API::licensed()) echo '<div class="notice notice-error"><p>La licence Coinvera n’est pas valide pour ce site : inscriptions et paiements désactivés.</p></div>';
  }

  private static function op_form($id, $op, $label, $confirm = '', $extra = '') {
    return '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '" style="display:inline"' . ($confirm !== '' ? ' onsubmit="return confirm(' . esc_attr(wp_json_encode($confirm)) . ')"' : '') . '><input type="hidden" name="action" value="cvs_op"><input type="hidden" name="op" value="' . esc_attr($op) . '"><input type="hidden" name="id" value="' . (int) $id . '">'
      . wp_nonce_field('cvs_op_' . $op . '_' . (int) $id, '_wpnonce', false, false) . $extra . '<button type="submit" class="button-link">' . esc_html($label) . '</button></form>';
  }

  public static function page_subs() {
    self::guard();
    $status = isset($_GET['status']) ? sanitize_key(wp_unslash($_GET['status'])) : ''; $plan = isset($_GET['plan']) ? absint($_GET['plan']) : 0;
    $q = isset($_GET['s']) && is_scalar($_GET['s']) ? mb_substr(sanitize_text_field(wp_unslash((string) $_GET['s'])), 0, 80) : ''; $page = max(1, isset($_GET['paged']) ? absint($_GET['paged']) : 1);
    $res = CVS_DB::search_subs($status, $plan, $q, $page, self::PER); $plans = CVS_Plans::all_published();
    echo '<div class="wrap"><h1>Abonnés</h1><form method="get" style="margin:10px 0"><input type="hidden" name="page" value="cvs-subscribers"><select name="status"><option value="">Tous les statuts</option>';
    foreach (CVS_Access::LABELS as $k => $l) printf('<option value="%s"%s>%s</option>', esc_attr($k), selected($status, $k, false), esc_html($l));
    echo '</select> <select name="plan"><option value="0">Tous les plans</option>';
    foreach ($plans as $p) printf('<option value="%d"%s>%s</option>', $p->ID, selected($plan, $p->ID, false), esc_html($p->post_title));
    echo '</select> <input type="search" name="s" value="' . esc_attr($q) . '" placeholder="E-mail ou nom"> <button class="button">Filtrer</button></form>';
    echo '<table class="widefat striped"><thead><tr><th>Abonné</th><th>Plan</th><th>Statut</th><th>Fin de période</th><th>Actions</th></tr></thead><tbody>';
    if (!$res['rows']) echo '<tr><td colspan="5">Aucun abonné.</td></tr>';
    foreach ($res['rows'] as $s) {
      $pl = CVS_Plans::get($s->plan_id);
      echo '<tr><td>' . esc_html($s->name) . '<br><small>' . esc_html($s->email) . '</small></td><td>' . esc_html($pl ? $pl['title'] : '#' . $s->plan_id) . '</td><td>' . esc_html(CVS_Access::label($s->status)) . '</td><td>' . esc_html(CVS_Util::date($s->period_end)) . '</td><td>';
      if ($s->status !== 'pending') echo self::op_form($s->id, 'extend', 'Prolonger de', '', '<input type="number" name="days" value="30" min="1" max="365" style="width:60px"> j ') . ' | ';
      if (in_array($s->status, ['active', 'past_due', 'expired'], true)) echo self::op_form($s->id, 'cancel', 'Annuler', 'Annuler cet abonnement ?') . ' | ' . self::op_form($s->id, 'resend', 'Renvoyer le lien de paiement');
      if ($s->status === 'cancelled') echo self::op_form($s->id, 'reactivate', 'Réactiver');
      echo '</td></tr>';
    }
    echo '</tbody></table>';
    $pages = (int) ceil($res['total'] / self::PER);
    if ($pages > 1) echo '<div class="tablenav"><div class="tablenav-pages">' . wp_kses_post(paginate_links(['base' => add_query_arg('paged', '%#%'), 'format' => '', 'current' => $page, 'total' => $pages])) . '</div></div>';

    echo '<h2>Créer un abonnement manuel</h2><p class="description">Sans paiement : par exemple pour un accès offert. Un compte WordPress est créé (ou l’utilisateur existant est réutilisé sans changer son rôle).</p><form method="post" action="' . esc_url(admin_url('admin-post.php')) . '"><input type="hidden" name="action" value="cvs_manual">'; wp_nonce_field('cvs_manual');
    echo '<p><select name="plan" required><option value="">Plan…</option>'; foreach ($plans as $p) printf('<option value="%d">%s</option>', $p->ID, esc_html($p->post_title)); echo '</select> ';
    echo '<input type="email" name="email" placeholder="E-mail" required> <input type="text" name="name" placeholder="Nom" required> <label>Fin de période <input type="date" name="end" required></label> <button class="button button-primary">Créer</button></p></form>';
    echo '<p><form method="get" action="' . esc_url(admin_url('admin-post.php')) . '" style="display:inline"><input type="hidden" name="action" value="cvs_export">' . wp_nonce_field('cvs_export', '_wpnonce', false, false) . '<button class="button">Exporter en CSV</button></form></p></div>';
  }

  public static function page_charges() {
    self::guard(); $page = max(1, isset($_GET['paged']) ? absint($_GET['paged']) : 1); $res = CVS_DB::recent_charges($page, self::PER);
    echo '<div class="wrap"><h1>Paiements</h1><table class="widefat striped"><thead><tr><th>#</th><th>Abonné</th><th>Plan</th><th>Type</th><th>Montant</th><th>Échéance</th><th>Statut</th></tr></thead><tbody>';
    if (!$res['rows']) echo '<tr><td colspan="7">Aucun paiement.</td></tr>';
    foreach ($res['rows'] as $c) {
      $pl = CVS_Plans::get($c->plan_id); $st = $c->status === 'paid' ? 'Payé le ' . CVS_Util::date($c->paid_at) : ($c->status === 'void' ? 'Annulé' : 'En attente');
      if ($c->pay_state === 'review') $st .= ' — ⚠ paiement à vérifier'; elseif ($c->pay_state === 'test') $st .= ' (paiement test reçu)';
      echo '<tr><td>' . (int) $c->id . '</td><td>' . esc_html($c->email) . '</td><td>' . esc_html($pl ? $pl['title'] : '#' . $c->plan_id) . '</td><td>' . ($c->kind === 'first' ? 'Première' : 'Renouvellement') . '</td><td>' . esc_html(CVS_Util::money($c->amount_cents)) . '</td><td>' . esc_html(CVS_Util::date($c->due_at)) . '</td><td>' . esc_html($st) . '</td></tr>';
    }
    echo '</tbody></table>'; $pages = (int) ceil($res['total'] / self::PER);
    if ($pages > 1) echo '<div class="tablenav"><div class="tablenav-pages">' . wp_kses_post(paginate_links(['base' => add_query_arg('paged', '%#%'), 'format' => '', 'current' => $page, 'total' => $pages])) . '</div></div>';
    echo '</div>';
  }

  public static function op() {
    self::guard(); $id = isset($_POST['id']) ? absint($_POST['id']) : 0; $op = isset($_POST['op']) && is_scalar($_POST['op']) ? sanitize_key((string) $_POST['op']) : '';
    if (!in_array($op, ['extend', 'cancel', 'reactivate', 'resend'], true)) wp_die('Requête invalide.', 400);
    check_admin_referer('cvs_op_' . $op . '_' . $id);
    $s = CVS_DB::sub($id); if (!$s) wp_die('Abonnement introuvable.', 404); $now = CVS_Util::now();
    switch ($op) {
      case 'extend': $d = isset($_POST['days']) ? absint($_POST['days']) : 0; if ($d < 1 || $d > 365) self::back('cvs-subscribers', 'bad'); self::back('cvs-subscribers', CVS_DB::extend($id, $d, $now) ? 'extended' : 'locked');
      case 'cancel': self::back('cvs-subscribers', CVS_DB::cancel($id) ? 'cancelled' : 'locked');
      case 'reactivate': self::back('cvs-subscribers', CVS_DB::reactivate($id, $now) ? 'reactivated' : 'locked');
      case 'resend':
        $plan = CVS_Plans::get($s->plan_id); if (!$plan || !in_array($s->status, ['active', 'past_due', 'expired'], true)) self::back('cvs-subscribers', 'locked');
        $c = CVS_DB::ensure_renewal($s, $plan['price'], $s->period_end && $s->period_end > $now ? $s->period_end : $now);
        if (!$c) self::back('cvs-subscribers', 'locked');
        CVS_Mail::send('new', $s, $plan, $c); self::back('cvs-subscribers', 'resent');
    }
  }
  public static function manual() {
    self::guard(); check_admin_referer('cvs_manual');
    $plan = CVS_Plans::get(isset($_POST['plan']) ? absint($_POST['plan']) : 0); $email = sanitize_email(self::post('email', 190)); $name = self::post('name', 120); $end = self::post('end', 10);
    if (!$plan || !is_email($email) || $name === '' || !preg_match('/^\d{4}-\d{2}-\d{2}$/', $end) || strtotime($end . ' UTC') === false || $end <= gmdate('Y-m-d')) self::back('cvs-subscribers', 'bad');
    $id = CVS_DB::add_sub($plan['id'], strtolower($email), $name, 'active', $end . ' 23:59:59');
    if (!$id) self::back('cvs-subscribers', 'bad');
    CVS_Access::ensure_user(CVS_DB::sub($id)); self::back('cvs-subscribers', 'created');
  }

  // ---------- Réglages ----------
  public static function page_settings() {
    self::guard(); $o = CVS_Settings::all();
    $has = function ($k) { return $k !== '' ? ' <em>(enregistrée — laissez vide pour la conserver)</em>' : ''; };
    echo '<div class="wrap"><h1>Réglages — Abonnements Coinvera</h1><form method="post" action="' . esc_url(admin_url('admin-post.php')) . '"><input type="hidden" name="action" value="cvs_save_settings">'; wp_nonce_field('cvs_settings');
    echo '<h2>Licence et API</h2><table class="form-table" role="presentation">';
    printf('<tr><th><label for="license_key">Clé de licence</label></th><td><input type="text" id="license_key" name="license_key" class="regular-text" value="%s" autocomplete="off"><p class="description">La même licence que les autres plugins Coinvera.</p></td></tr>', esc_attr($o['license_key']));
    printf('<tr><th><label for="public_key">Clé API publique</label></th><td><input type="text" id="public_key" name="public_key" class="regular-text" value="%s" autocomplete="off"></td></tr>', esc_attr($o['public_key']));
    printf('<tr><th><label for="secret">Clé API secrète</label></th><td><input type="password" id="secret" name="secret" class="regular-text" value="" autocomplete="new-password">%s<p class="description">Stockée chiffrée, jamais réaffichée.</p></td></tr>', $has($o['secret_enc']));
    printf('<tr><th><label for="api_base">URL de l’API</label></th><td><input type="url" id="api_base" name="api_base" class="regular-text" value="%s"></td></tr></table>', esc_attr($o['api_base']));
    echo '<h2>Espace membre et consentement</h2><table class="form-table" role="presentation">';
    printf('<tr><th><label for="account_url">Page « espace membre »</label></th><td><input type="url" id="account_url" name="account_url" class="regular-text" value="%s"><p class="description">Page contenant <code>[coinvera_account]</code>, indiquée dans les e-mails ({manage_url}). Sinon, la page de connexion.</p></td></tr>', esc_attr($o['account_url']));
    printf('<tr><th><label for="consent_text">Texte de consentement</label></th><td><input type="text" id="consent_text" name="consent_text" class="large-text" maxlength="300" value="%s"><p class="description">Si renseigné, une case à cocher obligatoire apparaît dans le formulaire.</p></td></tr></table>', esc_attr($o['consent_text']));
    echo '<h2>E-mails</h2><p class="description">Variables : <code>{site} {name} {plan} {amount} {due_date} {period_end} {pay_url} {manage_url}</code>. Texte brut.</p><table class="form-table" role="presentation">';
    $names = ['new' => 'Échéance (envoi du lien)', 'remind' => 'Rappel', 'receipt' => 'Reçu de paiement', 'expired' => 'Abonnement expiré'];
    foreach ($names as $k => $l) printf('<tr><th>%s</th><td><input type="text" name="mail_%s_subject" class="large-text" maxlength="150" value="%s"><br><textarea name="mail_%s_body" rows="6" class="large-text" maxlength="3000">%s</textarea></td></tr>', esc_html($l), $k, esc_attr($o["mail_{$k}_subject"]), $k, esc_textarea($o["mail_{$k}_body"]));
    printf('<tr><th>Désinstallation</th><td><label><input type="checkbox" name="delete_on_uninstall" value="1"%s> Supprimer plans, abonnements, paiements et réglages à la suppression du plugin</label></td></tr></table>', checked($o['delete_on_uninstall'], 1, false));
    submit_button('Enregistrer'); echo '</form>';
    $url = rest_url('coinvera-subscriptions/v1/webhook'); $ok = CVS_Settings::webhook_secret() !== '' && get_option('cvs_hook_url') === $url;
    echo '<hr><h2>Webhook (automatique)</h2><p>Enregistré automatiquement chez Coinvera à la sauvegarde des réglages ; il s’ajoute à ceux de vos autres sites et plugins sans les remplacer (5 URL maximum par compte). En secours, une vérification tourne toutes les 5 minutes.</p><p>URL : <code>' . esc_html($url) . '</code> — état : ' . ($ok ? '<strong>configuré</strong>' : 'non configuré') . '</p>';
    echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '"><input type="hidden" name="action" value="cvs_register_webhook">'; wp_nonce_field('cvs_webhook'); submit_button($ok ? 'Reconfigurer le webhook' : 'Configurer le webhook maintenant', 'secondary', 'submit', false); echo '</form>';
    echo '<hr><h2>Utilisation</h2><ul style="list-style:disc;margin-left:20px"><li><code>[coinvera_subscribe plan="12"]</code> — formulaire d’inscription au plan.</li><li><code>[coinvera_members plan="12,13"]contenu[/coinvera_members]</code> — contenu réservé (sans <code>plan</code> : tout abonnement valide).</li><li><code>[coinvera_account]</code> — espace membre : statut, paiement, annulation.</li><li>Case « Accès réservé aux abonnés » dans l’éditeur des articles et pages.</li><li>PHP : <code>cvs_user_has_access($user_id, $plan_ids = [])</code>.</li></ul></div>';
  }
  public static function save_settings() {
    self::guard(); check_admin_referer('cvs_settings'); $def = CVS_Settings::defaults();
    $base = esc_url_raw(self::post('api_base', 200), ['https']); $acc = esc_url_raw(self::post('account_url', 300), ['https', 'http']);
    $new = ['api_base' => $base !== '' ? untrailingslashit($base) : $def['api_base'], 'public_key' => self::post('public_key', 80), 'license_key' => self::post('license_key', 80), 'account_url' => $acc,
      'consent_text' => self::post('consent_text', 300), 'delete_on_uninstall' => empty($_POST['delete_on_uninstall']) ? 0 : 1];
    foreach (array_keys(CVS_Settings::TEMPLATES) as $k) { $s = self::post("mail_{$k}_subject", 150); $b = self::area("mail_{$k}_body", 3000); $new["mail_{$k}_subject"] = $s !== '' ? $s : $def["mail_{$k}_subject"]; $new["mail_{$k}_body"] = $b !== '' ? $b : $def["mail_{$k}_body"]; }
    $secret = self::post('secret', 120); if ($secret !== '') $new['secret_enc'] = CVS_Settings::encrypt($secret);
    CVS_Settings::update($new); delete_transient('cvs_license_ok'); $codes = [];
    if (strlen($new['license_key']) >= 10) { $r = CVS_API::license('activate'); $codes[] = is_wp_error($r) ? 'lic_net' : (!empty($r['valid']) ? 'lic_ok' : 'lic_bad'); }
    if (CVS_Settings::configured()) { delete_transient('cvs_hook_try'); $codes[] = self::register_webhook_now(); }
    self::back('cvs-settings', $codes ? implode(',', $codes) : 'saved');
  }
  public static function register_webhook_now() {
    $url = rest_url('coinvera-subscriptions/v1/webhook'); $r = CVS_API::register_webhook($url);
    if (!is_wp_error($r) && $r['code'] === 200 && !empty($r['data']['secret']) && is_string($r['data']['secret'])) { CVS_Settings::update(['webhook_secret_enc' => CVS_Settings::encrypt($r['data']['secret'])]); update_option('cvs_hook_url', $url, false); return 'hook_ok'; }
    return (!is_wp_error($r) && $r['code'] === 409) ? 'hook_full' : 'hook_bad';
  }
  public static function maybe_auto_webhook() {
    $page = isset($_GET['page']) ? sanitize_key(wp_unslash($_GET['page'])) : '';
    if (strpos($page, 'cvs-') !== 0 || wp_doing_ajax() || wp_doing_cron() || !current_user_can(apply_filters('cvs_capability', self::CAP)) || !CVS_Settings::configured()) return;
    if (CVS_Settings::webhook_secret() !== '' && get_option('cvs_hook_url') === rest_url('coinvera-subscriptions/v1/webhook')) return;
    if (get_transient('cvs_hook_try')) return; set_transient('cvs_hook_try', 1, 6 * HOUR_IN_SECONDS); self::register_webhook_now();
  }
  public static function register_webhook() { self::guard(); check_admin_referer('cvs_webhook'); self::back('cvs-settings', CVS_Settings::configured() ? self::register_webhook_now() : 'hook_bad'); }

  public static function export() {
    self::guard(); check_admin_referer('cvs_export');
    nocache_headers(); header('Content-Type: text/csv; charset=utf-8'); header('Content-Disposition: attachment; filename="abonnes-' . gmdate('Ymd') . '.csv"');
    $out = fopen('php://output', 'w'); fwrite($out, "\xEF\xBB\xBF"); fputcsv($out, ['Nom', 'E-mail', 'Plan', 'Statut', 'Fin de période', 'Créé le']);
    for ($p = 1; $p <= 50; $p++) {   // 5 000 abonnés maximum par export
      $res = CVS_DB::search_subs('', 0, '', $p, 100); if (!$res['rows']) break;
      foreach ($res['rows'] as $s) { $pl = CVS_Plans::get($s->plan_id); fputcsv($out, array_map([CVS_Util::class, 'csv_cell'], [$s->name, $s->email, $pl ? $pl['title'] : '#' . $s->plan_id, $s->status, (string) $s->period_end, $s->created_at])); }
    }
    fclose($out); exit;
  }
}
