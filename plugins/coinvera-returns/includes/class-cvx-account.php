<?php
if (!defined('ABSPATH')) exit;

final class CVX_Account {
  const EP = 'retours';

  public static function init() {
    add_action('init', [__CLASS__, 'add_endpoint']);
    add_filter('woocommerce_account_menu_items', [__CLASS__, 'menu_item']);
    add_action('woocommerce_account_' . self::EP . '_endpoint', [__CLASS__, 'content']);
    add_filter('woocommerce_my_account_my_orders_actions', [__CLASS__, 'order_action'], 10, 2);
    add_action('admin_post_cvx_submit', [__CLASS__, 'handle_submit']);
    add_filter('query_vars', function ($v) { $v[] = self::EP; return $v; });
  }
  public static function add_endpoint() { add_rewrite_endpoint(self::EP, EP_ROOT | EP_PAGES); }

  public static function menu_item($items) {
    $logout = $items['customer-logout'] ?? null; unset($items['customer-logout']);
    $items[self::EP] = __('Retours', 'coinvera-returns'); if ($logout) $items['customer-logout'] = $logout;
    return $items;
  }

  public static function eligible(WC_Order $order) {
    return CVX_Settings::enabled() && in_array($order->get_status(), CVX_Settings::allowed_statuses(), true) && (time() - CVX_Util::reference_timestamp($order)) <= CVX_Settings::window_seconds();
  }

  public static function order_action($actions, $order) {
    if (self::eligible($order)) $actions['cvx_return'] = ['url' => wc_get_account_endpoint_url(self::EP) . '?order=' . $order->get_id(), 'name' => __('Retour / échange', 'coinvera-returns')];
    return $actions;
  }

  // ---------- Rendu de l'onglet ----------
  public static function content() {
    if (!CVX_Woo_present()) { echo '<p>' . esc_html__('Indisponible pour le moment.', 'coinvera-returns') . '</p>'; return; }
    $uid = get_current_user_id();
    if (isset($_GET['cvx_done'])) self::render_done();
    $order_id = isset($_GET['order']) ? absint($_GET['order']) : 0;
    if ($order_id) { self::render_form($order_id, $uid); return; }
    self::render_list($uid);
  }

  private static function render_done() {
    $done = sanitize_key(wp_unslash($_GET['cvx_done']));
    if ($done === 'avoir') {
      $code = isset($_GET['code']) ? sanitize_text_field(wp_unslash($_GET['code'])) : '';
      printf('<div class="woocommerce-message">%s <code>%s</code>. %s</div>', esc_html__('Votre bon d’achat est prêt, code :', 'coinvera-returns'), esc_html($code), esc_html__('Il vous a aussi été envoyé par e-mail.', 'coinvera-returns'));
    } elseif ($done === 'pending') echo '<div class="woocommerce-message">' . esc_html__('Votre demande a bien été reçue. Nous revenons vers vous rapidement.', 'coinvera-returns') . '</div>';
    elseif ($done === 'error') echo '<div class="woocommerce-error">' . esc_html__('Cette demande n’a pas pu être enregistrée : vérifiez les articles sélectionnés.', 'coinvera-returns') . '</div>';
  }

  private static function render_list($uid) {
    $orders = wc_get_orders(['customer_id' => $uid, 'status' => CVX_Settings::allowed_statuses(), 'limit' => 20, 'orderby' => 'date', 'order' => 'DESC']);
    $eligible = array_values(array_filter($orders, [__CLASS__, 'eligible']));
    echo '<h3>' . esc_html__('Demander un retour ou un échange', 'coinvera-returns') . '</h3>';
    if (!$eligible) echo '<p>' . esc_html__('Aucune commande éligible pour le moment.', 'coinvera-returns') . '</p>';
    else { echo '<table class="woocommerce-orders-table shop_table"><tbody>';
      foreach ($eligible as $o) printf('<tr><td>#%s — %s</td><td style="text-align:right"><a class="button" href="%s">%s</a></td></tr>',
        esc_html($o->get_order_number()), esc_html(wc_format_datetime($o->get_date_created())), esc_url(wc_get_account_endpoint_url(self::EP) . '?order=' . $o->get_id()), esc_html__('Demander', 'coinvera-returns'));
      echo '</tbody></table>'; }

    $mine = CVX_DB::for_customer($uid);
    if ($mine) { echo '<h3 style="margin-top:28px">' . esc_html__('Mes demandes', 'coinvera-returns') . '</h3><table class="woocommerce-orders-table shop_table"><thead><tr><th>' . esc_html__('Commande', 'coinvera-returns') . '</th><th>' . esc_html__('Type', 'coinvera-returns') . '</th><th>' . esc_html__('Statut', 'coinvera-returns') . '</th></tr></thead><tbody>';
      $types = ['avoir' => 'Avoir', 'remboursement' => 'Remboursement', 'echange' => 'Échange']; $statuses = ['pending' => 'En attente', 'approved' => 'Approuvée', 'rejected' => 'Refusée', 'completed' => 'Traitée'];
      foreach ($mine as $r) printf('<tr><td>#%d</td><td>%s</td><td>%s</td></tr>', (int) $r->order_id, esc_html($types[$r->type] ?? $r->type), esc_html($statuses[$r->status] ?? $r->status));
      echo '</tbody></table>'; }
  }

  private static function render_form($order_id, $uid) {
    $order = wc_get_order($order_id);
    if (!$order || (int) $order->get_customer_id() !== (int) $uid || !self::eligible($order)) { echo '<p>' . esc_html__('Cette commande n’est pas éligible à un retour.', 'coinvera-returns') . '</p>'; return; }
    echo '<p><a href="' . esc_url(wc_get_account_endpoint_url(self::EP)) . '">&larr; ' . esc_html__('Retour à la liste', 'coinvera-returns') . '</a></p>';
    printf('<h3>%s #%s</h3>', esc_html__('Retour / échange — commande', 'coinvera-returns'), esc_html($order->get_order_number()));
    echo '<form method="post" action="' . esc_url(admin_url('admin-post.php')) . '">';
    wp_nonce_field('cvx_submit_' . $order_id); echo '<input type="hidden" name="action" value="cvx_submit"><input type="hidden" name="order_id" value="' . (int) $order_id . '">';
    echo '<table class="woocommerce-orders-table shop_table"><thead><tr><th></th><th>' . esc_html__('Article', 'coinvera-returns') . '</th><th>' . esc_html__('Quantité à retourner', 'coinvera-returns') . '</th></tr></thead><tbody>';
    foreach ($order->get_items() as $item_id => $item) {
      $max = (int) $item->get_quantity() - CVX_DB::already_requested_qty($order_id, $item_id); if ($max <= 0) continue;
      printf('<tr><td><input type="checkbox" name="sel[]" value="%1$d"></td><td>%2$s</td><td><input type="number" name="qty[%1$d]" value="%3$d" min="1" max="%3$d" style="width:70px"></td></tr>', $item_id, esc_html($item->get_name()), $max);
    }
    echo '</tbody></table>';
    echo '<p><label><strong>' . esc_html__('Raison', 'coinvera-returns') . '</strong><br><select name="reason">';
    foreach (CVX_Settings::REASONS as $k => $l) printf('<option value="%s">%s</option>', esc_attr($k), esc_html($l));
    echo '</select></label></p>';
    echo '<p><strong>' . esc_html__('Comment souhaitez-vous être dédommagé ?', 'coinvera-returns') . '</strong></p>';
    printf('<p><label><input type="radio" name="type" value="avoir" checked> %s <strong style="color:#1a7f37">(+%s%%, émis immédiatement)</strong></label></p>', esc_html__('Avoir à utiliser sur une prochaine commande', 'coinvera-returns'), esc_html((string) CVX_Settings::bonus_pct()));
    if (CVX_Settings::allow_refund()) printf('<p><label><input type="radio" name="type" value="remboursement"> %s <span class="mut">(%s)</span></label></p>', esc_html__('Remboursement sur mon moyen de paiement', 'coinvera-returns'), esc_html__('soumis à validation', 'coinvera-returns'));
    if (CVX_Settings::allow_exchange()) printf('<p><label><input type="radio" name="type" value="echange"> %s <span class="mut">(%s)</span></label></p>', esc_html__('Échange contre un autre article', 'coinvera-returns'), esc_html__('soumis à validation', 'coinvera-returns'));
    echo '<p><label>' . esc_html__('Précisions (facultatif — ex. taille/couleur souhaitée pour un échange)', 'coinvera-returns') . '<br><textarea name="note" rows="3" style="width:100%;max-width:480px"></textarea></label></p>';
    echo '<button type="submit" class="button alt">' . esc_html__('Envoyer la demande', 'coinvera-returns') . '</button></form>';
  }

  // ---------- Traitement ----------
  public static function handle_submit() {
    $order_id = isset($_POST['order_id']) ? absint($_POST['order_id']) : 0;
    check_admin_referer('cvx_submit_' . $order_id);
    if (!is_user_logged_in()) wp_die(esc_html__('Connexion requise.', 'coinvera-returns'), 401);
    $order = wc_get_order($order_id);
    $back = fn($q) => wp_safe_redirect(add_query_arg($q, wc_get_account_endpoint_url(self::EP)));
    if (!$order || (int) $order->get_customer_id() !== get_current_user_id() || !self::eligible($order)) { $back(['cvx_done' => 'error']); exit; }

    $sel = array_map('absint', (array) ($_POST['sel'] ?? [])); $qtys = (array) ($_POST['qty'] ?? []);
    $items = []; $order_items = $order->get_items();
    foreach ($sel as $item_id) {
      if (!isset($order_items[$item_id])) continue;
      $max = (int) $order_items[$item_id]->get_quantity() - CVX_DB::already_requested_qty($order_id, $item_id);
      $qty = min($max, max(0, absint($qtys[$item_id] ?? 0)));
      if ($qty > 0) $items[$item_id] = ['item_id' => $item_id, 'qty' => $qty, 'name' => $order_items[$item_id]->get_name()];
    }
    if (!$items) { $back(['cvx_done' => 'error']); exit; }

    $type = sanitize_key($_POST['type'] ?? 'avoir');
    if ($type === 'remboursement' && !CVX_Settings::allow_refund()) $type = 'avoir';
    if ($type === 'echange' && !CVX_Settings::allow_exchange()) $type = 'avoir';
    $reason = isset(CVX_Settings::REASONS[$_POST['reason'] ?? '']) ? sanitize_key($_POST['reason']) : 'autre';
    $note = CVX_Util::one_line($_POST['note'] ?? '');
    $amount = CVX_Credit::items_total($order, array_map(fn($i) => $i['qty'], $items));

    $row = ['order_id' => $order_id, 'customer_id' => get_current_user_id(), 'type' => $type, 'reason' => $reason, 'note' => $note, 'items' => wp_json_encode(array_values($items)), 'amount' => $amount, 'status' => 'pending', 'coupon_code' => '', 'admin_note' => ''];

    if ($type === 'avoir') {
      $c = CVX_Credit::issue_credit($order, $amount);
      $row['status'] = 'approved'; $row['amount'] = $c['amount']; $row['coupon_code'] = $c['code'];
      CVX_DB::insert($row);
      $order->add_order_note(sprintf('Coinvera Returns : avoir de %s émis (code %s).', wc_price($c['amount']), $c['code']));
      wp_mail($order->get_billing_email(), sprintf(__('Votre bon d’achat — %s', 'coinvera-returns'), get_bloginfo('name')),
        sprintf(__("Bonjour,\n\nVotre demande de retour a été acceptée.\nVoici votre code de bon d'achat : %s\nMontant : %s\nValable jusqu'au %s.\n\nMerci.", 'coinvera-returns'), $c['code'], wp_strip_all_tags(wc_price($c['amount'])), date_i18n('d/m/Y', time() + CVX_Settings::credit_expiry_seconds())));
      $back(['cvx_done' => 'avoir', 'code' => $c['code']]); exit;
    }

    $id = CVX_DB::insert($row);
    $order->add_order_note(sprintf('Coinvera Returns : nouvelle demande de %s (#%d), en attente de validation.', $type === 'remboursement' ? 'remboursement' : 'échange', $id));
    if (CVX_Settings::get('notify_admin')) wp_mail(CVX_Settings::notify_email(), sprintf('[%s] Nouvelle demande de %s', get_bloginfo('name'), $type),
      sprintf("Commande #%s\nType : %s\nMontant estimé : %s\n\nVoir : %s", $order->get_order_number(), $type, wp_strip_all_tags(wc_price($amount)), admin_url('admin.php?page=cvx-requests')));
    $back(['cvx_done' => 'pending']); exit;
  }
}

if (!function_exists('CVX_Woo_present')) { function CVX_Woo_present() { return class_exists('WooCommerce'); } }
