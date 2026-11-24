<?php
if (!defined('ABSPATH')) exit;

/**
 * Paiement fractionné géré par le marchand, sans passerelle dédiée :
 *  - Au checkout classique, le client choisit « totalité », « acompte » ou « 2 / 3 fois ». Le choix ajoute un frais NÉGATIF
 *    (« Reste à payer plus tard ») : la commande ne porte que le montant dû maintenant, que n'importe quelle passerelle encaisse.
 *  - Quand cette première commande est payée, le plan est enregistré : chaque échéance restante devient, à sa date, une commande
 *    « enfant » en attente de paiement dont le lien est envoyé au client (e-mail, et WhatsApp si configuré).
 *  - La commande d'origine ne peut pas passer en « Terminée » tant que tout n'est pas payé (réglable).
 * Compatible HPOS : uniquement l'API objet WC_Order. Le checkout en BLOCS n'est pas pris en charge : sans sélection, le
 * paiement reste intégral (jamais un paiement partiel par erreur).
 */
final class CVP_Woo {
  const FEE = 'Reste à payer plus tard';
  const PLANS = ['full', 'deposit', 'split2', 'split3'];
  private static $active = false;   // vrai pendant une requête AJAX/validation de checkout : le frais ne s'applique ni au panier ni ailleurs
  private static $busy = false;

  public static function present() { return class_exists('WooCommerce'); }

  public static function init() {
    if (!self::present()) return;
    add_action('woocommerce_checkout_update_order_review', [__CLASS__, 'from_post_data']);
    add_action('woocommerce_checkout_process', [__CLASS__, 'from_submit']);
    add_action('woocommerce_cart_calculate_fees', [__CLASS__, 'calc_fees'], 99);
    add_action('woocommerce_review_order_before_payment', [__CLASS__, 'render_selector']);
    add_action('wp_footer', [__CLASS__, 'footer_js']);
    add_action('woocommerce_checkout_create_order', [__CLASS__, 'tag_order'], 10, 1);
    add_action('woocommerce_order_status_changed', [__CLASS__, 'on_status'], 10, 3);
    add_filter('woocommerce_order_actions', [__CLASS__, 'order_actions']);
    add_action('woocommerce_order_action_cvp_request', [__CLASS__, 'action_request']);
    add_action('woocommerce_admin_order_data_after_billing_address', [__CLASS__, 'admin_box']);
    add_action('woocommerce_thankyou', [__CLASS__, 'thankyou']);
  }

  // ---------- Montants (plus petite unité monétaire : pas d'erreur d'arrondi flottant) ----------
  public static function factor() { return pow(10, max(0, (int) wc_get_price_decimals())); }
  public static function minor($x) { return (int) round(((float) $x) * self::factor()); }
  public static function major($m) { return ((int) $m) / self::factor(); }
  public static function price($m, $cur = '') { return wc_price(self::major($m), $cur !== '' ? ['currency' => $cur] : []); }
  private static function plain($html) { return trim(html_entity_decode(wp_strip_all_tags((string) $html), ENT_QUOTES, 'UTF-8')); }

  /** Montant payé maintenant pour un plan, base = total complet en unités mineures. */
  public static function first_part($plan, $base) {
    if ($plan === 'deposit') { $pct = CVP_Settings::int('deposit_pct', 1, 99); return max(1, min($base - 1, (int) round($base * $pct / 100))); }
    $n = $plan === 'split3' ? 3 : 2; $part = intdiv($base, $n); return $base - $part * ($n - 1);
  }
  private static function later_part($plan, $base) { $n = $plan === 'split3' ? 3 : 2; return intdiv($base, $n); }

  // ---------- Choix du client (checkout classique) ----------
  private static function set_plan($plan) {
    if (!function_exists('WC') || !WC()->session) return;
    $plan = sanitize_key((string) $plan); if (!in_array($plan, self::PLANS, true)) $plan = 'full';
    WC()->session->set('cvp_plan', $plan); self::$active = true;
  }
  public static function from_post_data($posted) { $d = []; parse_str((string) $posted, $d); self::set_plan($d['cvp_plan'] ?? 'full'); }
  public static function from_submit() { self::set_plan(isset($_POST['cvp_plan']) ? wp_unslash((string) $_POST['cvp_plan']) : 'full'); }   // phpcs:ignore WordPress.Security.NonceVerification -- le nonce du checkout est déjà vérifié par WooCommerce

  private static function base_minor($cart) {
    $t = (float) $cart->get_cart_contents_total() + (float) $cart->get_cart_contents_tax() + (float) $cart->get_shipping_total() + (float) $cart->get_shipping_tax();
    foreach ($cart->get_fees() as $f) if ((string) $f->name !== self::FEE) $t += (float) ($f->total ?? $f->amount ?? 0);
    return self::minor($t);
  }

  public static function calc_fees($cart) {
    if (!function_exists('WC') || !WC()->session || (is_admin() && !wp_doing_ajax())) return;
    if (!(self::$active || is_checkout())) return;
    WC()->session->set('cvp_base_minor', 0);
    if (!CVP_Settings::enabled() || !CVP_API::licensed()) return;
    $base = self::base_minor($cart);
    if ($base <= 0 || $base < self::minor(CVP_Settings::get('min_total'))) return;
    WC()->session->set('cvp_base_minor', $base);
    $plan = (string) WC()->session->get('cvp_plan');
    if (!CVP_Settings::plan_enabled($plan)) return;
    $balance = $base - self::first_part($plan, $base);
    if ($balance > 0) $cart->add_fee(self::FEE, -self::major($balance), false);
  }

  public static function render_selector() {
    if (!function_exists('WC') || !WC()->session || is_wc_endpoint_url('order-pay')) return;
    $base = (int) WC()->session->get('cvp_base_minor'); if ($base <= 0) return;
    $cur = (string) WC()->session->get('cvp_plan'); if (!CVP_Settings::plan_enabled($cur)) $cur = 'full';
    $days = CVP_Settings::int('interval_days', 1, 90);
    $opts = ['full' => 'Payer la totalité maintenant (' . self::price($base) . ')'];
    if (CVP_Settings::plan_enabled('deposit')) { $f = self::first_part('deposit', $base); $opts['deposit'] = sprintf('Acompte de %d %% : %s maintenant, le solde de %s avant la livraison', CVP_Settings::int('deposit_pct', 1, 99), self::price($f), self::price($base - $f)); }
    if (CVP_Settings::plan_enabled('split2')) $opts['split2'] = sprintf('Payer en 2 fois : %s maintenant, puis %s dans %d jours', self::price(self::first_part('split2', $base)), self::price(self::later_part('split2', $base)), $days);
    if (CVP_Settings::plan_enabled('split3')) $opts['split3'] = sprintf('Payer en 3 fois : %s maintenant, puis 2 × %s (tous les %d jours)', self::price(self::first_part('split3', $base)), self::price(self::later_part('split3', $base)), $days);
    if (count($opts) < 2) return;
    echo '<div id="cvp-plans" style="margin:0 0 20px"><h3 style="margin:0 0 8px">Mode de règlement</h3>';
    foreach ($opts as $k => $label) printf('<label style="display:block;margin:6px 0"><input type="radio" name="cvp_plan" value="%s"%s> %s</label>', esc_attr($k), checked($cur, $k, false), wp_kses_post($label));
    echo '</div>';
  }
  public static function footer_js() {
    if (!function_exists('is_checkout') || !is_checkout()) return;
    echo '<script>jQuery(function($){$(document.body).on("change","input[name=cvp_plan]",function(){$(document.body).trigger("update_checkout");});});</script>';
  }

  /** À la création de la commande : relève le frais négatif (source de vérité du solde) et marque la commande. */
  public static function tag_order($order) {
    if (!function_exists('WC') || !WC()->session) return;
    $plan = (string) WC()->session->get('cvp_plan');
    WC()->session->set('cvp_plan', 'full');   // le prochain panier repart sur un paiement intégral
    if (!CVP_Settings::plan_enabled($plan)) return;
    foreach ($order->get_fees() as $item) {
      if ($item->get_name() !== self::FEE) continue;
      $bal = self::minor(-1 * (float) $item->get_total()); if ($bal <= 0) return;
      $order->update_meta_data('_cvp_plan', $plan); $order->update_meta_data('_cvp_balance_minor', $bal); return;
    }
  }

  // ---------- Plan de paiement ----------
  public static function on_status($order_id, $from, $to) {
    $order = wc_get_order($order_id); if (!$order) return;
    $item_id = (int) $order->get_meta('_cvp_item');
    if ($item_id) {   // commande d'échéance
      if (in_array($to, ['processing', 'completed'], true)) self::child_paid($order, $item_id);
      elseif ($to === 'cancelled') { $row = CVP_DB::by_child($order_id); if ($row && $row->status === 'requested') CVP_DB::set_status($row->id, 'cancelled'); }
      return;
    }
    $plan = (string) $order->get_meta('_cvp_plan'); if ($plan === '') return;
    if (in_array($to, ['processing', 'completed'], true) && !$order->get_meta('_cvp_plan_created')) self::create_plan($order, $plan);
    if ($to === 'completed' && CVP_Settings::block_complete() && !self::$busy && $order->get_meta('_cvp_plan_created') && CVP_DB::unpaid_count($order_id) > 0) {
      self::$busy = true; $order->update_status('processing', 'Coinvera Installments : paiement non soldé, la commande reste en traitement.'); self::$busy = false;
    }
    if (in_array($to, ['cancelled', 'refunded'], true) && $order->get_meta('_cvp_plan_created')) {
      foreach (CVP_DB::for_order($order_id) as $row) { if ((int) $row->child_order_id && $row->status === 'requested') { $c = wc_get_order($row->child_order_id); if ($c && $c->has_status(['pending', 'failed', 'on-hold'])) $c->update_status('cancelled', 'Commande d’origine annulée.'); } }
      CVP_DB::cancel_open($order_id);
    }
  }

  private static function create_plan($order, $plan) {
    $order->update_meta_data('_cvp_plan_created', 1); $order->save();   // posé d'abord : jamais deux plans (la base impose aussi l'unicité)
    $bal = (int) $order->get_meta('_cvp_balance_minor'); if ($bal <= 0) return;
    $id = $order->get_id(); $day = DAY_IN_SECONDS; $interval = CVP_Settings::int('interval_days', 1, 90);
    if ($plan === 'deposit') { $bd = CVP_Settings::int('balance_days', 0, 90); CVP_DB::add($id, 1, $bal, $bd > 0 ? time() + $bd * $day : 0); $n = 1; }
    else {
      $n = $plan === 'split3' ? 2 : 1; $part = intdiv($bal, $n);
      for ($i = 1; $i <= $n; $i++) CVP_DB::add($id, $i, $i === $n ? $bal - $part * ($n - 1) : $part, time() + $i * $interval * $day);
    }
    $order->add_order_note(sprintf('Coinvera Installments : %s payé. Reste %s en %d échéance(s)%s.', self::plain(self::price(self::minor($order->get_total()), $order->get_currency())), self::plain(self::price($bal, $order->get_currency())), $n, $plan === 'deposit' && CVP_Settings::int('balance_days', 0, 90) === 0 ? ' à demander manuellement' : ''));
  }

  private static function child_paid($child, $item_id) {
    if (!CVP_DB::mark_paid($item_id)) return;
    $pid = (int) $child->get_meta('_cvp_parent'); $parent = $pid ? wc_get_order($pid) : null; if (!$parent) return;
    $parent->add_order_note('Coinvera Installments : échéance payée (commande #' . $child->get_order_number() . ').');
    if (CVP_DB::unpaid_count($pid) === 0) $parent->add_order_note('Coinvera Installments : plan intégralement payé, la commande peut être terminée.');
  }

  /** Crée la commande d'échéance (ou, pour un rappel, réutilise la même) et envoie le lien de paiement. */
  public static function request_item($row, $reminder = false) {
    $parent = wc_get_order($row->order_id); if (!$parent) return false;
    if (!$reminder) {
      $child = wc_create_order(['status' => 'pending', 'parent' => $parent->get_id(), 'customer_id' => $parent->get_customer_id(), 'created_via' => 'coinvera-installments', 'currency' => $parent->get_currency()]);
      if (is_wp_error($child) || !$child) return false;
      $child->set_address($parent->get_address('billing'), 'billing'); $child->set_address($parent->get_address('shipping'), 'shipping');
      $total = count(CVP_DB::for_order($row->order_id)) + 1;
      $fee = new WC_Order_Item_Fee(); $amt = self::major($row->amount_minor);
      $fee->set_name($total === 2 ? sprintf('Solde de la commande #%s', $parent->get_order_number()) : sprintf('Échéance %d/%d de la commande #%s', (int) $row->seq + 1, $total, $parent->get_order_number()));
      $fee->set_amount($amt); $fee->set_total($amt); $fee->set_tax_status('none');
      $child->add_item($fee); $child->calculate_totals(false);
      $child->update_meta_data('_cvp_item', (int) $row->id); $child->update_meta_data('_cvp_parent', $parent->get_id()); $child->save();
      CVP_DB::set_requested($row->id, $child->get_id());
    } else {
      $child = wc_get_order($row->child_order_id); if (!$child || !$child->has_status(['pending', 'failed', 'on-hold'])) return false;
    }
    self::notify($parent, $child, $row, $reminder);
    $parent->add_order_note(sprintf('Coinvera Installments : %s envoyé pour %s (commande #%s).', $reminder ? 'rappel' : 'lien de paiement', self::plain(self::price($row->amount_minor, $parent->get_currency())), $child->get_order_number()));
    return true;
  }

  private static function notify($parent, $child, $row, $reminder) {
    $shop = wp_specialchars_decode(get_bloginfo('name'), ENT_QUOTES); $url = $child->get_checkout_payment_url();
    $amount = self::plain(self::price($row->amount_minor, $parent->get_currency())); $num = $parent->get_order_number();
    $email = $parent->get_billing_email();
    if (is_email($email)) {
      $first = $parent->get_billing_first_name();
      $body = ($first !== '' ? "Bonjour $first,\n\n" : "Bonjour,\n\n") . ($reminder ? "Rappel : " : '') . "un paiement de $amount est à régler pour votre commande #$num chez $shop.\n\nPayer maintenant : $url\n\nMerci,\n$shop";
      wp_mail($email, sprintf('%s%s : paiement de %s à régler (commande #%s)', $reminder ? 'Rappel — ' : '', $shop, $amount, $num), $body);
    }
    $phone = $parent->get_billing_phone();
    if (CVP_Settings::notify_whatsapp() && $phone !== '') {
      $r = CVP_API::send_whatsapp($phone, $parent->get_billing_country(), 'installment', [$shop, (string) $num, $amount, $url], 'inst-' . (int) $row->id . '-' . ($reminder ? 1 : 0));
      $ok = !is_wp_error($r) && (int) ($r['code'] ?? 0) >= 200 && (int) ($r['code'] ?? 0) < 300 && (!empty($r['data']['sent']) || !empty($r['data']['simulated']));
      if (!$ok) $parent->add_order_note('Coinvera Installments : envoi WhatsApp impossible (le lien a été envoyé par e-mail).');
    }
  }

  /** Cron horaire : échéances arrivées à terme, puis rappels uniques des échéances impayées depuis N jours. */
  public static function run() {
    if (!CVP_Settings::enabled() || !CVP_API::licensed()) return;
    foreach (CVP_DB::due_now() as $row) self::request_item($row, false);
    foreach (CVP_DB::overdue_unreminded(CVP_Settings::int('overdue_days', 1, 60)) as $row) {
      CVP_DB::mark_reminded($row->id);   // marqué d'abord : un seul rappel, même si l'envoi échoue
      if (self::request_item($row, true)) wp_mail(get_option('admin_email'), 'Paiement en retard — commande #' . $row->order_id, sprintf("Une échéance de %s est impayée depuis plus de %d jours pour la commande #%d. Un rappel a été envoyé au client.\n\n%s", self::plain(self::price($row->amount_minor)), CVP_Settings::int('overdue_days', 1, 60), (int) $row->order_id, admin_url('admin.php?page=wc-orders&action=edit&id=' . (int) $row->order_id)));
    }
  }

  // ---------- Écran de commande ----------
  public static function order_actions($a) {
    global $theorder; if (!($theorder instanceof WC_Order) || !$theorder->get_meta('_cvp_plan_created') || $theorder->get_meta('_cvp_item')) return $a;
    if (CVP_DB::next_open($theorder->get_id())) $a['cvp_request'] = 'Coinvera Installments : demander le prochain paiement maintenant';
    return $a;
  }
  public static function action_request($order) {
    if (!($order instanceof WC_Order) || !CVP_API::licensed()) return;
    $row = CVP_DB::next_open($order->get_id()); if (!$row) return;
    if ($row->status === 'cancelled') CVP_DB::set_status($row->id, 'scheduled');
    self::request_item($row, false);
  }
  public static function admin_box($order) {
    $plan = (string) $order->get_meta('_cvp_plan'); if ($plan === '' || !$order->get_meta('_cvp_plan_created')) return;
    $rows = CVP_DB::for_order($order->get_id()); $due = 0; foreach ($rows as $r) if ($r->status !== 'paid') $due += (int) $r->amount_minor;
    $names = ['deposit' => 'Acompte', 'split2' => 'Paiement en 2 fois', 'split3' => 'Paiement en 3 fois'];
    echo '<p><strong>Coinvera Installments :</strong> ' . esc_html($names[$plan] ?? $plan) . '<br><strong>Reste à payer :</strong> ' . ($due > 0 ? wp_kses_post(self::price($due, $order->get_currency())) : 'rien, plan soldé') . '</p>';
  }
  public static function thankyou($order_id) {
    $order = wc_get_order($order_id); if (!$order || (string) $order->get_meta('_cvp_plan') === '') return;
    $bal = (int) $order->get_meta('_cvp_balance_minor'); if ($bal <= 0) return;
    echo '<p>Paiement en plusieurs fois : le reste de ' . wp_kses_post(self::price($bal, $order->get_currency())) . ' vous sera demandé plus tard, avec un lien de paiement par e-mail' . (CVP_Settings::notify_whatsapp() ? ' et par WhatsApp' : '') . '.</p>';
  }
}
