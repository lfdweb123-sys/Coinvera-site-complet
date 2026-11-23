<?php
if (!defined('ABSPATH')) exit;

/**
 * « Panier abandonné » = commande WooCommerce créée (statut 'pending'/'on-hold') dont le paiement n'a jamais abouti.
 * WooCommerce crée déjà cette commande au moment du checkout, avec le téléphone de facturation : on relance celle-ci
 * plutôt que de suivre le panier avant commande (ce qui demanderait un script de suivi du panier, hors du périmètre
 * d'un plugin « léger »). Compatible HPOS : uniquement l'API objet WC_Order.
 */
final class CVR_Woo {
  const META_CONSENT = '_cvr_whatsapp_consent';
  const STATUS_LABELS = ['pending' => 'en attente de paiement', 'processing' => 'en cours de traitement', 'on-hold' => 'en attente', 'completed' => 'terminée', 'cancelled' => 'annulée', 'refunded' => 'remboursée', 'failed' => 'échouée'];

  public static function present() { return class_exists('WooCommerce'); }

  public static function init() {
    if (!self::present()) return;
    // Consentement marketing (checkout classique) : nécessaire pour la relance panier, catégorisée « marketing » par Meta.
    add_action('woocommerce_after_checkout_billing_form', [__CLASS__, 'render_consent_classic']);
    add_action('woocommerce_checkout_update_order_meta', [__CLASS__, 'save_consent_classic']);
    // Checkout en blocs : API d'extension officielle, disponible à partir de WooCommerce 8.6 environ. Absente sur une
    // version plus ancienne -> la case n'apparaît que sur le checkout classique (vérifiez l'affichage selon votre version).
    add_action('woocommerce_init', [__CLASS__, 'register_consent_block']);
    add_action('woocommerce_order_status_changed', [__CLASS__, 'on_status'], 10, 3);
  }

  // ---------- Consentement ----------
  public static function render_consent_classic($checkout) {
    if (!CVR_Settings::cart_enabled() || !CVR_Settings::consent_required()) return;
    woocommerce_form_field(self::META_CONSENT, ['type' => 'checkbox', 'label' => esc_html__('J’accepte de recevoir un rappel par WhatsApp si ma commande reste en attente de paiement.', 'coinvera-reminders'), 'required' => false], $checkout->get_value(self::META_CONSENT));
  }
  public static function save_consent_classic($order_id) {
    if (!empty($_POST[self::META_CONSENT])) update_post_meta($order_id, self::META_CONSENT, 'yes');   // écriture directe compatible HPOS : WooCommerce redirige ce post meta vers la table des commandes si HPOS est actif
  }
  public static function register_consent_block() {
    if (!function_exists('woocommerce_register_additional_checkout_field') || !CVR_Settings::cart_enabled() || !CVR_Settings::consent_required()) return;
    woocommerce_register_additional_checkout_field(['id' => 'coinvera-reminders/whatsapp-consent', 'label' => __('J’accepte de recevoir un rappel par WhatsApp si ma commande reste en attente de paiement.', 'coinvera-reminders'), 'location' => 'contact', 'type' => 'checkbox', 'required' => false]);
  }
  private static function has_consent($order) {
    $v = $order->get_meta(self::META_CONSENT); if ($v === '') $v = $order->get_meta('coinvera-reminders/whatsapp-consent');   // emplacement du champ bloc
    return $v === 'yes' || $v === '1' || $v === true;
  }

  // ---------- Relance panier (commandes restées en attente) ----------
  public static function scan_pending_orders() {
    if (!CVR_Settings::enabled() || !CVR_Settings::cart_enabled() || !CVR_API::licensed()) return;
    $before = gmdate('Y-m-d H:i:s', time() - CVR_Settings::cart_delay_seconds());
    $ids = wc_get_orders(['status' => ['wc-pending', 'wc-on-hold'], 'date_created' => '<' . strtotime($before), 'limit' => 50, 'return' => 'ids', 'orderby' => 'date', 'order' => 'ASC']);
    foreach ($ids as $id) { $o = wc_get_order($id); if ($o) self::maybe_send_cart_reminder($o); }
  }
  private static function maybe_send_cart_reminder($order) {
    if (CVR_DB::already_attempted($order->get_id(), 'cart')) return;
    if (CVR_Settings::consent_required() && !self::has_consent($order)) { CVR_DB::claim($order->get_id(), 'cart', 'skipped', 'no_consent'); return; }
    $phone = $order->get_billing_phone(); if ($phone === '') { CVR_DB::claim($order->get_id(), 'cart', 'skipped', 'no_phone'); return; }
    $r = CVR_API::send_whatsapp($phone, $order->get_billing_country(), 'cart', [get_bloginfo('name'), $order->get_checkout_payment_url()], 'cart-' . $order->get_id());
    self::record($order->get_id(), 'cart', $r);
  }

  // ---------- Notifications de statut ----------
  public static function on_status($order_id, $from, $to) {
    if (!CVR_Settings::enabled() || !CVR_Settings::status_enabled() || !in_array($to, CVR_Settings::status_list(), true)) return;
    if (!CVR_API::licensed()) return;
    $order = wc_get_order($order_id); if (!$order) return;
    if (CVR_DB::already_attempted($order_id, 'status_' . $to)) return;
    $phone = $order->get_billing_phone(); if ($phone === '') { CVR_DB::claim($order_id, 'status_' . $to, 'skipped', 'no_phone'); return; }
    // Notification transactionnelle liée à une commande en cours : considérée « utilitaire » par Meta, pas « marketing »
    // (contrairement à la relance panier) -> pas de case de consentement dédiée nécessaire ici.
    $label = self::STATUS_LABELS[$to] ?? $to;
    $r = CVR_API::send_whatsapp($phone, $order->get_billing_country(), 'status', [get_bloginfo('name'), $order->get_order_number(), $label], 'status-' . $order_id . '-' . $to);
    self::record($order_id, 'status_' . $to, $r);
  }

  private static function record($order_id, $kind, $r) {
    if (is_wp_error($r)) { CVR_DB::claim($order_id, $kind, 'failed', substr((string) $r->get_error_code(), 0, 30)); return; }
    $code = $r['code'] ?? 0; $data = $r['data'] ?? [];
    if ($code >= 200 && $code < 300 && !empty($data['sent'])) CVR_DB::claim($order_id, $kind, 'sent');
    elseif ($code >= 200 && $code < 300 && !empty($data['simulated'])) CVR_DB::claim($order_id, $kind, 'skipped', 'test_mode');
    else CVR_DB::claim($order_id, $kind, 'failed', is_string($data['error'] ?? null) ? substr($data['error'], 0, 30) : 'http_' . $code);
  }
}
