<?php
if (!defined('ABSPATH')) exit;

/**
 * Hooks WooCommerce. Deux chemins de checkout existent côté WooCommerce (formulaire classique et blocs panier/paiement
 * basés sur la Store API) : les deux sont couverts séparément, le reste de la logique (CVG_Rules) étant partagé.
 * Compatible HPOS : uniquement l'API objet WC_Order, jamais get_post_meta / update_post_meta.
 */
final class CVG_Woo {
  public static function present() { return class_exists('WooCommerce'); }

  public static function init() {
    if (!self::present()) return;
    add_action('woocommerce_after_checkout_validation', [__CLASS__, 'validate_classic'], 10, 2);
    // Point de validation équivalent côté checkout en blocs (Store API) : disponible à partir de WooCommerce 8+.
    // Absent sur une installation plus ancienne -> on se limite au suivi par 'woocommerce_checkout_order_processed' ci-dessous.
    if (class_exists('Automattic\\WooCommerce\\StoreApi\\Exceptions\\RouteException')) add_action('woocommerce_store_api_checkout_order_processed', [__CLASS__, 'validate_blocks'], 5);
    add_action('woocommerce_checkout_order_processed', [__CLASS__, 'tag_order']);
    add_action('woocommerce_store_api_checkout_order_processed', [__CLASS__, 'tag_order'], 20);   // après la validation (priorité 5) : seules les commandes non bloquées sont marquées
    add_action('woocommerce_order_status_changed', [__CLASS__, 'on_status'], 10, 3);
  }

  private static function message() {
    return apply_filters('cvg_block_message', 'Nous n’avons pas pu valider votre commande pour le moment. Merci de réessayer dans quelques minutes ou de nous contacter si le problème persiste.');
  }

  /** Checkout classique : rejet avant même la création de la commande. */
  public static function validate_classic($data, $errors) {
    $ip = CVG_Util::ip(); $email = isset($data['billing_email']) ? sanitize_email($data['billing_email']) : '';
    $r = CVG_Rules::evaluate('checkout', $ip, $email);
    if ($r['action'] === 'block') { $errors->add('cvg_blocked', self::message()); CVG_DB::log('checkout', 'blocked', $r['reason'], $ip, $email); }
    elseif ($r['action'] === 'flag') CVG_DB::log('checkout', 'flagged', $r['reason'], $ip, $email);
  }

  /** Checkout en blocs : la commande (brouillon) existe déjà à ce stade: on rejette en levant une RouteException,
   *  que la Store API transforme en réponse d'erreur côté client sans jamais finaliser le paiement. */
  public static function validate_blocks($order) {
    if (!($order instanceof WC_Order)) return;
    $ip = CVG_Util::ip(); $email = $order->get_billing_email();
    $r = CVG_Rules::evaluate('checkout', $ip, $email);
    if ($r['action'] === 'block') {
      CVG_DB::log('checkout', 'blocked', $r['reason'], $ip, $email, $order->get_id());
      throw new \Automattic\WooCommerce\StoreApi\Exceptions\RouteException('cvg_blocked', esc_html(self::message()), 400);
    }
    if ($r['action'] === 'flag') CVG_DB::log('checkout', 'flagged', $r['reason'], $ip, $email, $order->get_id());
  }

  /** Mémorise l'IP sur la commande (API objet, compatible HPOS) pour pouvoir relier un échec de paiement ultérieur à sa source. */
  public static function tag_order($order) {
    if (is_numeric($order)) $order = wc_get_order($order);
    if (!($order instanceof WC_Order) || $order->get_meta('_cvg_ip') !== '') return;
    $order->update_meta_data('_cvg_ip', CVG_Util::ip());
    $order->save();
  }

  public static function on_status($order_id, $from, $to) {
    $order = wc_get_order($order_id); if (!$order) return;
    $ip = (string) $order->get_meta('_cvg_ip'); if (!filter_var($ip, FILTER_VALIDATE_IP)) return;
    if ($to === 'failed') {
      CVG_Rules::record_failure($ip);
      CVG_DB::log('payment', 'flagged', 'payment_failed', $ip, $order->get_billing_email(), $order->get_id());
    } elseif (in_array($to, ['processing', 'completed'], true)) {
      CVG_Rules::clear_failures($ip);
    }
  }
}
