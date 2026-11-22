<?php
if (!defined('ABSPATH')) exit;

/** Administration : factures, réglages, licence, webhook automatique, export CSV. Chaque action exige une capacité ET un nonce ; les opérations passent par POST. */
final class CVI_Admin {
  const CAP = 'manage_options';
  const PER = 20;
  const NOTICES = [
    'saved' => ['success', 'Réglages enregistrés.'], 'inv_saved' => ['success', 'Facture enregistrée.'], 'inv_sent' => ['success', 'Facture envoyée au client.'],
    'inv_sent_nomail' => ['warning', 'Facture marquée comme envoyée, mais l’e-mail n’a pas pu partir (adresse du client absente ou e-mail du site en échec). Partagez le lien manuellement.'],
    'inv_paid' => ['success', 'Facture marquée comme payée.'], 'inv_cancelled' => ['success', 'Facture annulée.'], 'inv_deleted' => ['success', 'Brouillon supprimé.'],
    'inv_dup' => ['success', 'Facture dupliquée en brouillon.'], 'inv_locked' => ['error', 'Cette facture n’est plus modifiable dans son état actuel.'], 'inv_bad' => ['error', 'Facture invalide : vérifiez les champs.'],
    'lic_ok' => ['success', 'Licence Coinvera activée pour ce site.'], 'lic_bad' => ['error', 'Licence non valide, ou limite d’activations atteinte pour cette licence.'], 'lic_net' => ['warning', 'Impossible de joindre le serveur de licences. Réessayez.'],
    'hook_ok' => ['success', 'Webhook configuré automatiquement : les paiements seront confirmés immédiatement (la vérification périodique reste active en secours).'],
    'hook_full' => ['warning', 'Webhook non configuré : la limite de 5 URL du compte Coinvera est atteinte. Retirez-en une dans Coinvera → Webhooks. En attendant, les paiements sont vérifiés toutes les 5 minutes.'],
    'hook_bad' => ['warning', 'Webhook non configuré : vérifiez vos clés API (une clé de production activée est requise) et que le site est en HTTPS. En attendant, les paiements sont vérifiés toutes les 5 minutes.'],
  ];

  public static function init() {
    add_action('admin_menu', [__CLASS__, 'menu']);
    add_action('admin_notices', [__CLASS__, 'notices']);
    add_action('admin_enqueue_scripts', [__CLASS__, 'assets']);
    foreach (['save_invoice', 'op', 'save_settings', 'register_webhook', 'export'] as $a) add_action('admin_post_cvi_' . $a, [__CLASS__, $a]);
    add_action('admin_init', [__CLASS__, 'maybe_auto_webhook']);
    add_filter('plugin_action_links_' . CVI_SLUG, function ($l) { array_unshift($l, '<a href="' . esc_url(admin_url('admin.php?page=cvi-settings')) . '">Réglages</a>'); return $l; });
  }

  public static function menu() {
    $cap = apply_filters('cvi_capability', self::CAP);
    add_menu_page('Factures Coinvera', 'Factures Coinvera', $cap, 'cvi-invoices', [__CLASS__, 'page_list'], 'dashicons-media-spreadsheet', 57);
    add_submenu_page('cvi-invoices', 'Factures', 'Factures', $cap, 'cvi-invoices', [__CLASS__, 'page_list']);
    add_submenu_page('cvi-invoices', 'Nouvelle facture', 'Nouvelle facture', $cap, 'cvi-edit', [__CLASS__, 'page_edit']);
    add_submenu_page('cvi-invoices', 'Réglages', 'Réglages', $cap, 'cvi-settings', [__CLASS__, 'page_settings']);
  }
  public static function assets($hook) {
    if (strpos((string) $hook, 'cvi-edit') === false) return;
    wp_enqueue_script('cvi-admin', CVI_URL . 'assets/cvi-admin.js', [], CVI_VERSION, true);
  }
  private static function guard() { if (!current_user_can(apply_filters('cvi_capability', self::CAP))) wp_die('Accès refusé.', 403); }
  private static function back($page, $code, $extra = []) { wp_safe_redirect(add_query_arg(array_merge(['page' => $page, 'cvi_n' => $code], $extra), admin_url('admin.php'))); exit; }
  private static function post($k, $max = 200) { return isset($_POST[$k]) && is_scalar($_POST[$k]) ? mb_substr(trim(sanitize_text_field(wp_unslash((string) $_POST[$k]))), 0, $max) : ''; }
  private static function area($k, $max) { return isset($_POST[$k]) && is_scalar($_POST[$k]) ? mb_substr(trim(sanitize_textarea_field(wp_unslash((string) $_POST[$k]))), 0, $max) : ''; }

  public static function notices() {
    $screen = get_current_screen(); if (!$screen || strpos((string) $screen->id, 'cvi-') === false) return;
    $codes = isset($_GET['cvi_n']) ? explode(',', sanitize_text_field(wp_unslash($_GET['cvi_n']))) : [];   // jamais de texte libre : codes → messages fixes
    foreach (array_slice($codes, 0, 3) as $n) { $n = sanitize_key($n); if (isset(self::NOTICES[$n])) printf('<div class="notice notice-%s is-dismissible"><p>%s</p></div>', esc_attr(self::NOTICES[$n][0]), esc_html(self::NOTICES[$n][1])); }
    if (!CVI_Settings::configured()) echo '<div class="notice notice-warning"><p>Renseignez votre licence et vos clés API dans <a href="' . esc_url(admin_url('admin.php?page=cvi-settings')) . '">Réglages</a> pour activer le paiement en ligne des factures.</p></div>';
    elseif (!CVI_API::licensed()) echo '<div class="notice notice-error"><p>La licence Coinvera n’est pas valide pour ce site : le paiement en ligne des factures est désactivé.</p></div>';
  }

  // ---------- Liste ----------
  private static function op_form($id, $op, $label, $confirm = '', $class = 'button-link') {
    return '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '" style="display:inline"' . ($confirm !== '' ? ' onsubmit="return confirm(' . esc_attr(wp_json_encode($confirm)) . ')"' : '') . '>'
      . '<input type="hidden" name="action" value="cvi_op"><input type="hidden" name="op" value="' . esc_attr($op) . '"><input type="hidden" name="id" value="' . (int) $id . '">'
      . wp_nonce_field('cvi_op_' . $op . '_' . (int) $id, '_wpnonce', false, false) . '<button type="submit" class="' . esc_attr($class) . '">' . esc_html($label) . '</button></form>';
  }

  public static function page_list() {
    self::guard();
    $status = isset($_GET['status']) ? sanitize_key(wp_unslash($_GET['status'])) : '';
    if (!in_array($status, ['draft', 'sent', 'overdue', 'paid', 'cancelled'], true)) $status = '';
    $q = isset($_GET['s']) && is_scalar($_GET['s']) ? mb_substr(sanitize_text_field(wp_unslash((string) $_GET['s'])), 0, 80) : '';
    $page = max(1, isset($_GET['paged']) ? absint($_GET['paged']) : 1); $today = CVI_Util::today();
    $res = CVI_DB::search($status, $q, $page, self::PER, $today); $sums = CVI_DB::sums($today);

    echo '<div class="wrap"><h1 class="wp-heading-inline">Factures</h1> <a class="page-title-action" href="' . esc_url(admin_url('admin.php?page=cvi-edit')) . '">Nouvelle facture</a><hr class="wp-header-end">';
    printf('<p><strong>Encaissé :</strong> %s &nbsp; <strong>En attente :</strong> %s &nbsp; <strong style="color:#b32d2e">En retard :</strong> %s</p>', esc_html(CVI_Util::money($sums['paid'])), esc_html(CVI_Util::money($sums['pending'])), esc_html(CVI_Util::money($sums['overdue'])));
    echo '<ul class="subsubsub">'; $i = 0; $labels = ['' => 'Toutes', 'draft' => 'Brouillons', 'sent' => 'Envoyées', 'overdue' => 'En retard', 'paid' => 'Payées', 'cancelled' => 'Annulées'];
    foreach ($labels as $k => $l) { printf('%s<li><a href="%s"%s>%s</a></li>', $i++ ? ' | ' : '', esc_url(add_query_arg(['page' => 'cvi-invoices', 'status' => $k], admin_url('admin.php'))), $k === $status ? ' class="current"' : '', esc_html($l)); }
    echo '</ul><form method="get" style="float:right"><input type="hidden" name="page" value="cvi-invoices"><input type="hidden" name="status" value="' . esc_attr($status) . '"><input type="search" name="s" value="' . esc_attr($q) . '" placeholder="Numéro, client, e-mail"> <button class="button">Rechercher</button></form>';
    echo '<table class="widefat striped" style="margin-top:12px"><thead><tr><th>Numéro</th><th>Client</th><th>Échéance</th><th>Total</th><th>Statut</th><th>Actions</th></tr></thead><tbody>';
    if (!$res['rows']) echo '<tr><td colspan="6">Aucune facture.</td></tr>';
    foreach ($res['rows'] as $r) {
      $edit = admin_url('admin.php?page=cvi-edit&id=' . (int) $r->id); $st = CVI_Util::status_label($r);
      if ($r->pay_state === 'review') $st .= ' — ⚠ paiement à vérifier';
      elseif ($r->pay_state === 'test') $st .= ' (paiement test reçu)';
      echo '<tr><td><a href="' . esc_url($edit) . '"><strong>' . esc_html($r->number) . '</strong></a></td><td>' . esc_html($r->customer_name) . '<br><small>' . esc_html($r->customer_email) . '</small></td><td>' . esc_html(CVI_Util::fmt_date($r->due_date)) . '</td><td>' . esc_html(CVI_Util::money($r->total_cents)) . '</td><td>' . esc_html($st) . '</td><td>';
      echo '<a href="' . esc_url($edit) . '">' . ($r->status === 'paid' || $r->status === 'cancelled' ? 'Voir' : 'Modifier') . '</a>';
      if ($r->status !== 'draft') echo ' | <a href="' . esc_url(CVI_Util::public_url($r->token)) . '" target="_blank" rel="noopener noreferrer">Lien client</a>';
      echo '</td></tr>';
    }
    echo '</tbody></table>';
    $pages = (int) ceil($res['total'] / self::PER);
    if ($pages > 1) echo '<div class="tablenav"><div class="tablenav-pages">' . wp_kses_post(paginate_links(['base' => add_query_arg('paged', '%#%'), 'format' => '', 'current' => $page, 'total' => $pages])) . '</div></div>';
    echo '<p style="margin-top:16px"><form method="get" action="' . esc_url(admin_url('admin-post.php')) . '" style="display:inline"><input type="hidden" name="action" value="cvi_export">' . wp_nonce_field('cvi_export', '_wpnonce', false, false) . '<button class="button">Exporter en CSV</button></form></p></div>';
  }

  // ---------- Édition ----------
  public static function page_edit() {
    self::guard();
    $id = isset($_GET['id']) ? absint($_GET['id']) : 0; $r = $id ? CVI_DB::get($id) : null;
    if ($id && !$r) wp_die('Facture introuvable.', 404);
    $editable = !$r || in_array($r->status, ['draft', 'sent'], true);
    $v = $r ? (array) $r : ['customer_name' => '', 'customer_email' => '', 'customer_address' => '', 'issue_date' => CVI_Util::today(), 'due_date' => CVI_Util::add_days(CVI_Util::today(), (int) CVI_Settings::get('due_days')),
      'items' => '[]', 'discount_cents' => 0, 'tax_bp' => (int) round(((float) CVI_Settings::get('default_tax')) * 100), 'notes' => '', 'status' => 'draft', 'number' => '', 'total_cents' => 0];
    $lines = CVI_Calc::decode($v['items']); if (!$lines) $lines = [['d' => '', 'q' => 100, 'u' => 0]];
    $dec = function ($c) { return rtrim(rtrim(number_format(((int) $c) / 100, 2, '.', ''), '0'), '.'); };

    echo '<div class="wrap"><h1>' . ($r ? 'Facture ' . esc_html($r->number) : 'Nouvelle facture') . '</h1>';
    if ($r) {
      echo '<p>Statut : <strong>' . esc_html(CVI_Util::status_label($r)) . '</strong>';
      if ($r->status === 'paid') echo ' — payée le ' . esc_html(CVI_Util::fmt_gmt($r->paid_at)) . ($r->paid_via === 'manual' ? ' (encaissement manuel)' : ' par carte');
      if ($r->pay_state === 'review') echo '<br><strong style="color:#b32d2e">Un paiement a été reçu mais n’a pas pu être validé automatiquement (facture annulée ou déjà payée, ou montant différent). Vérifiez-le dans votre tableau de bord Coinvera, remboursez si nécessaire.</strong>';
      echo '</p>';
      if ($r->status !== 'draft') echo '<p>Lien client : <a href="' . esc_url(CVI_Util::public_url($r->token)) . '" target="_blank" rel="noopener noreferrer">' . esc_html(CVI_Util::public_url($r->token)) . '</a></p>';
    }
    $ro = $editable ? '' : ' readonly disabled';
    echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '"><input type="hidden" name="action" value="cvi_save_invoice"><input type="hidden" name="id" value="' . (int) $id . '">'; wp_nonce_field('cvi_save_' . $id);
    echo '<table class="form-table" role="presentation">';
    printf('<tr><th><label for="customer_name">Client</label></th><td><input type="text" id="customer_name" name="customer_name" class="regular-text" maxlength="120" required value="%s"%s></td></tr>', esc_attr($v['customer_name']), $ro);
    printf('<tr><th><label for="customer_email">E-mail du client</label></th><td><input type="email" id="customer_email" name="customer_email" class="regular-text" maxlength="190" value="%s"%s></td></tr>', esc_attr($v['customer_email']), $ro);
    printf('<tr><th><label for="customer_address">Adresse du client</label></th><td><textarea id="customer_address" name="customer_address" rows="3" class="large-text" maxlength="500"%s>%s</textarea></td></tr>', $ro, esc_textarea($v['customer_address']));
    printf('<tr><th><label for="issue_date">Date d’émission</label></th><td><input type="date" id="issue_date" name="issue_date" value="%s"%s></td></tr>', esc_attr($v['issue_date']), $ro);
    printf('<tr><th><label for="due_date">Échéance</label></th><td><input type="date" id="due_date" name="due_date" value="%s"%s></td></tr></table>', esc_attr($v['due_date']), $ro);

    echo '<h2>Lignes</h2><table class="widefat" id="cvi-lines"><thead><tr><th>Description</th><th style="width:100px">Quantité</th><th style="width:140px">Prix unitaire ($)</th><th style="width:120px">Total</th><th style="width:40px"></th></tr></thead><tbody>';
    $row = function ($i, $l) use ($dec, $ro) {
      return '<tr class="cvi-line"><td><input type="text" name="items[' . $i . '][desc]" class="large-text" maxlength="200" value="' . esc_attr($l['d']) . '"' . $ro . '></td><td><input type="text" inputmode="decimal" name="items[' . $i . '][qty]" class="cvi-qty small-text" value="' . esc_attr($dec($l['q'])) . '"' . $ro . '></td>'
        . '<td><input type="text" inputmode="decimal" name="items[' . $i . '][unit]" class="cvi-unit regular-text" style="width:120px" value="' . esc_attr($dec($l['u'])) . '"' . $ro . '></td><td class="cvi-lt">—</td><td>' . ($ro === '' ? '<button type="button" class="button-link cvi-rm" aria-label="Supprimer la ligne">✕</button>' : '') . '</td></tr>';
    };
    foreach (array_values($lines) as $i => $l) echo $row($i, $l);
    echo '</tbody></table>';
    if ($ro === '') { echo '<template id="cvi-tpl">' . $row('__I__', ['d' => '', 'q' => 100, 'u' => 0]) . '</template><p><button type="button" class="button" id="cvi-add">Ajouter une ligne</button></p>'; }
    echo '<table class="form-table" role="presentation">';
    printf('<tr><th><label for="discount">Remise ($)</label></th><td><input type="text" inputmode="decimal" id="discount" name="discount" class="small-text" value="%s"%s></td></tr>', esc_attr($dec($v['discount_cents'])), $ro);
    printf('<tr><th><label for="tax">Taxe (%%)</label></th><td><input type="text" inputmode="decimal" id="tax" name="tax" class="small-text" value="%s"%s></td></tr>', esc_attr($dec($v['tax_bp'])), $ro);
    printf('<tr><th><label for="notes">Notes</label></th><td><textarea id="notes" name="notes" rows="3" class="large-text" maxlength="2000"%s>%s</textarea></td></tr></table>', $ro, esc_textarea($v['notes']));
    echo '<p class="description">Le total affiché ci-dessous est indicatif : il est recalculé et vérifié côté serveur à l’enregistrement. <strong id="cvi-total"></strong></p>';
    if ($editable) submit_button($r ? 'Enregistrer' : 'Créer le brouillon');
    echo '</form>';

    if ($r) {
      echo '<h2>Actions</h2><p>';
      if ($r->status === 'draft') echo self::op_form($r->id, 'send', 'Envoyer au client', '', 'button button-primary') . ' ';
      if ($r->status === 'sent') echo self::op_form($r->id, 'send', 'Renvoyer l’e-mail', '', 'button') . ' ';
      if ($editable) echo self::op_form($r->id, 'paid', 'Marquer comme payée (encaissement manuel)', 'Marquer cette facture comme payée sans paiement par carte ?', 'button') . ' ';
      if ($editable) echo self::op_form($r->id, 'cancel', 'Annuler la facture', 'Annuler cette facture ? Elle ne pourra plus être payée.', 'button') . ' ';
      echo self::op_form($r->id, 'dup', 'Dupliquer', '', 'button') . ' ';
      if ($r->status === 'draft' && $r->cv_payment_id === '') echo self::op_form($r->id, 'delete', 'Supprimer le brouillon', 'Supprimer ce brouillon définitivement ?', 'button');
      echo '</p>';
    }
    echo '</div>';
  }

  public static function save_invoice() {
    self::guard(); $id = isset($_POST['id']) ? absint($_POST['id']) : 0; check_admin_referer('cvi_save_' . $id);
    $name = self::post('customer_name', 120); $email = sanitize_email(self::post('customer_email', 190));
    $issue = self::post('issue_date', 10); $due = self::post('due_date', 10);
    $issue = CVI_Util::valid_date($issue) ? $issue : CVI_Util::today();
    $due = CVI_Util::valid_date($due) ? $due : CVI_Util::add_days($issue, (int) CVI_Settings::get('due_days'));
    $lines = CVI_Calc::lines(isset($_POST['items']) && is_array($_POST['items']) ? wp_unslash($_POST['items']) : []);
    $disc = CVI_Util::to_cents(self::post('discount', 15) ?: '0'); $tax = CVI_Util::to_bp(self::post('tax', 8) ?: '0');
    $tot = (!is_wp_error($lines) && $disc !== null && $tax !== null) ? CVI_Calc::totals($lines, $disc, $tax) : null;
    $same = $id ? 'cvi-edit' : 'cvi-edit';
    if ($name === '' || $due < $issue || !is_array($tot)) self::back($same, 'inv_bad', $id ? ['id' => $id] : []);
    $d = ['customer_name' => $name, 'customer_email' => is_email($email) ? $email : '', 'customer_address' => self::area('customer_address', 500), 'issue_date' => $issue, 'due_date' => $due,
      'items' => CVI_Calc::encode($lines), 'discount_cents' => $tot['discount'], 'tax_bp' => $tax, 'subtotal_cents' => $tot['subtotal'], 'tax_cents' => $tot['tax'], 'total_cents' => $tot['total'], 'notes' => self::area('notes', 2000)];
    if ($id) {
      $old = CVI_DB::get($id); if (!$old) wp_die('Facture introuvable.', 404);
      CVI_DB::update_content($id, $d, (int) $old->total_cents !== (int) $tot['total']);
      self::back('cvi-edit', 'inv_saved', ['id' => $id]);
    }
    $new = CVI_DB::insert($d); if (!$new) self::back('cvi-edit', 'inv_bad');
    self::back('cvi-edit', 'inv_saved', ['id' => $new]);
  }

  public static function op() {
    self::guard(); $id = isset($_POST['id']) ? absint($_POST['id']) : 0; $op = isset($_POST['op']) && is_scalar($_POST['op']) ? sanitize_key((string) $_POST['op']) : '';
    if (!in_array($op, ['send', 'paid', 'cancel', 'dup', 'delete'], true)) wp_die('Requête invalide.', 400);
    check_admin_referer('cvi_op_' . $op . '_' . $id);
    $r = CVI_DB::get($id); if (!$r) wp_die('Facture introuvable.', 404);
    $ret = ['id' => $id];
    switch ($op) {
      case 'send':
        if ($r->status === 'draft') { if (!CVI_DB::mark_sent($id)) self::back('cvi-edit', 'inv_locked', $ret); }
        elseif ($r->status !== 'sent') self::back('cvi-edit', 'inv_locked', $ret);
        $r = CVI_DB::get($id); self::back('cvi-edit', CVI_Mail::invoice($r) ? 'inv_sent' : 'inv_sent_nomail', $ret);
      case 'paid':
        if (!CVI_DB::mark_paid($id, 'manual')) self::back('cvi-edit', 'inv_locked', $ret);
        do_action('cvi_invoice_paid', $id); self::back('cvi-edit', 'inv_paid', $ret);
      case 'cancel':
        self::back('cvi-edit', CVI_DB::cancel($id) ? 'inv_cancelled' : 'inv_locked', $ret);
      case 'delete':
        if (!CVI_DB::delete_draft($id)) self::back('cvi-edit', 'inv_locked', $ret);
        self::back('cvi-invoices', 'inv_deleted');
      case 'dup':
        $d = ['customer_name' => $r->customer_name, 'customer_email' => $r->customer_email, 'customer_address' => $r->customer_address, 'issue_date' => CVI_Util::today(),
          'due_date' => CVI_Util::add_days(CVI_Util::today(), (int) CVI_Settings::get('due_days')), 'items' => $r->items, 'discount_cents' => $r->discount_cents, 'tax_bp' => $r->tax_bp,
          'subtotal_cents' => $r->subtotal_cents, 'tax_cents' => $r->tax_cents, 'total_cents' => $r->total_cents, 'notes' => $r->notes];
        $new = CVI_DB::insert($d); self::back('cvi-edit', $new ? 'inv_dup' : 'inv_bad', $new ? ['id' => $new] : []);
    }
  }

  // ---------- Réglages ----------
  public static function page_settings() {
    self::guard(); $o = CVI_Settings::all();
    $has = function ($k) { return $k !== '' ? ' <em>(enregistrée — laissez vide pour la conserver)</em>' : ''; };
    $in = function ($k, $label, $extra = '', $type = 'text', $desc = '') use ($o) {
      printf('<tr><th><label for="%1$s">%2$s</label></th><td><input type="%3$s" id="%1$s" name="%1$s" class="regular-text" value="%4$s" %5$s>%6$s</td></tr>', esc_attr($k), esc_html($label), esc_attr($type), esc_attr($o[$k]), $extra, $desc ? '<p class="description">' . esc_html($desc) . '</p>' : '');
    };
    echo '<div class="wrap"><h1>Réglages — Factures Coinvera</h1><form method="post" action="' . esc_url(admin_url('admin-post.php')) . '"><input type="hidden" name="action" value="cvi_save_settings">'; wp_nonce_field('cvi_settings');
    echo '<h2>Licence et API</h2><table class="form-table" role="presentation">';
    $in('license_key', 'Clé de licence', 'autocomplete="off"', 'text', 'La même licence que les autres plugins Coinvera (tableau de bord Coinvera → Plugins).');
    $in('public_key', 'Clé API publique', 'autocomplete="off"');
    printf('<tr><th><label for="secret">Clé API secrète</label></th><td><input type="password" id="secret" name="secret" class="regular-text" value="" autocomplete="new-password">%s<p class="description">Stockée chiffrée, jamais réaffichée.</p></td></tr>', $has($o['secret_enc']));
    $in('api_base', 'URL de l’API', '', 'url');
    echo '</table><h2>Votre entreprise (affichée sur les factures)</h2><table class="form-table" role="presentation">';
    $in('company_name', 'Nom'); $in('company_tax_id', 'N° fiscal / TVA');
    printf('<tr><th><label for="company_address">Adresse</label></th><td><textarea id="company_address" name="company_address" rows="3" class="large-text" maxlength="500">%s</textarea></td></tr>', esc_textarea($o['company_address']));
    $in('company_email', 'E-mail de contact (réponses des clients)', '', 'email'); $in('company_logo', 'Logo (URL https)', '', 'url');
    echo '</table><h2>Facturation</h2><table class="form-table" role="presentation">';
    $in('prefix', 'Préfixe de numérotation', 'maxlength="10"', 'text', 'Lettres et chiffres. Les numéros ont la forme PRÉFIXE-2026-0001 et ne sont jamais réutilisés.');
    $in('due_days', 'Délai de paiement (jours)', 'style="width:80px"', 'number'); $in('default_tax', 'Taxe par défaut (%)', 'style="width:80px"');
    printf('<tr><th>Relances</th><td><label><input type="checkbox" name="reminders_on" value="1"%s> Relancer automatiquement les factures en retard</label><br><label for="reminder_days">Jours de retard :</label> <input type="text" id="reminder_days" name="reminder_days" class="regular-text" value="%s"><p class="description">Par exemple « 3,7,14 » : une relance à chaque palier atteint, avec un maximum d’une par jour et par facture.</p></td></tr>', checked($o['reminders_on'], 1, false), esc_attr($o['reminder_days']));
    echo '</table><h2>E-mails</h2><p class="description">Variables : <code>{number} {total} {link} {customer} {company} {due}</code>. Texte brut.</p><table class="form-table" role="presentation">';
    foreach (['invoice' => 'Envoi de la facture', 'reminder' => 'Relance', 'receipt' => 'Reçu de paiement'] as $k => $l) {
      printf('<tr><th>%s</th><td><input type="text" name="tpl_%s_subject" class="large-text" maxlength="150" value="%s"><br><textarea name="tpl_%s_body" rows="6" class="large-text" maxlength="3000">%s</textarea></td></tr>', esc_html($l), $k, esc_attr($o["tpl_{$k}_subject"]), $k, esc_textarea($o["tpl_{$k}_body"]));
    }
    printf('<tr><th>Notifications</th><td><label><input type="checkbox" name="notify_admin" value="1"%s> M’avertir par e-mail à chaque facture payée</label><br><input type="email" name="notify_email" class="regular-text" value="%s" placeholder="%s"></td></tr>', checked($o['notify_admin'], 1, false), esc_attr($o['notify_email']), esc_attr(get_option('admin_email')));
    printf('<tr><th>Désinstallation</th><td><label><input type="checkbox" name="delete_on_uninstall" value="1"%s> Supprimer toutes les factures et réglages à la suppression du plugin</label></td></tr></table>', checked($o['delete_on_uninstall'], 1, false));
    submit_button('Enregistrer'); echo '</form>';

    $url = rest_url('coinvera-invoices/v1/webhook'); $hook_ok = CVI_Settings::webhook_secret() !== '' && get_option('cvi_hook_url') === $url;
    echo '<hr><h2>Webhook (automatique)</h2><p>Enregistré automatiquement chez Coinvera à la sauvegarde des réglages ; il s’ajoute à ceux de vos autres sites et plugins sans les remplacer (5 URL maximum par compte). Les paiements sont confirmés immédiatement ; en secours, une vérification tourne toutes les 5 minutes.</p>';
    echo '<p>URL : <code>' . esc_html($url) . '</code> — état : ' . ($hook_ok ? '<strong>configuré</strong>' : 'non configuré (vérification toutes les 5 minutes)') . '</p>';
    echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '"><input type="hidden" name="action" value="cvi_register_webhook">'; wp_nonce_field('cvi_webhook');
    submit_button($hook_ok ? 'Reconfigurer le webhook' : 'Configurer le webhook maintenant', 'secondary', 'submit', false); echo '</form></div>';
  }

  public static function save_settings() {
    self::guard(); check_admin_referer('cvi_settings'); $def = CVI_Settings::defaults();
    $base = esc_url_raw(self::post('api_base', 200), ['https']);
    $logo = esc_url_raw(self::post('company_logo', 300), ['https']);
    $prefix = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', self::post('prefix', 10)));
    $due = isset($_POST['due_days']) ? absint($_POST['due_days']) : 14; if ($due < 0 || $due > 365) $due = 14;
    $tax = CVI_Util::to_bp(self::post('default_tax', 8) ?: '0');
    $days = CVI_Util::parse_days(self::post('reminder_days', 40));
    $new = ['api_base' => $base !== '' ? untrailingslashit($base) : $def['api_base'], 'public_key' => self::post('public_key', 80), 'license_key' => self::post('license_key', 80),
      'company_name' => self::post('company_name', 120), 'company_tax_id' => self::post('company_tax_id', 60), 'company_address' => self::area('company_address', 500),
      'company_email' => sanitize_email(self::post('company_email', 190)), 'company_logo' => $logo, 'prefix' => $prefix !== '' ? $prefix : 'FAC', 'due_days' => $due,
      'default_tax' => $tax === null ? '0' : CVI_Util::bp_text($tax), 'reminders_on' => empty($_POST['reminders_on']) ? 0 : 1, 'reminder_days' => $days ? implode(',', $days) : '3,7,14',
      'notify_admin' => empty($_POST['notify_admin']) ? 0 : 1, 'notify_email' => sanitize_email(self::post('notify_email', 190)), 'delete_on_uninstall' => empty($_POST['delete_on_uninstall']) ? 0 : 1];
    foreach (['invoice', 'reminder', 'receipt'] as $k) {
      $s = self::post("tpl_{$k}_subject", 150); $b = self::area("tpl_{$k}_body", 3000);
      $new["tpl_{$k}_subject"] = $s !== '' ? $s : $def["tpl_{$k}_subject"]; $new["tpl_{$k}_body"] = $b !== '' ? $b : $def["tpl_{$k}_body"];
    }
    $secret = self::post('secret', 120); if ($secret !== '') $new['secret_enc'] = CVI_Settings::encrypt($secret);
    CVI_Settings::update($new); delete_transient('cvi_license_ok');
    $codes = [];
    if (strlen($new['license_key']) >= 10) { $r = CVI_API::license('activate'); $codes[] = is_wp_error($r) ? 'lic_net' : (!empty($r['valid']) ? 'lic_ok' : 'lic_bad'); }
    if (CVI_Settings::configured()) { delete_transient('cvi_hook_try'); $codes[] = self::register_webhook_now(); }
    self::back('cvi-settings', $codes ? implode(',', $codes) : 'saved');
  }

  /** Ajoute l'URL de ce site à la liste des webhooks du compte Coinvera (sans remplacer les autres) et garde le secret. Retourne un code de notice. */
  public static function register_webhook_now() {
    $url = rest_url('coinvera-invoices/v1/webhook');
    $r = CVI_API::register_webhook($url);
    if (!is_wp_error($r) && $r['code'] === 200 && !empty($r['data']['secret']) && is_string($r['data']['secret'])) {
      CVI_Settings::update(['webhook_secret_enc' => CVI_Settings::encrypt($r['data']['secret'])]); update_option('cvi_hook_url', $url, false); return 'hook_ok';
    }
    return (!is_wp_error($r) && $r['code'] === 409) ? 'hook_full' : 'hook_bad';
  }
  /** Installations sans webhook : à l'ouverture d'une page du plugin, une tentative toutes les 6 h au plus. */
  public static function maybe_auto_webhook() {
    $page = isset($_GET['page']) ? sanitize_key(wp_unslash($_GET['page'])) : '';
    if (strpos($page, 'cvi-') !== 0 || wp_doing_ajax() || wp_doing_cron() || !current_user_can(apply_filters('cvi_capability', self::CAP)) || !CVI_Settings::configured()) return;
    if (CVI_Settings::webhook_secret() !== '' && get_option('cvi_hook_url') === rest_url('coinvera-invoices/v1/webhook')) return;
    if (get_transient('cvi_hook_try')) return;
    set_transient('cvi_hook_try', 1, 6 * HOUR_IN_SECONDS);
    self::register_webhook_now();
  }
  public static function register_webhook() {
    self::guard(); check_admin_referer('cvi_webhook');
    self::back('cvi-settings', CVI_Settings::configured() ? self::register_webhook_now() : 'hook_bad');
  }

  // ---------- Export CSV ----------
  public static function export() {
    self::guard(); check_admin_referer('cvi_export');
    nocache_headers(); header('Content-Type: text/csv; charset=utf-8'); header('Content-Disposition: attachment; filename="factures-' . gmdate('Ymd') . '.csv"');
    $out = fopen('php://output', 'w'); fwrite($out, "\xEF\xBB\xBF");
    fputcsv($out, ['Numéro', 'Statut', 'Client', 'E-mail', 'Émission', 'Échéance', 'Sous-total', 'Remise', 'Taxe', 'Total', 'Payée le', 'Mode']);
    $today = CVI_Util::today();
    for ($p = 1; $p <= 50; $p++) {   // 5 000 factures maximum par export
      $res = CVI_DB::search('', '', $p, 100, $today); if (!$res['rows']) break;
      foreach ($res['rows'] as $r) fputcsv($out, array_map([CVI_Util::class, 'csv_cell'], [$r->number, CVI_Util::status_label($r), $r->customer_name, $r->customer_email, $r->issue_date, $r->due_date,
        number_format($r->subtotal_cents / 100, 2, '.', ''), number_format($r->discount_cents / 100, 2, '.', ''), number_format($r->tax_cents / 100, 2, '.', ''), number_format($r->total_cents / 100, 2, '.', ''), CVI_Util::fmt_gmt($r->paid_at), (string) $r->paid_via]));
    }
    fclose($out); exit;
  }
}
