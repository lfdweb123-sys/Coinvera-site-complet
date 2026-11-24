<?php
if (!defined('ABSPATH')) exit;

/**
 * Commandes « paiement à la livraison » :
 *  1. À la création, la commande passe en attente (on-hold) et le client reçoit un message WhatsApp avec un lien de
 *     confirmation. Une page de confirmation avec deux boutons (Confirmer / Ce n'est pas moi) évite qu'un aperçu de
 *     lien automatique de WhatsApp ne confirme à la place du client.
 *  2. Confirmée -> la commande passe en traitement et peut être expédiée. Refusée ou sans réponse dans le délai -> annulée.
 *  3. Le score de fiabilité du client (voir CVC_Score) retire l'option COD au checkout s'il est sous le seuil.
 * Compatible HPOS : uniquement l'API objet WC_Order.
 */
final class CVC_Woo {
  const M_STATE = '_cvc_state';      // awaiting | confirmed | manual | declined | expired
  const M_SENT = '_cvc_sent_at';
  const M_SENDS = '_cvc_sends';
  const M_OUT = '_cvc_outcome';      // delivered | refused (une seule fois par commande)
  const STATES = ['awaiting' => 'En attente de confirmation', 'confirmed' => 'Confirmée par le client', 'manual' => 'Confirmée par téléphone', 'declined' => 'Refusée par le client', 'expired' => 'Sans réponse dans le délai'];

  public static function present() { return class_exists('WooCommerce'); }

  public static function init() {
    if (!self::present()) return;
    add_filter('woocommerce_available_payment_gateways', [__CLASS__, 'filter_gateways']);
    add_action('woocommerce_after_checkout_validation', [__CLASS__, 'validate_classic'], 10, 2);
    // Checkout en blocs : même contrôle via la Store API (WooCommerce 8+).
    if (class_exists('Automattic\\WooCommerce\\StoreApi\\Exceptions\\RouteException')) add_action('woocommerce_store_api_checkout_order_processed', [__CLASS__, 'validate_blocks'], 5);
    add_action('woocommerce_order_status_changed', [__CLASS__, 'on_status'], 10, 3);
    add_action('template_redirect', [__CLASS__, 'handle_link']);
    add_filter('woocommerce_order_actions', [__CLASS__, 'order_actions']);
    add_action('woocommerce_order_action_cvc_resend', [__CLASS__, 'action_resend']);
    add_action('woocommerce_order_action_cvc_manual', [__CLASS__, 'action_manual']);
    add_action('woocommerce_order_action_cvc_refused', [__CLASS__, 'action_refused']);
    add_action('woocommerce_admin_order_data_after_billing_address', [__CLASS__, 'admin_box']);
  }

  public static function is_cod($order) { return $order instanceof WC_Order && in_array($order->get_payment_method(), CVC_Settings::gateways(), true); }
  private static function active() { return CVC_Settings::enabled() && CVC_API::licensed(); }

  // ---------- Score : contrôle au checkout ----------
  private static function score_message() {
    return apply_filters('cvc_score_message', 'Le paiement à la livraison n’est pas disponible pour cette commande. Merci de choisir un moyen de paiement en ligne ou de nous contacter.');
  }

  /** Retire le(s) mode(s) de paiement à la livraison quand le client (déjà connu) est sous le seuil de fiabilité. */
  public static function filter_gateways($gws) {
    if ((is_admin() && !wp_doing_ajax()) || !is_array($gws) || !CVC_Settings::enabled() || !CVC_Settings::score_enabled()) return $gws;
    $post = [];
    if (!empty($_POST['post_data']) && is_string($_POST['post_data'])) parse_str(wp_unslash($_POST['post_data']), $post);   // phpcs:ignore WordPress.Security.NonceVerification
    $phone = isset($post['billing_phone']) ? sanitize_text_field((string) $post['billing_phone']) : '';
    $email = isset($post['billing_email']) ? sanitize_email((string) $post['billing_email']) : '';
    if (($phone === '' || $email === '') && function_exists('WC') && WC()->customer) {
      if ($phone === '') $phone = (string) WC()->customer->get_billing_phone();
      if ($email === '') $email = (string) WC()->customer->get_billing_email();
    }
    if ($phone === '' && $email === '') return $gws;
    if (!CVC_Score::allowed($phone, $email)) foreach (CVC_Settings::gateways() as $id) unset($gws[$id]);
    return $gws;
  }

  /** Dernier filet de sécurité : un client sous le seuil ne peut pas passer commande en COD même si l'option est restée affichée. */
  public static function validate_classic($data, $errors) {
    if (!CVC_Settings::enabled() || !CVC_Settings::score_enabled() || !in_array((string) ($data['payment_method'] ?? ''), CVC_Settings::gateways(), true)) return;
    $phone = (string) ($data['billing_phone'] ?? ''); $email = isset($data['billing_email']) ? sanitize_email($data['billing_email']) : '';
    if (CVC_Score::allowed($phone, $email)) return;
    $errors->add('cvc_score', self::score_message()); CVC_DB::log(0, 'score_block', 'blocked', 'low_score');
  }
  public static function validate_blocks($order) {
    if (!self::is_cod($order) || !CVC_Settings::enabled() || !CVC_Settings::score_enabled()) return;
    if (CVC_Score::allowed($order->get_billing_phone(), $order->get_billing_email())) return;
    CVC_DB::log($order->get_id(), 'score_block', 'blocked', 'low_score');
    throw new \Automattic\WooCommerce\StoreApi\Exceptions\RouteException('cvc_score', esc_html(self::score_message()), 400);
  }

  // ---------- Confirmation ----------
  public static function on_status($order_id, $from, $to) {
    $order = wc_get_order($order_id); if (!self::is_cod($order) || !CVC_Settings::enabled()) return;
    $state = (string) $order->get_meta(self::M_STATE);
    // Création depuis le checkout public uniquement (pending -> traitement/attente par la passerelle COD) ; jamais une commande saisie à la main dans l'administration.
    if ($state === '' && in_array($from, ['pending', 'checkout-draft'], true) && in_array($to, ['processing', 'on-hold'], true) && !is_admin() && CVC_Settings::confirm_enabled() && CVC_API::licensed()) { self::begin($order); return; }
    if ($to === 'completed' && $state !== 'declined' && (string) $order->get_meta(self::M_OUT) === '') {   // livrée et encaissée
      $order->update_meta_data(self::M_OUT, 'delivered'); $order->save();
      CVC_Score::record($order->get_billing_phone(), $order->get_billing_email(), 'delivered'); CVC_DB::log($order_id, 'delivered', 'ok');
    }
  }

  private static function begin($order) {
    $order->update_meta_data(self::M_STATE, 'awaiting'); $order->update_meta_data(self::M_SENT, time()); $order->save();   // état posé avant le changement de statut : évite toute boucle
    if ($order->get_status() !== 'on-hold') $order->update_status('on-hold', 'Coinvera COD : en attente de la confirmation du client.');
    self::send_confirmation($order);
  }

  public static function token($order) { return substr(hash_hmac('sha256', $order->get_id() . '|' . $order->get_order_key(), wp_salt('auth') . 'cvc-link'), 0, 32); }
  public static function link($order) { return add_query_arg(['cvc_order' => $order->get_id(), 'cvc_k' => self::token($order)], home_url('/')); }

  private static function send_confirmation($order) {
    $id = $order->get_id(); $phone = $order->get_billing_phone();
    if ($phone === '') { CVC_DB::log($id, 'sent', 'skipped', 'no_phone'); $order->add_order_note('Coinvera COD : aucun numéro de téléphone, confirmation à faire par vos soins.'); return; }
    $n = (int) $order->get_meta(self::M_SENDS); $order->update_meta_data(self::M_SENDS, $n + 1); $order->save();
    $r = CVC_API::send_whatsapp($phone, $order->get_billing_country(), 'cod', [get_bloginfo('name'), $order->get_order_number(), self::link($order)], "cod-$id-$n");
    if (is_wp_error($r)) { CVC_DB::log($id, 'sent', 'failed', substr((string) $r->get_error_code(), 0, 30)); $order->add_order_note('Coinvera COD : envoi WhatsApp impossible. Utilisez « Renvoyer » ou confirmez par téléphone.'); return; }
    $code = (int) ($r['code'] ?? 0); $d = is_array($r['data'] ?? null) ? $r['data'] : [];
    if ($code >= 200 && $code < 300 && !empty($d['sent'])) { CVC_DB::log($id, 'sent', 'sent'); $order->add_order_note('Coinvera COD : demande de confirmation envoyée par WhatsApp.'); }
    elseif ($code >= 200 && $code < 300 && !empty($d['simulated'])) { CVC_DB::log($id, 'sent', 'skipped', 'test_mode'); $order->add_order_note('Coinvera COD : mode test, aucun message réel envoyé.'); }
    else { CVC_DB::log($id, 'sent', 'failed', is_string($d['error'] ?? null) ? substr($d['error'], 0, 30) : 'http_' . $code); $order->add_order_note('Coinvera COD : envoi WhatsApp refusé. Utilisez « Renvoyer » ou confirmez par téléphone.'); }
  }

  /** Page ouverte depuis le lien WhatsApp. GET = simple affichage ; seule une requête POST modifie la commande. */
  public static function handle_link() {
    if (!isset($_GET['cvc_order'], $_GET['cvc_k'])) return;   // phpcs:ignore WordPress.Security.NonceVerification
    nocache_headers(); header('X-Robots-Tag: noindex, nofollow'); header('Referrer-Policy: no-referrer');
    $order = wc_get_order(absint($_GET['cvc_order'])); $k = sanitize_text_field(wp_unslash((string) $_GET['cvc_k']));   // phpcs:ignore WordPress.Security.NonceVerification
    if (!self::is_cod($order) || !hash_equals(self::token($order), $k)) self::page('Lien invalide', 'Ce lien n’est pas valide ou a expiré.', null, 404);
    $state = (string) $order->get_meta(self::M_STATE);
    if ($state !== 'awaiting') {
      $msg = ['confirmed' => 'Votre commande est déjà confirmée. Merci !', 'manual' => 'Votre commande est déjà confirmée. Merci !', 'declined' => 'Cette commande a été annulée à votre demande.', 'expired' => 'Le délai de confirmation est dépassé. Contactez la boutique si vous souhaitez toujours cette commande.'][$state] ?? 'Cette commande ne nécessite aucune confirmation.';
      self::page('Commande #' . $order->get_order_number(), $msg, null);
    }
    if (isset($_SERVER['REQUEST_METHOD']) && $_SERVER['REQUEST_METHOD'] === 'POST') {
      $act = isset($_POST['cvc_action']) ? sanitize_key(wp_unslash((string) $_POST['cvc_action'])) : '';   // phpcs:ignore WordPress.Security.NonceVerification -- le jeton signé du lien tient lieu de nonce (visiteur non connecté)
      if ($act === 'confirm') { self::set_confirmed($order, 'confirmed', 'Confirmée par le client via WhatsApp.'); self::page('Merci !', 'Votre commande est confirmée. Elle va être préparée.', null); }
      if ($act === 'decline') {
        $order->update_meta_data(self::M_STATE, 'declined'); $order->save();
        CVC_Score::record($order->get_billing_phone(), $order->get_billing_email(), 'unconfirmed'); CVC_DB::log($order->get_id(), 'declined', 'ok');
        $order->update_status('cancelled', 'Coinvera COD : refusée par le client (« ce n’est pas moi »).');
        self::page('Commande annulée', 'Votre commande a été annulée. Aucun paiement n’est dû.', null);
      }
    }
    $form = '<form method="post"><button name="cvc_action" value="confirm" style="width:100%;padding:14px;border:0;border-radius:10px;background:#16a34a;color:#fff;font-size:16px;cursor:pointer">Oui, je confirme ma commande</button>'
      . '<button name="cvc_action" value="decline" style="width:100%;margin-top:10px;padding:14px;border:1px solid #d1d5db;border-radius:10px;background:#fff;color:#374151;font-size:16px;cursor:pointer">Non, ce n’est pas moi</button></form>';
    $total = wp_strip_all_tags(wc_price($order->get_total(), ['currency' => $order->get_currency()]));
    self::page('Confirmer la commande #' . $order->get_order_number(), 'Boutique : ' . get_bloginfo('name') . ' — total à payer à la livraison : ' . html_entity_decode($total, ENT_QUOTES, 'UTF-8'), $form);
  }

  private static function page($title, $msg, $form_html, $status = 200) {
    status_header($status);
    echo '<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>' . esc_html($title) . '</title></head>'
      . '<body style="font-family:system-ui,sans-serif;background:#f3f4f6;margin:0;padding:24px"><div style="max-width:420px;margin:40px auto;background:#fff;border-radius:14px;padding:24px;box-shadow:0 2px 10px rgba(0,0,0,.08)">'
      . '<h1 style="font-size:20px;margin:0 0 12px">' . esc_html($title) . '</h1><p style="color:#4b5563;line-height:1.5;margin:0 0 18px">' . esc_html($msg) . '</p>' . ($form_html ?: '') . '</div></body></html>';
    exit;
  }

  private static function set_confirmed($order, $state, $note) {
    $order->update_meta_data(self::M_STATE, $state); $order->save();
    CVC_DB::log($order->get_id(), 'confirmed', 'ok', $state === 'manual' ? 'phone' : '');
    $order->update_status('processing', 'Coinvera COD : ' . $note);
  }

  /** Cron : commandes restées sans confirmation au-delà du délai réglé. */
  public static function scan_expired() {
    if (!CVC_Settings::enabled()) return;
    $ids = wc_get_orders(['status' => ['wc-on-hold'], 'meta_query' => [['key' => self::M_STATE, 'value' => 'awaiting']], 'limit' => 50, 'return' => 'ids', 'orderby' => 'date', 'order' => 'ASC']);
    foreach ($ids as $id) {
      $o = wc_get_order($id); if (!$o || time() - (int) $o->get_meta(self::M_SENT) < CVC_Settings::expiry_seconds()) continue;
      $o->update_meta_data(self::M_STATE, 'expired'); $o->save();
      CVC_Score::record($o->get_billing_phone(), $o->get_billing_email(), 'unconfirmed'); CVC_DB::log($id, 'expired', 'ok');
      if (CVC_Settings::cancel_on_expire()) $o->update_status('cancelled', 'Coinvera COD : non confirmée dans le délai, commande annulée.');
      else $o->add_order_note('Coinvera COD : délai de confirmation dépassé. La commande reste en attente, à vous de décider.');
    }
  }

  // ---------- Actions manuelles (écran de commande) ----------
  public static function order_actions($a) {
    global $theorder; if (!self::is_cod($theorder)) return $a;
    $state = (string) $theorder->get_meta(self::M_STATE); $out = (string) $theorder->get_meta(self::M_OUT);
    if ($state === 'awaiting') $a['cvc_resend'] = 'Coinvera COD : renvoyer la demande de confirmation';
    if (in_array($state, ['awaiting', 'expired'], true)) $a['cvc_manual'] = 'Coinvera COD : marquer confirmée (par téléphone)';
    if (in_array($state, ['confirmed', 'manual'], true) && $out === '') $a['cvc_refused'] = 'Coinvera COD : colis refusé à la livraison (baisse le score du client)';
    return $a;
  }
  public static function action_resend($order) { if (self::is_cod($order) && $order->get_meta(self::M_STATE) === 'awaiting' && CVC_API::licensed()) self::send_confirmation($order); }
  public static function action_manual($order) { if (self::is_cod($order) && in_array($order->get_meta(self::M_STATE), ['awaiting', 'expired'], true)) self::set_confirmed($order, 'manual', 'confirmée par téléphone par le marchand.'); }
  public static function action_refused($order) {
    if (!self::is_cod($order) || (string) $order->get_meta(self::M_OUT) !== '') return;
    $order->update_meta_data(self::M_OUT, 'refused'); $order->save();
    CVC_Score::record($order->get_billing_phone(), $order->get_billing_email(), 'refused'); CVC_DB::log($order->get_id(), 'refused', 'ok');
    $order->update_status('cancelled', 'Coinvera COD : colis refusé à la livraison.');
  }

  public static function admin_box($order) {
    if (!self::is_cod($order)) return;
    $state = (string) $order->get_meta(self::M_STATE); $score = CVC_Score::for_customer($order->get_billing_phone(), $order->get_billing_email());
    echo '<p><strong>Coinvera COD :</strong> ' . esc_html(self::STATES[$state] ?? 'Non soumise à confirmation') . '<br><strong>Fiabilité du client :</strong> ' . ($score === null ? 'nouveau client' : (int) $score . ' / 100') . '</p>';
  }
}
