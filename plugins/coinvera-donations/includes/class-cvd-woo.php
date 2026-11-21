<?php
if (!defined('ABSPATH')) exit;

/**
 * Mode « via WooCommerce » : le formulaire de don met un produit « Don » (masqué, prix libre) au panier et le visiteur
 * paie avec n'importe quelle passerelle WooCommerce (dont Coinvera). Le don est enregistré quand la commande est payée
 * (statut « en cours » ou « terminée ») et n'est plus compté si elle est annulée, échouée ou remboursée.
 * Compatible HPOS (commandes en tables dédiées) : uniquement l'API objet WC_Order, jamais get_post_meta.
 */
final class CVD_Woo {
  const OPT_PRODUCT = 'cvd_wc_product';

  public static function present() { return class_exists('WooCommerce'); }
  /** Mode actif : réglé sur WooCommerce, WooCommerce présent et boutique en USD (devise unique des dons Coinvera). */
  public static function mode_on() {
    return CVD_Settings::get('checkout_mode') === 'woocommerce' && self::present() && function_exists('get_woocommerce_currency') && get_woocommerce_currency() === 'USD';
  }

  public static function init() {
    add_action('admin_post_nopriv_cvd_woo_add', [__CLASS__, 'add']);
    add_action('admin_post_cvd_woo_add', [__CLASS__, 'add']);
    if (!self::present()) return;
    add_action('woocommerce_before_calculate_totals', [__CLASS__, 'price_cart'], 20);
    add_filter('woocommerce_is_sold_individually', [__CLASS__, 'single'], 10, 2);
    add_action('woocommerce_checkout_create_order_line_item', [__CLASS__, 'line_meta'], 10, 3);
    add_action('woocommerce_order_status_changed', [__CLASS__, 'on_status'], 10, 3);
  }

  /** Produit « Don » : virtuel, masqué du catalogue, sans taxe. Créé à la demande. */
  public static function product_id() {
    if (!self::present() || !class_exists('WC_Product_Simple')) return 0;
    $id = (int) get_option(self::OPT_PRODUCT);
    if ($id && get_post_type($id) === 'product' && get_post_status($id) === 'publish') return $id;
    $p = new WC_Product_Simple();
    $p->set_name('Don'); $p->set_status('publish'); $p->set_catalog_visibility('hidden'); $p->set_virtual(true); $p->set_sold_individually(true);
    $p->set_tax_status('none'); $p->set_regular_price('1'); $p->set_reviews_allowed(false); $p->set_manage_stock(false);
    $id = (int) $p->save();
    if ($id) update_option(self::OPT_PRODUCT, $id, false);
    return $id;
  }
  private static function is_donation_product($product) { return $product && (int) $product->get_id() === (int) get_option(self::OPT_PRODUCT); }

  // ---------- Ajout au panier (formulaire sans JavaScript obligatoire : POST classique) ----------
  public static function add() {
    nocache_headers();
    $back = wp_get_referer() ?: home_url('/');
    $fail = function ($code) use ($back) { wp_safe_redirect(add_query_arg('cvd_err', sanitize_key($code), remove_query_arg('cvd_err', $back)) . '#cvd'); exit; };
    if (!self::mode_on()) $fail('cvd_off');
    $src = isset($_SERVER['HTTP_ORIGIN']) ? (string) wp_unslash($_SERVER['HTTP_ORIGIN']) : (isset($_SERVER['HTTP_REFERER']) ? (string) wp_unslash($_SERVER['HTTP_REFERER']) : '');
    $v = CVD_Front::validate(wp_unslash($_POST), $src);   // mêmes contrôles que le mode direct : origine, champ piège, débit, montant, cagnotte
    if (is_wp_error($v)) $fail($v->get_error_code());
    $pid = self::product_id(); if (!$pid) $fail('cvd_cart');
    if (function_exists('wc_load_cart')) wc_load_cart();   // initialise session et panier pour un visiteur
    if (!WC()->cart) $fail('cvd_cart');
    foreach (WC()->cart->get_cart() as $key => $it) if (isset($it['cvd'])) WC()->cart->remove_cart_item($key);   // un seul don à la fois
    $added = WC()->cart->add_to_cart($pid, 1, 0, [], ['cvd' => ['campaign' => (int) $v['cid'], 'cents' => (int) $v['cents'], 'name' => $v['name'], 'message' => $v['msg'], 'anon' => $v['anon'] ? 1 : 0]]);
    if (!$added) $fail('cvd_cart');
    wp_safe_redirect(wc_get_checkout_url()); exit;
  }

  /** Le prix et le libellé viennent des données du panier, jamais du navigateur au moment du paiement. */
  public static function price_cart($cart) {
    if (is_admin() && !defined('DOING_AJAX') && !defined('REST_REQUEST')) return;
    foreach ($cart->get_cart() as $it) {
      if (empty($it['cvd']) || !is_array($it['cvd'])) continue;
      $c = (int) ($it['cvd']['cents'] ?? 0); if ($c < 100 || $c > CVD_Util::MAX_CENTS) continue;
      $camp = !empty($it['cvd']['campaign']) ? CVD_Campaigns::get((int) $it['cvd']['campaign']) : null;
      $it['data']->set_price($c / 100);
      $it['data']->set_name('Don — ' . ($camp ? $camp['title'] : get_bloginfo('name')));
    }
  }
  public static function single($yes, $product) { return self::is_donation_product($product) ? true : $yes; }

  public static function line_meta($item, $cart_key, $values) {
    if (empty($values['cvd']) || !is_array($values['cvd'])) return;
    $d = $values['cvd'];
    $item->add_meta_data('_cvd_cents', (int) ($d['cents'] ?? 0), true); $item->add_meta_data('_cvd_campaign', (int) ($d['campaign'] ?? 0), true);
    $item->add_meta_data('_cvd_name', (string) ($d['name'] ?? ''), true); $item->add_meta_data('_cvd_message', (string) ($d['message'] ?? ''), true); $item->add_meta_data('_cvd_anon', !empty($d['anon']) ? '1' : '0', true);
  }

  // ---------- Enregistrement des dons ----------
  public static function on_status($order_id, $from, $to) {
    if ($to === 'processing' || $to === 'completed') { $o = wc_get_order($order_id); if ($o) self::record($o); }
    elseif ($to === 'refunded' || $to === 'cancelled' || $to === 'failed') CVD_DB::mark_refunded((int) $order_id);
  }

  public static function record($order) {
    foreach ($order->get_items() as $it) {
      if ($it->get_meta('_cvd_cents') === '' || $it->get_meta('_cvd_cents') === null) continue;   // ligne qui n'est pas un don
      if ($order->get_currency() !== 'USD') { $order->add_order_note('Don non enregistré : la commande n’est pas en USD.'); return; }
      $cents = (int) round(((float) $it->get_total()) * 100);   // montant réellement facturé, pas celui du formulaire
      if ($cents < 100 || $cents > CVD_Util::MAX_CENTS) { $order->add_order_note('Don non enregistré : montant hors limites.'); return; }
      $anon = $it->get_meta('_cvd_anon') === '1';
      $name = (string) $it->get_meta('_cvd_name'); if ($name === '') $name = (string) $order->get_billing_first_name();
      $id = CVD_DB::insert_order($order->get_id(), ['campaign_id' => absint($it->get_meta('_cvd_campaign')), 'amount_cents' => $cents,
        'donor_name' => mb_substr(sanitize_text_field($name), 0, 120), 'donor_email' => mb_substr(sanitize_email((string) $order->get_billing_email()), 0, 190),
        'message' => mb_substr(sanitize_textarea_field((string) $it->get_meta('_cvd_message')), 0, 500), 'anonymous' => $anon]);
      if ($id) { $order->add_order_note('Don enregistré dans Dons Coinvera (#' . $id . ').'); do_action('cvd_donation_confirmed', $id); }
      return;   // un seul don par commande
    }
  }
}
