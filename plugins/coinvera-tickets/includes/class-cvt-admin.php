<?php
if (!defined('ABSPATH')) exit;

/** Administration : commandes, participants, billets offerts, contrôle, réglages. Toute action exige capacité + nonce, en POST. */
final class CVT_Admin {
  const CAP = 'manage_options';
  const PER = 20;
  const ST = ['pending' => 'En attente', 'paid' => 'Payée', 'expired' => 'Expirée', 'refunded' => 'Remboursée'];
  const NOTICES = [
    'saved' => ['success', 'Réglages enregistrés.'], 'resent' => ['success', 'E-mail des billets renvoyé.'], 'refunded' => ['success', 'Commande marquée comme remboursée : billets annulés, places libérées.'], 'checked' => ['success', 'Paiement vérifié auprès de Coinvera.'],
    'voided' => ['success', 'Billet annulé.'], 'issued' => ['success', 'Billets offerts émis et envoyés.'], 'bad' => ['error', 'Requête invalide : vérifiez les champs.'], 'locked' => ['error', 'Action impossible dans l’état actuel.'], 'full' => ['error', 'Pas assez de places disponibles.'],
    'lic_ok' => ['success', 'Licence Coinvera activée pour ce site.'], 'lic_bad' => ['error', 'Licence non valide, ou limite d’activations atteinte pour cette licence.'], 'lic_net' => ['warning', 'Impossible de joindre le serveur de licences. Réessayez.'],
    'hook_ok' => ['success', 'Webhook configuré automatiquement : les paiements seront confirmés immédiatement (la vérification périodique reste active en secours).'],
    'hook_full' => ['warning', 'Webhook non configuré : la limite de 5 URL du compte Coinvera est atteinte. Retirez-en une dans Coinvera → Webhooks. En attendant, les paiements sont vérifiés toutes les 5 minutes.'],
    'hook_bad' => ['warning', 'Webhook non configuré : vérifiez vos clés API (une clé de production activée est requise) et que le site est en HTTPS. En attendant, les paiements sont vérifiés toutes les 5 minutes.'],
  ];

  public static function init() {
    add_action('admin_menu', [__CLASS__, 'menu']);
    add_action('admin_notices', [__CLASS__, 'notices']);
    foreach (['op', 'issue', 'save_settings', 'register_webhook', 'export'] as $a) add_action('admin_post_cvt_' . $a, [__CLASS__, $a]);
    add_action('admin_init', [__CLASS__, 'maybe_auto_webhook']);
    add_filter('plugin_action_links_' . CVT_SLUG, function ($l) { array_unshift($l, '<a href="' . esc_url(admin_url('admin.php?page=cvt-settings')) . '">Réglages</a>'); return $l; });
  }
  public static function menu() {
    $cap = apply_filters('cvt_capability', self::CAP); $ck = apply_filters('cvt_checkin_capability', 'cvt_checkin');
    add_menu_page('Billetterie Coinvera', 'Billetterie Coinvera', $cap, 'cvt-orders', [__CLASS__, 'page_orders'], 'dashicons-tickets-alt', 56);
    add_submenu_page('cvt-orders', 'Commandes', 'Commandes', $cap, 'cvt-orders', [__CLASS__, 'page_orders']);
    add_submenu_page('cvt-orders', 'Participants', 'Participants', $cap, 'cvt-attendees', [__CLASS__, 'page_attendees']);
    add_submenu_page('cvt-orders', 'Billets offerts', 'Billets offerts', $cap, 'cvt-issue', [__CLASS__, 'page_issue']);
    add_submenu_page('cvt-orders', 'Contrôle', 'Contrôle', $ck, 'cvt-checkin', [__CLASS__, 'page_checkin']);
    add_submenu_page('cvt-orders', 'Réglages', 'Réglages', $cap, 'cvt-settings', [__CLASS__, 'page_settings']);
  }
  private static function guard() { if (!current_user_can(apply_filters('cvt_capability', self::CAP))) wp_die('Accès refusé.', 403); }
  private static function back($page, $code, $extra = []) { wp_safe_redirect(add_query_arg(array_merge(['page' => $page, 'cvt_n' => $code], $extra), admin_url('admin.php'))); exit; }
  private static function post($k, $max = 200) { return isset($_POST[$k]) && is_scalar($_POST[$k]) ? mb_substr(trim(sanitize_text_field(wp_unslash((string) $_POST[$k]))), 0, $max) : ''; }

  public static function notices() {
    $screen = get_current_screen(); if (!$screen || (strpos((string) $screen->id, 'cvt-') === false && strpos((string) $screen->id, 'cvt_event') === false)) return;
    $codes = isset($_GET['cvt_n']) ? explode(',', sanitize_text_field(wp_unslash($_GET['cvt_n']))) : [];   // jamais de texte libre : codes → messages fixes
    foreach (array_slice($codes, 0, 3) as $n) { $n = sanitize_key($n); if (isset(self::NOTICES[$n])) printf('<div class="notice notice-%s is-dismissible"><p>%s</p></div>', esc_attr(self::NOTICES[$n][0]), esc_html(self::NOTICES[$n][1])); }
    if (!CVT_Settings::configured()) echo '<div class="notice notice-warning"><p>Renseignez votre licence et vos clés API dans <a href="' . esc_url(admin_url('admin.php?page=cvt-settings')) . '">Réglages</a> pour activer la vente.</p></div>';
    elseif (!CVT_API::licensed()) echo '<div class="notice notice-error"><p>La licence Coinvera n’est pas valide pour ce site : la vente de billets est désactivée.</p></div>';
  }
  private static function events_select($sel, $name = 'event') {
    $o = '<select name="' . esc_attr($name) . '"><option value="0">Tous les événements</option>';
    foreach (CVT_Events::all_published() as $p) $o .= sprintf('<option value="%d"%s>%s</option>', $p->ID, selected((int) $sel, $p->ID, false), esc_html($p->post_title));
    return $o . '</select>';
  }
  private static function op_form($id, $op, $label, $confirm = '') {
    return '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '" style="display:inline"' . ($confirm !== '' ? ' onsubmit="return confirm(' . esc_attr(wp_json_encode($confirm)) . ')"' : '') . '><input type="hidden" name="action" value="cvt_op"><input type="hidden" name="op" value="' . esc_attr($op) . '"><input type="hidden" name="id" value="' . (int) $id . '">'
      . wp_nonce_field('cvt_op_' . $op . '_' . (int) $id, '_wpnonce', false, false) . '<button type="submit" class="button-link">' . esc_html($label) . '</button></form>';
  }
  private static function pager($total, $page, $per = self::PER) { $n = (int) ceil($total / $per); return $n > 1 ? '<div class="tablenav"><div class="tablenav-pages">' . wp_kses_post(paginate_links(['base' => add_query_arg('paged', '%#%'), 'format' => '', 'current' => $page, 'total' => $n])) . '</div></div>' : ''; }

  public static function page_orders() {
    self::guard(); $ev = isset($_GET['event']) ? absint($_GET['event']) : 0; $status = isset($_GET['status']) ? sanitize_key(wp_unslash($_GET['status'])) : '';
    $q = isset($_GET['s']) && is_scalar($_GET['s']) ? mb_substr(sanitize_text_field(wp_unslash((string) $_GET['s'])), 0, 80) : ''; $page = max(1, isset($_GET['paged']) ? absint($_GET['paged']) : 1);
    $res = CVT_DB::search_orders($ev, $status, $q, $page, self::PER);
    echo '<div class="wrap"><h1>Commandes</h1><form method="get" style="margin:10px 0"><input type="hidden" name="page" value="cvt-orders">' . self::events_select($ev) . ' <select name="status"><option value="">Tous les statuts</option>';
    foreach (self::ST + ['review' => 'À vérifier'] as $k => $l) printf('<option value="%s"%s>%s</option>', esc_attr($k), selected($status, $k, false), esc_html($l));
    echo '</select> <input type="search" name="s" value="' . esc_attr($q) . '" placeholder="E-mail ou nom"> <button class="button">Filtrer</button></form>';
    echo '<table class="widefat striped"><thead><tr><th>#</th><th>Acheteur</th><th>Événement</th><th>Billets</th><th>Total</th><th>Statut</th><th>Actions</th></tr></thead><tbody>';
    if (!$res['rows']) echo '<tr><td colspan="7">Aucune commande.</td></tr>';
    foreach ($res['rows'] as $o) {
      $e = CVT_Events::get($o->event_id); $st = (self::ST[$o->status] ?? $o->status) . ($o->manual ? ' (offerte)' : '');
      if ($o->pay_state === 'review') $st .= ' — ⚠ paiement à vérifier (à rembourser si plus de place)'; elseif ($o->pay_state === 'test') $st .= ' (paiement test reçu)';
      echo '<tr><td>' . (int) $o->id . '</td><td>' . esc_html($o->buyer_name) . '<br><small>' . esc_html($o->buyer_email) . '</small></td><td>' . esc_html($e ? $e['title'] : '#' . $o->event_id) . '</td><td>' . (int) count(CVT_DB::tickets_of($o->id)) . '</td><td>' . esc_html(CVT_Util::money($o->total_cents)) . '</td><td>' . esc_html($st) . '<br><small>' . esc_html(CVT_Util::datetime($o->created_at)) . '</small></td><td>';
      if ($o->status === 'paid') echo self::op_form($o->id, 'resend', 'Renvoyer les billets') . ' | ' . self::op_form($o->id, 'refund', 'Marquer remboursée', 'Marquer cette commande comme remboursée ? Les billets seront annulés. Pensez à rembourser le client dans votre tableau de bord Coinvera.');
      if ($o->cv_payment_id !== '' && $o->status !== 'paid' && $o->status !== 'refunded') echo self::op_form($o->id, 'check', 'Vérifier le paiement');
      echo '</td></tr>';
    }
    echo '</tbody></table>' . self::pager($res['total'], $page) . '</div>';
  }
  public static function op() {
    self::guard(); $id = isset($_POST['id']) ? absint($_POST['id']) : 0; $op = isset($_POST['op']) && is_scalar($_POST['op']) ? sanitize_key((string) $_POST['op']) : '';
    if (!in_array($op, ['resend', 'refund', 'check', 'void'], true)) wp_die('Requête invalide.', 400);
    check_admin_referer('cvt_op_' . $op . '_' . $id);
    if ($op === 'void') { $t = CVT_DB::void_ticket($id); self::back('cvt-attendees', $t ? 'voided' : 'locked'); }
    $o = CVT_DB::order($id); if (!$o) wp_die('Commande introuvable.', 404);
    if ($op === 'resend') self::back('cvt-orders', $o->status === 'paid' && CVT_Mail::tickets($o) ? 'resent' : 'locked');
    if ($op === 'refund') self::back('cvt-orders', CVT_DB::refund($id) ? 'refunded' : 'locked');
    CVT_Confirm::check($o); self::back('cvt-orders', 'checked');
  }

  public static function page_attendees() {
    self::guard(); $ev = isset($_GET['event']) ? absint($_GET['event']) : 0; $q = isset($_GET['s']) && is_scalar($_GET['s']) ? mb_substr(sanitize_text_field(wp_unslash((string) $_GET['s'])), 0, 80) : ''; $page = max(1, isset($_GET['paged']) ? absint($_GET['paged']) : 1);
    echo '<div class="wrap"><h1>Participants</h1><form method="get" style="margin:10px 0"><input type="hidden" name="page" value="cvt-attendees">' . str_replace('<option value="0">Tous les événements</option>', '<option value="0">Choisir un événement…</option>', self::events_select($ev)) . ' <input type="search" name="s" value="' . esc_attr($q) . '" placeholder="Nom ou e-mail"> <button class="button">Afficher</button></form>';
    if (!CVT_Events::get($ev)) { echo '<p>Choisissez un événement.</p></div>'; return; }
    $res = CVT_DB::attendees($ev, $q, $page, self::PER); $s = CVT_DB::stats($ev);
    printf('<p><strong>%d</strong> vendus · <strong>%d</strong> contrôlés</p><table class="widefat striped"><thead><tr><th>Nom</th><th>E-mail</th><th>Type</th><th>Code</th><th>Entrée</th><th></th></tr></thead><tbody>', $s['sold'], $s['used']);
    if (!$res['rows']) echo '<tr><td colspan="6">Aucun billet.</td></tr>';
    foreach ($res['rows'] as $t) echo '<tr><td>' . esc_html($t->holder_name) . '</td><td>' . esc_html($t->buyer_email) . '</td><td>' . esc_html($t->type_name) . '</td><td><code>' . esc_html(CVT_Codes::pretty($t->code)) . '</code></td><td>' . esc_html($t->status === 'used' ? 'Contrôlé ' . CVT_Util::datetime($t->used_at) : ($t->status === 'void' ? 'Annulé' : 'Valide')) . '</td><td>' . ($t->status === 'valid' ? self::op_form($t->id, 'void', 'Annuler ce billet', 'Annuler ce billet ?') : '') . '</td></tr>';
    echo '</tbody></table>' . self::pager($res['total'], $page);
    echo '<p><form method="get" action="' . esc_url(admin_url('admin-post.php')) . '" style="display:inline"><input type="hidden" name="action" value="cvt_export"><input type="hidden" name="event" value="' . (int) $ev . '">' . wp_nonce_field('cvt_export', '_wpnonce', false, false) . '<button class="button">Exporter en CSV</button></form></p></div>';
  }
  public static function export() {
    self::guard(); check_admin_referer('cvt_export'); $ev = isset($_GET['event']) ? absint($_GET['event']) : 0; if (!CVT_Events::get($ev)) wp_die('Événement introuvable.', 404);
    nocache_headers(); header('Content-Type: text/csv; charset=utf-8'); header('Content-Disposition: attachment; filename="participants-' . $ev . '-' . gmdate('Ymd') . '.csv"');
    $out = fopen('php://output', 'w'); fwrite($out, "\xEF\xBB\xBF"); fputcsv($out, ['Nom', 'E-mail', 'Type', 'Code', 'Statut', 'Contrôlé le']);
    for ($p = 1; $p <= 100; $p++) {   // 10 000 billets maximum par export
      $res = CVT_DB::attendees($ev, '', $p, 100); if (!$res['rows']) break;
      foreach ($res['rows'] as $t) fputcsv($out, array_map([CVT_Util::class, 'csv_cell'], [$t->holder_name, $t->buyer_email, $t->type_name, $t->code, $t->status, (string) $t->used_at]));
    }
    fclose($out); exit;
  }

  public static function page_issue() {
    self::guard(); echo '<div class="wrap"><h1>Émettre des billets offerts</h1><p class="description">Sans paiement, total 0 $. La jauge et les quotas sont respectés. Les billets sont envoyés par e-mail.</p><form method="post" action="' . esc_url(admin_url('admin-post.php')) . '"><input type="hidden" name="action" value="cvt_issue">'; wp_nonce_field('cvt_issue');
    echo '<p>' . str_replace('<option value="0">Tous les événements</option>', '<option value="0">Événement…</option>', self::events_select(0)) . ' <input type="text" name="type" placeholder="Identifiant du type (voir l’événement)" required> <input type="number" name="qty" min="1" max="20" value="1" style="width:70px"></p>';
    echo '<p><input type="text" name="name" placeholder="Nom" required> <input type="email" name="email" placeholder="E-mail" required> <button class="button button-primary">Émettre</button></p><p class="description">Types disponibles :</p><ul style="list-style:disc;margin-left:20px">';
    foreach (CVT_Events::all_published() as $p) { $e = CVT_Events::get($p->ID); if ($e) foreach ($e['types'] as $t) echo '<li>' . esc_html($e['title']) . ' — ' . esc_html($t['name']) . ' : <code>' . esc_html($t['id']) . '</code></li>'; }
    echo '</ul></form></div>';
  }
  public static function issue() {
    self::guard(); check_admin_referer('cvt_issue');
    $ev = CVT_Events::get(isset($_POST['event']) ? absint($_POST['event']) : 0); $tid = self::post('type', 12); $n = isset($_POST['qty']) ? absint($_POST['qty']) : 0; $name = self::post('name', 120); $email = sanitize_email(self::post('email', 190));
    if (!$ev || !isset($ev['types'][$tid]) || $n < 1 || $n > min(20, $ev['max']) || $name === '' || !is_email($email)) self::back('cvt-issue', 'bad');
    $r = CVT_DB::create_order($ev, [$tid => $n], $name, strtolower($email), 0, true);
    if (isset($r['err'])) self::back('cvt-issue', in_array($r['err'], ['full', 'quota'], true) ? 'full' : 'bad');
    CVT_Mail::tickets(CVT_DB::order($r['order'])); self::back('cvt-issue', 'issued');
  }

  public static function page_checkin() {
    if (!CVT_Checkin::can()) wp_die('Accès refusé.', 403);
    $ev = isset($_GET['event']) ? absint($_GET['event']) : 0;
    echo '<div class="wrap"><h1>Contrôle d’entrée</h1><form method="get"><input type="hidden" name="page" value="cvt-checkin">' . str_replace('<option value="0">Tous les événements</option>', '<option value="0">Choisir un événement…</option>', self::events_select($ev)) . ' <button class="button">Ouvrir</button></form>';
    echo CVT_Events::get($ev) ? CVT_Checkin::ui($ev) : '<p>Choisissez un événement.</p>'; echo '</div>';
  }

  public static function page_settings() {
    self::guard(); $o = CVT_Settings::all();
    $has = function ($k) { return $k !== '' ? ' <em>(enregistrée — laissez vide pour la conserver)</em>' : ''; };
    echo '<div class="wrap"><h1>Réglages — Billetterie Coinvera</h1><form method="post" action="' . esc_url(admin_url('admin-post.php')) . '"><input type="hidden" name="action" value="cvt_save_settings">'; wp_nonce_field('cvt_settings');
    echo '<h2>Licence et API</h2><table class="form-table" role="presentation">';
    printf('<tr><th><label for="license_key">Clé de licence</label></th><td><input type="text" id="license_key" name="license_key" class="regular-text" value="%s" autocomplete="off"><p class="description">La même licence que les autres plugins Coinvera.</p></td></tr>', esc_attr($o['license_key']));
    printf('<tr><th><label for="public_key">Clé API publique</label></th><td><input type="text" id="public_key" name="public_key" class="regular-text" value="%s" autocomplete="off"></td></tr>', esc_attr($o['public_key']));
    printf('<tr><th><label for="secret">Clé API secrète</label></th><td><input type="password" id="secret" name="secret" class="regular-text" value="" autocomplete="new-password">%s<p class="description">Stockée chiffrée, jamais réaffichée.</p></td></tr>', $has($o['secret_enc']));
    printf('<tr><th><label for="api_base">URL de l’API</label></th><td><input type="url" id="api_base" name="api_base" class="regular-text" value="%s"></td></tr></table>', esc_attr($o['api_base']));
    echo '<h2>Vente</h2><table class="form-table" role="presentation">';
    printf('<tr><th><label for="hold_minutes">Durée de réservation (minutes)</label></th><td><input type="number" id="hold_minutes" name="hold_minutes" min="5" max="240" value="%d" class="small-text"><p class="description">Les places restent réservées le temps du paiement, puis sont libérées.</p></td></tr>', (int) $o['hold_minutes']);
    printf('<tr><th>Options</th><td><label><input type="checkbox" name="show_remaining" value="1"%s> Afficher le nombre de places restantes</label><br><label><input type="checkbox" name="notify_admin" value="1"%s> M’avertir par e-mail à chaque commande payée</label><br><input type="email" name="notify_email" class="regular-text" value="%s" placeholder="%s"></td></tr>', checked($o['show_remaining'], 1, false), checked($o['notify_admin'], 1, false), esc_attr($o['notify_email']), esc_attr(get_option('admin_email')));
    printf('<tr><th>E-mail des billets</th><td><p class="description">Variables : <code>{site} {name} {event} {date} {venue} {count} {total} {tickets_url}</code></p><input type="text" name="mail_tickets_subject" class="large-text" maxlength="150" value="%s"><br><textarea name="mail_tickets_body" rows="7" class="large-text" maxlength="3000">%s</textarea></td></tr>', esc_attr($o['mail_tickets_subject']), esc_textarea($o['mail_tickets_body']));
    printf('<tr><th>Désinstallation</th><td><label><input type="checkbox" name="delete_on_uninstall" value="1"%s> Supprimer événements, commandes, billets et réglages à la suppression du plugin</label></td></tr></table>', checked($o['delete_on_uninstall'], 1, false));
    submit_button('Enregistrer'); echo '</form>';
    $url = rest_url('coinvera-tickets/v1/webhook'); $ok = CVT_Settings::webhook_secret() !== '' && get_option('cvt_hook_url') === $url;
    echo '<hr><h2>Webhook (automatique)</h2><p>Enregistré automatiquement chez Coinvera à la sauvegarde des réglages ; il s’ajoute à ceux de vos autres sites et plugins sans les remplacer (5 URL maximum par compte). En secours, une vérification tourne toutes les 5 minutes.</p><p>URL : <code>' . esc_html($url) . '</code> — état : ' . ($ok ? '<strong>configuré</strong>' : 'non configuré') . '</p>';
    echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '"><input type="hidden" name="action" value="cvt_register_webhook">'; wp_nonce_field('cvt_webhook'); submit_button($ok ? 'Reconfigurer le webhook' : 'Configurer le webhook maintenant', 'secondary', 'submit', false); echo '</form>';
    echo '<hr><h2>Utilisation</h2><ul style="list-style:disc;margin-left:20px"><li><code>[coinvera_event id="12"]</code> — vitrine et achat de billets.</li><li><code>[coinvera_checkin event="12"]</code> — contrôle d’entrée sur téléphone (équipe connectée), ou menu « Contrôle ».</li></ul></div>';
  }
  public static function save_settings() {
    self::guard(); check_admin_referer('cvt_settings'); $def = CVT_Settings::defaults(); $base = esc_url_raw(self::post('api_base', 200), ['https']);
    $new = ['api_base' => $base !== '' ? untrailingslashit($base) : $def['api_base'], 'public_key' => self::post('public_key', 80), 'license_key' => self::post('license_key', 80), 'hold_minutes' => max(5, min(240, isset($_POST['hold_minutes']) ? absint($_POST['hold_minutes']) : 30)),
      'show_remaining' => empty($_POST['show_remaining']) ? 0 : 1, 'notify_admin' => empty($_POST['notify_admin']) ? 0 : 1, 'notify_email' => sanitize_email(self::post('notify_email', 190)), 'delete_on_uninstall' => empty($_POST['delete_on_uninstall']) ? 0 : 1];
    $s = self::post('mail_tickets_subject', 150); $b = isset($_POST['mail_tickets_body']) && is_scalar($_POST['mail_tickets_body']) ? mb_substr(trim(sanitize_textarea_field(wp_unslash((string) $_POST['mail_tickets_body']))), 0, 3000) : '';
    $new['mail_tickets_subject'] = $s !== '' ? $s : $def['mail_tickets_subject']; $new['mail_tickets_body'] = $b !== '' ? $b : $def['mail_tickets_body'];
    $secret = self::post('secret', 120); if ($secret !== '') $new['secret_enc'] = CVT_Settings::encrypt($secret);
    CVT_Settings::update($new); delete_transient('cvt_license_ok'); $codes = [];
    if (strlen($new['license_key']) >= 10) { $r = CVT_API::license('activate'); $codes[] = is_wp_error($r) ? 'lic_net' : (!empty($r['valid']) ? 'lic_ok' : 'lic_bad'); }
    if (CVT_Settings::configured()) { delete_transient('cvt_hook_try'); $codes[] = self::register_webhook_now(); }
    self::back('cvt-settings', $codes ? implode(',', $codes) : 'saved');
  }
  public static function register_webhook_now() {
    $url = rest_url('coinvera-tickets/v1/webhook'); $r = CVT_API::register_webhook($url);
    if (!is_wp_error($r) && $r['code'] === 200 && !empty($r['data']['secret']) && is_string($r['data']['secret'])) { CVT_Settings::update(['webhook_secret_enc' => CVT_Settings::encrypt($r['data']['secret'])]); update_option('cvt_hook_url', $url, false); return 'hook_ok'; }
    return (!is_wp_error($r) && $r['code'] === 409) ? 'hook_full' : 'hook_bad';
  }
  public static function maybe_auto_webhook() {
    $page = isset($_GET['page']) ? sanitize_key(wp_unslash($_GET['page'])) : '';
    if (strpos($page, 'cvt-') !== 0 || wp_doing_ajax() || wp_doing_cron() || !current_user_can(apply_filters('cvt_capability', self::CAP)) || !CVT_Settings::configured()) return;
    if (CVT_Settings::webhook_secret() !== '' && get_option('cvt_hook_url') === rest_url('coinvera-tickets/v1/webhook')) return;
    if (get_transient('cvt_hook_try')) return; set_transient('cvt_hook_try', 1, 6 * HOUR_IN_SECONDS); self::register_webhook_now();
  }
  public static function register_webhook() { self::guard(); check_admin_referer('cvt_webhook'); self::back('cvt-settings', CVT_Settings::configured() ? self::register_webhook_now() : 'hook_bad'); }
}
